import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../src/index.mjs';

const meta = { correlationId: 'merge-test', actorId: 'SUP-001' };

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'vems-merge-'));
  let n = 0;
  const s = new OrchestrationService({ dbPath: join(dir, 'db.sqlite'), openemr: { createPatient: async () => ({ patient_id: `provisional-${++n}` }) } });
  t.after(() => { s.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const incident = await s.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'medical_emergency', priority: 'critical', description: 'Synthetic', address: 'Test scene', patient_count: 2 } }, meta);
  const reconciledCase = async (verifiedId) => {
    const c = await s.createPatientCase(incident.incident_id, { temporary_label: 'Unknown patient' }, { ...meta, idempotencyKey: `k-${verifiedId}` });
    await s.createProvisionalPatientForCase(c.patient_case_id, meta);
    await s.reconcilePatientCaseIdentity(c.patient_case_id, { verified_patient_id: verifiedId, reason: 'Identified at hospital' }, meta);
    return c.patient_case_id;
  };
  return { s, reconciledCase, incident };
}

test('a reconciliation waits on the pending-merge worklist until an administrator confirms the merge', async (t) => {
  const { s, reconciledCase, incident } = await fixture(t);
  const first = await reconciledCase('verified-A');
  const second = await reconciledCase('verified-B');

  const pending = await s.listPendingIdentityMerges();
  assert.deepEqual(pending.map((p) => [p.patient_case_id, p.provisional_patient_id, p.verified_patient_id]), [[first, 'provisional-1', 'verified-A'], [second, 'provisional-2', 'verified-B']]);
  assert.equal(pending[0].incident_id, incident.incident_id);
  assert.equal(pending[0].reason, 'Identified at hospital');
  assert.equal((await s.getPatientCase(first)).identity_merge_pending, true);

  const done = await s.confirmIdentityMerge(first, { verified_patient_id: 'verified-A', note: 'Merged in OpenEMR Merge Patients' }, meta);
  assert.equal(done.merged_by, 'SUP-001');
  assert.equal(done.merge_note, 'Merged in OpenEMR Merge Patients');
  assert.ok(done.merged_at);
  assert.deepEqual((await s.listPendingIdentityMerges()).map((p) => p.patient_case_id), [second]);
  const after = await s.getPatientCase(first);
  assert.equal(after.identity_merge_pending, false);
  assert.equal(after.identity_reconciliations[0].merged_at, done.merged_at);
  assert.equal((await s.getPatientCase(second)).identity_merge_pending, true);
});

test('confirming a merge is idempotent, audited once, and validated', async (t) => {
  const { s, reconciledCase } = await fixture(t);
  const id = await reconciledCase('verified-A');
  await assert.rejects(() => s.confirmIdentityMerge(id, { verified_patient_id: 'verified-A' }, meta), /note is required/);
  await assert.rejects(() => s.confirmIdentityMerge(id, { verified_patient_id: 'verified-A', note: '   ' }, meta), /note is required/);
  await assert.rejects(() => s.confirmIdentityMerge(id, { note: 'x' }, meta), /verified_patient_id is required/);
  await assert.rejects(() => s.confirmIdentityMerge(id, { verified_patient_id: 'someone-else', note: 'x' }, meta), /No identity reconciliation/);
  assert.equal((await s.listPendingIdentityMerges()).length, 1, 'rejected confirmations change nothing');

  const one = await s.confirmIdentityMerge(id, { verified_patient_id: 'verified-A', note: 'first' }, meta);
  const two = await s.confirmIdentityMerge(id, { verified_patient_id: 'verified-A', note: 'second' }, { ...meta, actorId: 'SUP-002' });
  assert.equal(two.merged_at, one.merged_at);
  assert.equal(two.merge_note, 'first');
  assert.equal(two.merged_by, 'SUP-001');
  const audits = await s.db.queryAll("SELECT actor_id FROM audit_logs WHERE action='confirm_identity_merge';");
  assert.equal(audits.length, 1);
});

test('an unreconciled case has no pending merge', async (t) => {
  const { s, incident } = await fixture(t);
  const c = await s.createPatientCase(incident.incident_id, {}, { ...meta, idempotencyKey: 'plain' });
  assert.equal((await s.getPatientCase(c.patient_case_id)).identity_merge_pending, false);
  assert.deepEqual(await s.listPendingIdentityMerges(), []);
});

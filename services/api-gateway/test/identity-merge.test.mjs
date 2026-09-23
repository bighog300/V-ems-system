import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../../orchestration/src/index.mjs';
import { createApp } from '../src/server.mjs';

test('the pending identity merge worklist and its confirmation are supervisor-only HTTP contracts', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-merge-api-'));
  const s = new OrchestrationService({ dbPath: join(dir, 'test.sqlite'), openemr: { createPatient: async () => ({ patient_id: 'provisional-1' }) } });
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = 'true';
  const server = createApp(s);
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); s.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', payload, role = 'supervisor') => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-user-role': role, 'x-actor-id': 'SUP-001' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const meta = { correlationId: 'http-merge' };
  const incident = await s.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'medical_emergency', priority: 'critical', description: 'Synthetic', address: 'Test scene', patient_count: 1 } }, meta);
  const c = await s.createPatientCase(incident.incident_id, { temporary_label: 'Unknown' }, { ...meta, idempotencyKey: 'k' });
  await s.createProvisionalPatientForCase(c.patient_case_id, meta);
  const id = c.patient_case_id;
  assert.equal((await request(`/api/patient-cases/${id}/identity-reconciliation`, 'POST', { verified_patient_id: 'verified-1', reason: 'Identified' })).status, 200);

  for (const role of ['field_crew', 'dispatcher', 'clinical_reviewer']) {
    assert.equal((await request('/api/support/pending-identity-merges', 'GET', undefined, role)).status, 403, `${role} cannot read the worklist`);
    assert.equal((await request(`/api/patient-cases/${id}/identity-merge`, 'POST', { verified_patient_id: 'verified-1', note: 'x' }, role)).status, 403, `${role} cannot confirm`);
  }
  const list = await request('/api/support/pending-identity-merges');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.pending_merges.map((p) => [p.patient_case_id, p.provisional_patient_id, p.verified_patient_id]), [[id, 'provisional-1', 'verified-1']]);
  assert.equal((await request(`/api/patient-cases/${id}`)).body.identity_merge_pending, true);

  assert.equal((await request(`/api/patient-cases/${id}/identity-merge`, 'POST', { verified_patient_id: 'verified-1' })).status, 400);
  const confirmed = await request(`/api/patient-cases/${id}/identity-merge`, 'POST', { verified_patient_id: 'verified-1', note: 'Merged in OpenEMR' }, 'sys_admin');
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.merge_note, 'Merged in OpenEMR');
  assert.deepEqual((await request('/api/support/pending-identity-merges')).body.pending_merges, []);
  assert.equal((await request(`/api/patient-cases/${id}`)).body.identity_merge_pending, false);
});

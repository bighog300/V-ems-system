import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../src/index.mjs';

const meta = { correlationId: 'retry-test' };
const notSent = () => Object.assign(new Error('openemr.write not attempted: OpenEMR is unreachable'), { code: 'DOWNSTREAM_UNAVAILABLE', notSent: true });
// The OpenEMR client wraps the transport error and keeps it as `cause`.
const wrappedNotSent = () => Object.assign(new Error('OpenEMR request failed'), { code: 'DOWNSTREAM_UNAVAILABLE', cause: notSent() });
const timeout = () => Object.assign(new Error('openemr.write timed out'), { code: 'DOWNSTREAM_TIMEOUT' });

// OpenEMR stand-in whose writes fail with `failure` until it is set to null; every write that reaches it is recorded.
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'vems-retry-test-'));
  const state = { failure: null, sent: [] };
  const write = (kind, reply) => async (p) => {
    if (state.failure) throw state.failure();
    state.sent.push({ kind, ...p }); return reply(p);
  };
  const s = new OrchestrationService({ dbPath: join(dir, 'db.sqlite'), openemr: {
    createPatient: async () => ({ patient_id: 'patient-1' }),
    createEncounter: async () => ({ encounter_id: 'encounter-1', status: 'Open' }),
    createObservation: write('observation', () => ({ observation_id: `obs-${state.sent.length}` })),
    createIntervention: write('intervention', () => ({ intervention_id: `int-${state.sent.length}` }))
  } });
  t.after(() => { s.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const incident = await s.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'medical_emergency', priority: 'critical', description: 'Synthetic', address: 'Test scene', patient_count: 1 } }, meta);
  const c = await s.createPatientCase(incident.incident_id, {}, { ...meta, idempotencyKey: 'c' });
  await s.linkPatientToPatientCase(c.patient_case_id, { openemr_patient_id: 'patient-1', verification_status: 'verified' }, meta);
  await s.createEncounterForPatientCase(c.patient_case_id, { care_started_at: '2026-09-06T10:01:00Z', presenting_complaint: 'x' }, { ...meta, idempotencyKey: 'e' });
  return { s, state, id: c.patient_case_id };
}
const statuses = async (s, table) => (await s.db.queryAll(`SELECT downstream_status, openemr_observation_id FROM ${table};`).catch(() => s.db.queryAll(`SELECT downstream_status, openemr_reference_id FROM ${table};`)));

test('entries charted while OpenEMR is unreachable are re-sent, once, after it recovers', async t => {
  const { s, state, id } = await fixture(t);
  state.failure = notSent;
  await s.createPatientCaseObservation(id, { vital_signs: { heart_rate_bpm: 88 }, performed_at: '2026-09-06T10:05:00Z' }, { ...meta, idempotencyKey: 'o' });
  await s.createPatientCaseMedication(id, { medication_name: 'Aspirin', dose: '300', dose_unit: 'mg', route: 'PO', performed_at: '2026-09-06T10:06:00Z' }, { ...meta, idempotencyKey: 'm' });
  await s.createPatientCaseProcedure(id, { procedure_type: 'airway', procedure_name: 'Suction', performed_at: '2026-09-06T10:07:00Z' }, { ...meta, idempotencyKey: 'p' });
  for (const table of ['clinical_observations', 'medication_administrations', 'clinical_procedures']) assert.equal((await statuses(s, table))[0].downstream_status, 'failed:DOWNSTREAM_NOT_SENT');

  // Still down: one pass stops at the first unreachable entry and leaves everything queued.
  const down = await s.retryFailedClinicalDownstream();
  assert.equal(down.created, 0); assert.equal(down.retried, 1);
  assert.equal((await statuses(s, 'clinical_procedures'))[0].downstream_status, 'failed:DOWNSTREAM_NOT_SENT');

  state.failure = null;
  const up = await s.retryFailedClinicalDownstream();
  assert.deepEqual([up.retried, up.created], [3, 3]);
  for (const table of ['clinical_observations', 'medication_administrations', 'clinical_procedures']) { const row = (await statuses(s, table))[0]; assert.equal(row.downstream_status, 'created'); assert.ok(Object.values(row)[1]); }
  const obs = state.sent.find(x => x.kind === 'observation');
  assert.equal(obs.recorded_at, '2026-09-06T10:05:00.000Z'); assert.equal(obs.patient_id, 'patient-1'); assert.equal(obs.encounter_id, 'encounter-1'); assert.equal(obs.vital_signs.heart_rate_bpm, 88);
  assert.equal(state.sent.find(x => x.name === 'Aspirin').dose, '300');

  const again = await s.retryFailedClinicalDownstream();
  assert.equal(again.retried, 0); assert.equal(state.sent.length, 3, 'nothing is sent twice');
  assert.equal((await s.db.queryAll("SELECT * FROM audit_logs WHERE action='retry_downstream';")).length, 3, 'each re-send is audited');
});

test('a not-sent marker on the wrapped cause still queues the entry for retry', async t => {
  const { s, state, id } = await fixture(t);
  state.failure = wrappedNotSent;
  await s.createPatientCaseObservation(id, { vital_signs: { heart_rate_bpm: 72 } }, { ...meta, idempotencyKey: 'o' });
  assert.equal((await statuses(s, 'clinical_observations'))[0].downstream_status, 'failed:DOWNSTREAM_NOT_SENT');
});

test('a write whose outcome is unknown is not re-sent (it could already exist in OpenEMR)', async t => {
  const { s, state, id } = await fixture(t);
  state.failure = timeout;
  await s.createPatientCaseObservation(id, { vital_signs: { heart_rate_bpm: 70 } }, { ...meta, idempotencyKey: 'o' });
  assert.equal((await statuses(s, 'clinical_observations'))[0].downstream_status, 'failed:DOWNSTREAM_TIMEOUT');
  state.failure = null;
  const r = await s.retryFailedClinicalDownstream();
  assert.equal(r.retried, 0); assert.equal(state.sent.length, 0);
  assert.equal((await statuses(s, 'clinical_observations'))[0].downstream_status, 'failed:DOWNSTREAM_TIMEOUT');
});

test('concurrent retry passes do not send the same entry twice', async t => {
  const { s, state, id } = await fixture(t);
  state.failure = notSent;
  await s.createPatientCaseObservation(id, { vital_signs: { heart_rate_bpm: 66 } }, { ...meta, idempotencyKey: 'o' });
  state.failure = null;
  await Promise.all([s.retryFailedClinicalDownstream(), s.retryFailedClinicalDownstream()]);
  assert.equal(state.sent.length, 1);
});

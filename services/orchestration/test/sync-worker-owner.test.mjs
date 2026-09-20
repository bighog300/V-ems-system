import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveVtigerOwner, runSyncWorkerService, loadSyncWorkerConfig } from '../src/sync-worker-service.mjs';

const configured = { VTIGER_BASE_URL: 'http://vtiger', VTIGER_USERNAME: 'integration', VTIGER_ACCESS_KEY: 'key' };
const clientReturning = (login, calls = []) => async () => ({ auth: { authenticate: async () => { calls.push('login'); if (login instanceof Error) throw login; return login; } } });

test('an explicitly configured owner is used and no login is made', async () => {
  const calls = [];
  const env = { ...configured, VTIGER_ASSIGNED_USER_ID: '19x7' };
  assert.equal(await resolveVtigerOwner(env, { createClient: clientReturning({ userId: '19x1' }, calls) }), '19x7');
  assert.deepEqual(calls, []);
});

test('an unset owner defaults to the integration user returned by the Vtiger login', async () => {
  const env = { ...configured };
  assert.equal(await resolveVtigerOwner(env, { createClient: clientReturning({ sessionName: 's', userId: '19x5' }) }), '19x5');
  assert.equal(env.VTIGER_ASSIGNED_USER_ID, '19x5');
});

test('nothing is guessed when Vtiger is not configured or the login carries no user id', async () => {
  const env = { VTIGER_BASE_URL: 'http://vtiger' };
  assert.equal(await resolveVtigerOwner(env, { createClient: clientReturning({ userId: '19x1' }) }), undefined);
  assert.equal(env.VTIGER_ASSIGNED_USER_ID, undefined);
  const env2 = { ...configured };
  assert.equal(await resolveVtigerOwner(env2, { createClient: clientReturning({ sessionName: 's' }) }), undefined);
  assert.equal(env2.VTIGER_ASSIGNED_USER_ID, undefined);
});

test('a failed login is surfaced so the worker can retry on its next cycle', async () => {
  await assert.rejects(() => resolveVtigerOwner({ ...configured }, { createClient: clientReturning(new Error('Vtiger unavailable')) }), /Vtiger unavailable/);
});

test('an embedded worker stops when its signal aborts and installs no process signal handlers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-worker-embed-'));
  const { OrchestrationService } = await import('../src/index.mjs');
  const db = new OrchestrationService({ dbPath: join(dir, 'db.sqlite') }).db;
  const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
  const stop = new AbortController();
  const config = { ...loadSyncWorkerConfig({ VEMS_DB_PATH: join(dir, 'db.sqlite'), SYNC_WORKER_POLL_INTERVAL_MS: '20' }) };
  const running = runSyncWorkerService({ db, config, stopSignal: stop.signal });
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')], before);
  stop.abort();
  await Promise.race([running, new Promise((_, rej) => setTimeout(() => rej(new Error('worker did not stop')), 3000))]);
  db.db?.close(); rmSync(dir, { recursive: true, force: true });
});

// Runs the real worker against a real database for a moment, with a recording stand-in for the Vtiger adapter.
async function runWorkerBriefly(t, { vtiger, seed }) {
  const { OrchestrationService } = await import('../src/index.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'vems-worker-run-'));
  const service = new OrchestrationService({ dbPath: join(dir, 'db.sqlite') });
  t.after(() => { service.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  await seed(service);
  const stop = new AbortController();
  const config = loadSyncWorkerConfig({ VEMS_DB_PATH: join(dir, 'db.sqlite'), SYNC_WORKER_POLL_INTERVAL_MS: '20' });
  const running = runSyncWorkerService({ db: service.db, config, stopSignal: stop.signal, vtiger });
  await new Promise((r) => setTimeout(r, 400));
  stop.abort(); await running;
  return service;
}
const newIncident = async (s) => { await s.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'medical_emergency', priority: 'critical', description: 'Synthetic', address: 'Test scene', patient_count: 1 } }, { correlationId: 'c' }); await s.db.execute('DELETE FROM sync_intents;'); };
const incidentLink = (status) => ({ incident_id: 'INC-000001', remote_id: '17x9', remote_number: 'TT1', external_key: 'vems:INC-000001', create_correlation_id: 'c', last_correlation_id: 'c', sync_status: status, last_error_code: null, last_synced_at: 'now', created_at: 'now', updated_at: 'now' });

test('an incident update is sent to the record the incident was mirrored to, and restores a poisoned link', async (t) => {
  const updates = [];
  const service = await runWorkerBriefly(t, {
    vtiger: { updateIncidentMirror: async (payload) => { updates.push(payload); return { remote_id: payload.id, remote_number: 'TT1', external_key: 'vems:INC-000001', outcome: 'updated' }; } },
    seed: async (s) => {
      await newIncident(s);
      await s.vtigerLinks.upsert(incidentLink('dead_lettered'));
      await s.syncIntent('incident', 'updateIncidentMirror', 'corr', { vems_incident_id: 'INC-000001', incident_id: 'INC-000001', id: undefined, ticket_title: 'x' });
    }
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, '17x9');
  assert.equal((await service.vtigerLinks.findByIncidentId('INC-000001')).sync_status, 'succeeded');
});

test('an incident update waits, not fails, until the incident has been mirrored', async (t) => {
  const updates = [];
  const service = await runWorkerBriefly(t, {
    vtiger: { updateIncidentMirror: async (payload) => { updates.push(payload); return {}; } },
    seed: async (s) => { await newIncident(s); await s.syncIntent('incident', 'updateIncidentMirror', 'corr', { vems_incident_id: 'INC-000001', incident_id: 'INC-000001', ticket_title: 'x' }); }
  });
  assert.equal(updates.length, 0);
  const [intent] = await service.db.queryAll("SELECT status, attempt_count FROM sync_intents;");
  assert.equal(intent.status, 'pending');
});

const vehicle = { vehicle_id: 'AMB-009', callsign: 'Nine', vehicle_type: 'ALS Ambulance', home_station: 'Dev', operational_status: 'Available', service_status: 'Serviceable' };
const link = (extra) => ({ external_key: 'k', create_correlation_id: 'c', last_correlation_id: 'c', sync_status: 'succeeded', last_error_code: null, last_synced_at: 'now', created_at: 'now', updated_at: 'now', ...extra });

test('vehicle and assignment updates are sent to the records they were mirrored to, whatever id was known when queued', async (t) => {
  const sent = [];
  const record = (name) => async (payload) => { sent.push([name, payload.id]); return { remote_id: payload.id, external_key: 'k', outcome: 'updated' }; };
  await runWorkerBriefly(t, {
    vtiger: { updateVehicleMirror: record('vehicle'), updateAssignmentMirror: record('assignment') },
    seed: async (s) => {
      await newIncident(s);
      await s.createVehicle(vehicle, { correlationId: 'c' });
      const assignment = await s.createAssignment('INC-000001', { vehicle_id: 'AMB-009', crew_ids: [], reason: 'test' }, { correlationId: 'c' });
      await s.db.execute('DELETE FROM sync_intents;');
      await s.vehicleVtigerLinks.upsert(link({ vehicle_id: 'AMB-009', remote_id: '37x4', remote_number: null }));
      await s.assignmentVtigerLinks.upsert(link({ assignment_id: assignment.assignment_id, incident_id: 'INC-000001', remote_id: '40x2', remote_number: null, incident_remote_id: '17x9' }));
      await s.syncIntent('vehicle', 'updateVehicleMirror', 'c', { vems_vehicle_id: 'AMB-009', vehicle_id: 'AMB-009', id: undefined });
      await s.syncIntent('assignment', 'updateAssignmentMirror', 'c', { vems_assignment_id: assignment.assignment_id, assignment_id: assignment.assignment_id, vems_vehicle_id: 'AMB-009', id: undefined });
    }
  });
  assert.deepEqual(sent.sort(), [['assignment', '40x2'], ['vehicle', '37x4']]);
});

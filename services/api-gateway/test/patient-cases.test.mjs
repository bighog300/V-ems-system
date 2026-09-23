import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../../orchestration/src/index.mjs';
import { createApp } from '../src/server.mjs';

test('patient case HTTP contracts, idempotency, legacy ambiguity and role/assignment boundaries', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-case-api-'));
  const s = new OrchestrationService({ dbPath: join(dir, 'test.sqlite') });
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = 'true';
  const server = createApp(s);
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); s.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const meta = { correlationId: 'http-case' };
  const incident = await s.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'Medical', priority: 'High', description: 'Exercise', address: 'Test', patient_count: 4 } }, meta);
  async function request(path, method = 'GET', payload, role = 'supervisor', key) {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-user-role': role, 'x-actor-id': 'STAFF-001', ...(key ? { 'idempotency-key': key } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  const path = `/api/incidents/${incident.incident_id}/patient-cases`;
  const first = await request(path, 'POST', { temporary_label: 'Unidentified' }, 'supervisor', 'create-one');
  assert.equal(first.status, 201);
  assert.equal((await request(path, 'POST', { temporary_label: 'Unidentified' }, 'supervisor', 'create-one')).body.patient_case_id, first.body.patient_case_id);
  assert.equal((await request(path, 'POST', {}, 'supervisor', 'create-one')).status, 409);
  const id = first.body.patient_case_id;
  assert.equal((await request(`/api/patient-cases/${id}`)).body.incident_id, incident.incident_id);
  assert.equal((await request(path, 'POST', {}, 'field_crew')).status, 403);
  assert.equal((await request(`/api/patient-cases/${id}/assignment`, 'PATCH', { assignment_id: 'ASN-000001' }, 'field_crew')).status, 403);
  assert.equal((await request(`/api/patient-cases/${id}/patient-link`, 'POST', { verification_status: 'verified' })).status, 400);
  assert.equal((await request(`/api/patient-cases/${id}/patient-link`, 'POST', { verification_status: 'provisional', temporary_label: 'Unknown' })).status, 200);
  for (let n = 1; n < 4; n++) assert.equal((await request(path, 'POST', {})).status, 201);
  assert.equal((await request(path)).body.patient_cases.length, 4);
  assert.equal((await request(`/api/incidents/${incident.incident_id}/patient-link`)).status, 409);
  assert.equal((await request(`/api/incidents/${incident.incident_id}/encounters`)).status, 409);
});

test('provisional reconciliation is privileged, case-scoped and idempotent', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-provisional-reconcile-api-'));
  const s = new OrchestrationService({ dbPath: join(dir, 'test.sqlite') });
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = 'true';
  const server = createApp(s);
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); s.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const incident = await s.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'Medical', priority: 'High', description: 'Synthetic reconciliation exercise', address: 'Test', patient_count: 1 } }, { correlationId: 'reconcile-api' });
  const c = await s.createPatientCase(incident.incident_id, { temporary_label: 'Synthetic Unknown' }, { correlationId: 'reconcile-api' });
  await s.db.execute(`INSERT INTO patient_case_provisional_requests VALUES ('${c.patient_case_id}','pending','2026-09-18T08:43:39.704Z');`);
  async function request(role, payload, key) {
    const response = await fetch(`${base}/api/patient-cases/${c.patient_case_id}/provisional-patient-reconciliation`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-user-role': role, 'x-actor-id': 'STAFF-001', 'idempotency-key': key }, body: JSON.stringify(payload) });
    return { status: response.status, body: await response.json() };
  }
  const evidence = { outcome: 'downstream_not_created', downstream_status: 404 };
  assert.equal((await request('field_crew', evidence, 'reconcile-denied-field')).status, 403);
  assert.equal((await request('dispatcher', evidence, 'reconcile-denied-dispatcher')).status, 403);
  const first = await request('supervisor', evidence, 'reconcile-once');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { patient_case_id: c.patient_case_id, reservation_status: 'failed', retryable: true });
  const replay = await request('supervisor', evidence, 'reconcile-replay');
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, first.body);
  assert.equal((await s.db.queryOne(`SELECT status FROM patient_case_provisional_requests WHERE patient_case_id='${c.patient_case_id}'`)).status, 'failed');
  assert.equal((await s.db.queryOne(`SELECT count(*) AS n FROM audit_logs WHERE entity_id='${c.patient_case_id}' AND action='reconcile_provisional_failure'`)).n, 1);
  assert.equal((await s.listPatientCases(incident.incident_id)).length, 1);
});

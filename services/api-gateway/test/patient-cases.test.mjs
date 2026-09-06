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
  const incident = s.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'Medical', priority: 'High', description: 'Exercise', address: 'Test', patient_count: 4 } }, meta);
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

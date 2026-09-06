import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../../orchestration/src/index.mjs';
import { createApp } from '../src/server.mjs';

test('patient-case clinical record endpoints preserve structured history and non-transport disposition', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-stage7-api-'));
  const service = new OrchestrationService({ dbPath: join(dir, 'stage7.sqlite') });
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = 'true';
  const server = createApp(service);
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); service.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', payload) => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-user-role': 'supervisor', 'x-actor-id': 'STAFF-001', ...(method !== 'GET' ? { 'idempotency-key': `${method}-${path}` } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const incident = service.createIncident({ call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'Medical', priority: 'High', description: 'Stage 7', address: 'Test', patient_count: 1 } }, { correlationId: 'stage7-api' });
  const created = await request(`/api/incidents/${incident.incident_id}/patient-cases`, 'POST', { temporary_label: 'Unknown patient' });
  assert.equal(created.status, 201);
  const id = created.body.patient_case_id;
  assert.equal((await request(`/api/patient-cases/${id}/demographics`, 'PUT', { first_name: 'Unknown', last_name: 'Patient', dob_unknown: true, unidentified: true, identity_confidence: 'unverified' })).status, 200);
  assert.equal((await request(`/api/patient-cases/${id}/assessments`, 'POST', { section_type: 'primary_survey', payload: { airway: 'patent', breathing: 'normal' } })).status, 201);
  assert.equal((await request(`/api/patient-cases/${id}/assessments`)).body.assessments.length, 1);
  const disposition = await request(`/api/patient-cases/${id}/disposition`, 'POST', { outcome: 'treated_not_transported', reason: 'No transport required' });
  assert.equal(disposition.status, 201);
  const record = await request(`/api/patient-cases/${id}`);
  assert.equal(record.body.closure_ready, true);
  const timeline = await request(`/api/patient-cases/${id}/timeline`);
  assert.equal(timeline.body.timeline.length, 3);
  assert.deepEqual(timeline.body.timeline.map(event => event.event_type), ['demographics_updated', 'assessment_recorded', 'disposition_recorded']);
});

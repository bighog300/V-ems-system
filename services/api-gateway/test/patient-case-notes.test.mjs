import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../../orchestration/src/index.mjs';
import { createApp } from '../src/server.mjs';

test('patient-case notes endpoint validates the tag vocabulary, is RBAC-gated, and auto-raises a QA flag for safeguarding_concern', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-stage15d-api-'));
  const service = new OrchestrationService({ dbPath: join(dir, 'stage15d.sqlite') });
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = 'true';
  const server = createApp(service);
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); service.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', payload, role = 'supervisor') => {
    const response = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-role': role, 'x-actor-id': 'STAFF-001', ...(method !== 'GET' ? { 'idempotency-key': `${method}-${path}-${role}-${Math.random()}` } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    return { status: response.status, body: await response.json() };
  };
  const incident = await service.createIncident({ call: { call_source: 'phone', received_at: '2026-09-16T10:00:00Z' }, incident: { category: 'Medical', priority: 'High', description: 'Stage 15d', address: 'Test', patient_count: 1 } }, { correlationId: 'stage15d-api' });
  const created = await request(`/api/incidents/${incident.incident_id}/patient-cases`, 'POST', { temporary_label: 'Unknown patient' });
  assert.equal(created.status, 201);
  const id = created.body.patient_case_id;

  const forbidden = await request(`/api/patient-cases/${id}/notes`, 'POST', { tags: ['general'], text: 'Should be forbidden' }, 'dispatcher');
  assert.equal(forbidden.status, 403);

  const badTag = await request(`/api/patient-cases/${id}/notes`, 'POST', { tags: ['not_a_real_tag'], text: 'Bad tag' });
  assert.equal(badTag.status, 400);

  const created1 = await request(`/api/patient-cases/${id}/notes`, 'POST', { tags: ['scene_safety'], text: 'Unstable structure near patient.' });
  assert.equal(created1.status, 201);
  assert.deepEqual(created1.body.tags, ['scene_safety']);

  const created2 = await request(`/api/patient-cases/${id}/notes`, 'POST', { tags: ['safeguarding_concern'], text: 'Possible neglect observed at the home.' });
  assert.equal(created2.status, 201);

  const listed = await request(`/api/patient-cases/${id}/notes`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.notes.length, 2);

  const listForbidden = await request(`/api/patient-cases/${id}/notes`, 'GET', undefined, 'dispatcher');
  assert.equal(listForbidden.status, 403);

  await service.createEpcrVersion(id, {}, { correlationId: 'stage15d-api', actorId: 'STAFF-001', actorRole: 'field_crew' });
  const flags = await service.listEpcrQaFlags(id);
  assert.ok(flags.some(flag => flag.flag_type === 'safeguarding_concern' && flag.source === 'system:patient_case_note'));
});

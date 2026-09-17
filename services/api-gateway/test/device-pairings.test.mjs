import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../../orchestration/src/index.mjs';
import { createApp } from '../src/server.mjs';

test('device pairing endpoints are RBAC-gated and support the pair -> link -> unpair lifecycle', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-stage15f-api-'));
  const service = new OrchestrationService({ dbPath: join(dir, 'stage15f.sqlite') });
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

  await service.createVehicle({ vehicle_id: 'AMB-600', callsign: 'Crew 600', vehicle_type: 'Ambulance', operational_status: 'Available', service_status: 'Serviceable', home_station: 'Test' }, { correlationId: 'stage15f-api' });
  const incident = await service.createIncident({ call: { call_source: 'phone', received_at: '2026-09-17T10:00:00Z' }, incident: { category: 'Medical', priority: 'High', description: 'Stage 15f', address: 'Test', patient_count: 1 } }, { correlationId: 'stage15f-api' });
  const created = await request(`/api/incidents/${incident.incident_id}/patient-cases`, 'POST', { temporary_label: 'Unknown patient' });
  const patientCaseId = created.body.patient_case_id;

  const forbidden = await request('/api/vehicles/AMB-600/device-pairings', 'POST', { serial_number: 'SN-001', vendor: 'Acme', model: 'VitalCheck 3000' }, 'dispatcher');
  assert.equal(forbidden.status, 403);

  const badPayload = await request('/api/vehicles/AMB-600/device-pairings', 'POST', { vendor: 'Acme', model: 'VitalCheck 3000' });
  assert.equal(badPayload.status, 400);

  const paired = await request('/api/vehicles/AMB-600/device-pairings', 'POST', { serial_number: 'SN-001', vendor: 'Acme', model: 'VitalCheck 3000' });
  assert.equal(paired.status, 201);
  const pairingId = paired.body.pairing_id;
  assert.equal(paired.body.patient_case_id, null);

  const listedForVehicle = await request('/api/vehicles/AMB-600/device-pairings');
  assert.equal(listedForVehicle.status, 200);
  assert.equal(listedForVehicle.body.device_pairings.length, 1);

  const fetched = await request(`/api/device-pairings/${pairingId}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.serial_number, 'SN-001');

  const linked = await request(`/api/device-pairings/${pairingId}/patient-case`, 'PATCH', { patient_case_id: patientCaseId });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.patient_case_id, patientCaseId);

  const bySerialForbidden = await request(`/api/device-pairings/by-serial?serial_number=SN-001`, 'GET', undefined, 'field_crew');
  assert.equal(bySerialForbidden.status, 403);

  const bySerial = await request(`/api/device-pairings/by-serial?serial_number=SN-001`);
  assert.equal(bySerial.status, 200);
  assert.equal(bySerial.body.device_pairings.length, 1);

  const unpaired = await request(`/api/device-pairings/${pairingId}/unpair`, 'PATCH');
  assert.equal(unpaired.status, 200);
  assert.ok(unpaired.body.unpaired_at);

  const linkAfterUnpair = await request(`/api/device-pairings/${pairingId}/patient-case`, 'PATCH', { patient_case_id: patientCaseId });
  assert.equal(linkAfterUnpair.status, 409);
});

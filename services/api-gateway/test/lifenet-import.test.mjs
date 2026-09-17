import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OrchestrationService } from '../../orchestration/src/index.mjs';
import { createApp } from '../src/server.mjs';

test('lifenet-import endpoint is RBAC-gated and imports LIFEPAK 15 vitals with device-pairing provenance', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-stage15g-api-'));
  const service = new OrchestrationService({
    dbPath: join(dir, 'stage15g.sqlite'),
    openemr: {
      searchPatient: async () => ({ match_status: 'no_match', match_confidence: 0, candidates: [] }),
      createPatient: async () => ({ patient_id: 'OE-900' }),
      createEncounter: async () => ({ encounter_id: 'ENC-900', status: 'Open' })
    },
    lifenetTransport: async () => [
      { recorded_at: '2026-09-17T10:06:00.000Z', heart_rate_bpm: 88 },
      { recorded_at: '2026-09-17T10:07:00.000Z', spo2_pct: 97 }
    ]
  });
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

  await service.createVehicle({ vehicle_id: 'AMB-800', callsign: 'Crew 800', vehicle_type: 'Ambulance', operational_status: 'Available', service_status: 'Serviceable', home_station: 'Test' }, { correlationId: 'stage15g-api' });
  const incident = await service.createIncident({ call: { call_source: 'phone', received_at: '2026-09-17T10:00:00Z' }, incident: { category: 'Medical', priority: 'High', description: 'Stage 15g', address: 'Test', patient_count: 1 } }, { correlationId: 'stage15g-api' });
  const created = await request(`/api/incidents/${incident.incident_id}/patient-cases`, 'POST', { temporary_label: 'Unknown patient' });
  const patientCaseId = created.body.patient_case_id;
  await request(`/api/patient-cases/${patientCaseId}/patient-link`, 'POST', { verification_status: 'verified', openemr_patient_id: 'OE-900' });
  await request(`/api/patient-cases/${patientCaseId}/encounters`, 'POST', { care_started_at: '2026-09-17T10:05:00Z', presenting_complaint: 'Test' });

  const paired = await request('/api/vehicles/AMB-800/device-pairings', 'POST', { serial_number: 'LP15-0001', vendor: 'Physio-Control', model: 'LIFEPAK 15' });
  const pairingId = paired.body.pairing_id;
  await request(`/api/device-pairings/${pairingId}/patient-case`, 'PATCH', { patient_case_id: patientCaseId });

  const forbidden = await request(`/api/patient-cases/${patientCaseId}/lifenet-import`, 'POST', { lifenet_case_reference: 'LP15-CASE-1', device_pairing_id: pairingId }, 'dispatcher');
  assert.equal(forbidden.status, 403);

  const badPayload = await request(`/api/patient-cases/${patientCaseId}/lifenet-import`, 'POST', { device_pairing_id: pairingId });
  assert.equal(badPayload.status, 400);

  const imported = await request(`/api/patient-cases/${patientCaseId}/lifenet-import`, 'POST', { lifenet_case_reference: 'LP15-CASE-1', device_pairing_id: pairingId });
  assert.equal(imported.status, 201);
  assert.equal(imported.body.imported_count, 2);

  const observations = await request(`/api/patient-cases/${patientCaseId}/observations`);
  assert.equal(observations.body.observations.length, 2);
  assert.ok(observations.body.observations.every(o => o.device_pairing_id === pairingId));
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

async function setup(lifenetTransport) {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-lifenet-import-")), "platform.sqlite"),
    openemr: {
      searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
      createPatient: async () => ({ patient_id: "OE-800" }),
      createEncounter: async () => ({ encounter_id: "ENC-800", status: "Open" })
    },
    lifenetTransport
  });
  const meta = { correlationId: "lifenet-import-test", actorId: "STAFF-001", actorRole: "field_crew" };
  await service.createVehicle({ vehicle_id: "AMB-700", callsign: "Crew 700", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Test" }, meta);

  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-17T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Lifenet import", address: "Test", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  await service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-800" }, meta);
  await service.createEncounterForPatientCase(patientCase.patient_case_id, { care_started_at: "2026-09-17T10:05:00Z", presenting_complaint: "Test" }, meta);

  return { service, patientCase, meta };
}

async function pairLifepak15(service, patientCase, meta) {
  const pairing = await service.pairDevice("AMB-700", { serial_number: "LP15-0001", vendor: "Physio-Control", model: "LIFEPAK 15" }, meta);
  await service.linkDevicePairingToPatientCase(pairing.pairing_id, { patient_case_id: patientCase.patient_case_id }, meta);
  return pairing;
}

test("importLifenetCaseVitals creates one observation per normalized reading, with device_pairing_id provenance", async () => {
  const { service, patientCase, meta } = await setup(async () => [
    { recorded_at: "2026-09-17T10:06:00.000Z", heart_rate_bpm: 88, spo2_pct: 97 },
    { recorded_at: "2026-09-17T10:07:00.000Z", heart_rate_bpm: 90 }
  ]);
  const pairing = await pairLifepak15(service, patientCase, meta);

  const result = await service.importLifenetCaseVitals(patientCase.patient_case_id, { lifenet_case_reference: "LP15-CASE-1", device_pairing_id: pairing.pairing_id }, meta);

  assert.equal(result.imported_count, 2);
  const observations = await service.listPatientCaseObservations(patientCase.patient_case_id);
  assert.equal(observations.length, 2);
  assert.ok(observations.every((o) => o.device_pairing_id === pairing.pairing_id));
  assert.deepEqual(observations.map((o) => o.observations.heart_rate_bpm).sort(), [88, 90]);
});

test("importLifenetCaseVitals requires lifenet_case_reference and device_pairing_id", async () => {
  const { service, patientCase, meta } = await setup(async () => []);
  await assert.rejects(() => service.importLifenetCaseVitals(patientCase.patient_case_id, { device_pairing_id: "DPR-1" }, meta), /lifenet_case_reference is required/);
  await assert.rejects(() => service.importLifenetCaseVitals(patientCase.patient_case_id, { lifenet_case_reference: "LP15-CASE-1" }, meta), /device_pairing_id is required/);
});

test("importLifenetCaseVitals rejects an unknown device pairing", async () => {
  const { service, patientCase, meta } = await setup(async () => []);
  await assert.rejects(
    () => service.importLifenetCaseVitals(patientCase.patient_case_id, { lifenet_case_reference: "LP15-CASE-1", device_pairing_id: "DPR-does-not-exist" }, meta),
    /Device pairing DPR-does-not-exist not found/
  );
});

test("importLifenetCaseVitals rejects a pairing not linked to this patient case", async () => {
  const { service, patientCase, meta } = await setup(async () => []);
  const pairing = await service.pairDevice("AMB-700", { serial_number: "LP15-0001", vendor: "Physio-Control", model: "LIFEPAK 15" }, meta);
  // Deliberately never linked.

  await assert.rejects(
    () => service.importLifenetCaseVitals(patientCase.patient_case_id, { lifenet_case_reference: "LP15-CASE-1", device_pairing_id: pairing.pairing_id }, meta),
    /is not linked to patient case/
  );
});

test("importLifenetCaseVitals rejects a pairing that isn't a Physio-Control LIFEPAK 15", async () => {
  const { service, patientCase, meta } = await setup(async () => []);
  const pairing = await service.pairDevice("AMB-700", { serial_number: "SN-OTHER", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  await service.linkDevicePairingToPatientCase(pairing.pairing_id, { patient_case_id: patientCase.patient_case_id }, meta);

  await assert.rejects(
    () => service.importLifenetCaseVitals(patientCase.patient_case_id, { lifenet_case_reference: "LP15-CASE-1", device_pairing_id: pairing.pairing_id }, meta),
    /is not a Physio-Control LIFEPAK 15 pairing/
  );
});

test("importLifenetCaseVitals drops readings the adapter can't normalize, importing only the valid ones", async () => {
  const { service, patientCase, meta } = await setup(async () => [
    { recorded_at: "2026-09-17T10:06:00.000Z", heart_rate_bpm: 88 },
    { recorded_at: "not-a-date", heart_rate_bpm: 90 },
    { recorded_at: "2026-09-17T10:07:00.000Z", some_unknown_field: 1 }
  ]);
  const pairing = await pairLifepak15(service, patientCase, meta);

  const result = await service.importLifenetCaseVitals(patientCase.patient_case_id, { lifenet_case_reference: "LP15-CASE-1", device_pairing_id: pairing.pairing_id }, meta);
  assert.equal(result.imported_count, 1);
});

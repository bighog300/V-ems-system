import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

async function setup(openemr = {}) {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-device-pairings-")), "platform.sqlite"),
    openemr: {
      searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
      createPatient: async () => ({ patient_id: "OE-700" }),
      createEncounter: async () => ({ encounter_id: "ENC-700", status: "Open" }),
      createObservation: async () => ({ observation_id: "OBSREF-700" }),
      ...openemr
    }
  });
  const meta = { correlationId: "device-pairings-test", actorId: "STAFF-001", actorRole: "supervisor" };
  await service.createVehicle({ vehicle_id: "AMB-500", callsign: "Crew 500", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Test" }, meta);

  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-17T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Device pairings", address: "Test", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  return { service, patientCase, meta };
}

test("pairDevice creates a pairing record scoped to the vehicle, unlinked from any patient case", async () => {
  const { service, meta } = await setup();
  const pairing = await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);

  assert.equal(pairing.vehicle_id, "AMB-500");
  assert.equal(pairing.serial_number, "SN-001");
  assert.equal(pairing.patient_case_id, null);
  assert.equal(pairing.unpaired_at, null);
  assert.ok(pairing.paired_at);
});

test("pairDevice rejects an unknown vehicle", async () => {
  const { service, meta } = await setup();
  await assert.rejects(() => service.pairDevice("AMB-999", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta), /Vehicle AMB-999 not found/);
});

test("pairDevice requires serial_number, vendor, and model", async () => {
  const { service, meta } = await setup();
  await assert.rejects(() => service.pairDevice("AMB-500", { vendor: "Acme", model: "VitalCheck 3000" }, meta), /serial_number is required/);
  await assert.rejects(() => service.pairDevice("AMB-500", { serial_number: "SN-001", model: "VitalCheck 3000" }, meta), /vendor is required/);
  await assert.rejects(() => service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme" }, meta), /model is required/);
});

test("listDevicePairingsForVehicle returns every pairing for that vehicle, most recent first", async () => {
  const { service, meta } = await setup();
  await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  await service.pairDevice("AMB-500", { serial_number: "SN-002", vendor: "Acme", model: "VitalCheck 3000" }, meta);

  const pairings = await service.listDevicePairingsForVehicle("AMB-500");
  assert.equal(pairings.length, 2);
});

test("linkDevicePairingToPatientCase links an existing pairing to a patient case", async () => {
  const { service, patientCase, meta } = await setup();
  const pairing = await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);

  const linked = await service.linkDevicePairingToPatientCase(pairing.pairing_id, { patient_case_id: patientCase.patient_case_id }, meta);
  assert.equal(linked.patient_case_id, patientCase.patient_case_id);
});

test("linkDevicePairingToPatientCase rejects an unknown pairing or patient case", async () => {
  const { service, patientCase, meta } = await setup();
  await assert.rejects(() => service.linkDevicePairingToPatientCase("DPR-does-not-exist", { patient_case_id: patientCase.patient_case_id }, meta), /Device pairing DPR-does-not-exist not found/);

  const pairing = await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  await assert.rejects(() => service.linkDevicePairingToPatientCase(pairing.pairing_id, { patient_case_id: "PCR-000999" }, meta), /Patient case PCR-000999 not found/);
});

test("linkDevicePairingToPatientCase rejects linking a pairing that has already been unpaired", async () => {
  const { service, patientCase, meta } = await setup();
  const pairing = await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  await service.unpairDevice(pairing.pairing_id, meta);

  await assert.rejects(
    () => service.linkDevicePairingToPatientCase(pairing.pairing_id, { patient_case_id: patientCase.patient_case_id }, meta),
    /has already been unpaired/
  );
});

test("unpairDevice sets unpaired_at, and is idempotent on a second call", async () => {
  const { service, meta } = await setup();
  const pairing = await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);

  const unpaired = await service.unpairDevice(pairing.pairing_id, meta);
  assert.ok(unpaired.unpaired_at);

  const secondCall = await service.unpairDevice(pairing.pairing_id, meta);
  assert.equal(secondCall.unpaired_at, unpaired.unpaired_at);
});

test("listDevicePairingsBySerial returns every pairing for that physical unit, across vehicles", async () => {
  const { service, meta } = await setup();
  await service.createVehicle({ vehicle_id: "AMB-501", callsign: "Crew 501", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Test" }, meta);

  await service.pairDevice("AMB-500", { serial_number: "SN-RECALLED", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  await service.pairDevice("AMB-501", { serial_number: "SN-RECALLED", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  await service.pairDevice("AMB-500", { serial_number: "SN-OTHER", vendor: "Acme", model: "VitalCheck 3000" }, meta);

  const history = await service.listDevicePairingsBySerial("SN-RECALLED");
  assert.equal(history.length, 2);
  assert.ok(history.every((pairing) => pairing.serial_number === "SN-RECALLED"));
});

test("createPatientCaseObservation accepts a device_pairing_id linked to this patient case, storing it as provenance", async () => {
  const { service, patientCase, meta } = await setup();
  await service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-700" }, meta);
  await service.createEncounterForPatientCase(patientCase.patient_case_id, { care_started_at: "2026-09-17T10:05:00Z", presenting_complaint: "Test" }, meta);

  const pairing = await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  await service.linkDevicePairingToPatientCase(pairing.pairing_id, { patient_case_id: patientCase.patient_case_id }, meta);

  const observation = await service.createPatientCaseObservation(patientCase.patient_case_id, { vital_signs: { heart_rate_bpm: 88 }, device_pairing_id: pairing.pairing_id }, meta);
  assert.equal(observation.device_pairing_id, pairing.pairing_id);
});

test("createPatientCaseObservation rejects a device_pairing_id that isn't linked to this patient case", async () => {
  const { service, patientCase, meta } = await setup();
  await service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-700" }, meta);
  await service.createEncounterForPatientCase(patientCase.patient_case_id, { care_started_at: "2026-09-17T10:05:00Z", presenting_complaint: "Test" }, meta);

  const pairing = await service.pairDevice("AMB-500", { serial_number: "SN-001", vendor: "Acme", model: "VitalCheck 3000" }, meta);
  // Deliberately never linked to a patient case.

  await assert.rejects(
    () => service.createPatientCaseObservation(patientCase.patient_case_id, { vital_signs: { heart_rate_bpm: 88 }, device_pairing_id: pairing.pairing_id }, meta),
    /is not linked to patient case/
  );
});

test("createPatientCaseObservation rejects an unknown device_pairing_id", async () => {
  const { service, patientCase, meta } = await setup();
  await service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-700" }, meta);
  await service.createEncounterForPatientCase(patientCase.patient_case_id, { care_started_at: "2026-09-17T10:05:00Z", presenting_complaint: "Test" }, meta);

  await assert.rejects(
    () => service.createPatientCaseObservation(patientCase.patient_case_id, { vital_signs: { heart_rate_bpm: 88 }, device_pairing_id: "DPR-does-not-exist" }, meta),
    /Device pairing DPR-does-not-exist not found/
  );
});

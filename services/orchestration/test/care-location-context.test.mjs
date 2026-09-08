import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function setup(openemr = {}) {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-care-location-")), "platform.sqlite"),
    openemr: {
      searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
      createPatient: async () => ({ patient_id: "OE-500" }),
      createEncounter: async () => ({ encounter_id: "ENC-500", status: "Open" }),
      createObservation: async () => ({ observation_id: "OBSREF-500" }),
      ...openemr
    }
  });
  const meta = { correlationId: "care-location-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Location context", address: "Test", patient_count: 1 }
  }, meta);
  const patientCase = service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-500" }, meta);
  return { service, patientCase, meta };
}

test("createEncounterForPatientCase persists optional location context", async () => {
  const { service, patientCase, meta } = setup();
  await service.createEncounterForPatientCase(
    patientCase.patient_case_id,
    { care_started_at: "2026-09-06T10:05:00Z", presenting_complaint: "Chest pain", location_lat: 51.5074, location_lng: -0.1278, location_accuracy_m: 12.5 },
    meta
  );
  const encounter = service.getPatientCaseEncounter(patientCase.patient_case_id);
  assert.equal(encounter.location_lat, 51.5074);
  assert.equal(encounter.location_lng, -0.1278);
  assert.equal(encounter.location_accuracy_m, 12.5);
});

test("createEncounterForPatientCase never requires location — a denied permission still charts", async () => {
  const { service, patientCase, meta } = setup();
  const encounter = await service.createEncounterForPatientCase(
    patientCase.patient_case_id,
    { care_started_at: "2026-09-06T10:05:00Z", presenting_complaint: "Chest pain" },
    meta
  );
  assert.equal(encounter.location_lat, null);
  assert.equal(encounter.location_lng, null);
  assert.equal(encounter.location_accuracy_m, null);
});

test("createEncounterForPatientCase rejects an out-of-range latitude", async () => {
  const { service, patientCase, meta } = setup();
  await assert.rejects(
    () => service.createEncounterForPatientCase(
      patientCase.patient_case_id,
      { care_started_at: "2026-09-06T10:05:00Z", presenting_complaint: "Chest pain", location_lat: 200, location_lng: 0 },
      meta
    ),
    /location_lat/
  );
});

test("createEncounterForPatientCase's idempotency fingerprint ignores location, so GPS jitter on retry never conflicts", async () => {
  const { service, patientCase, meta } = setup();
  const first = await service.createEncounterForPatientCase(
    patientCase.patient_case_id,
    { care_started_at: "2026-09-06T10:05:00Z", presenting_complaint: "Chest pain", location_lat: 51.5074, location_lng: -0.1278 },
    { ...meta, idempotencyKey: "encounter-location-key" }
  );
  const replay = await service.createEncounterForPatientCase(
    patientCase.patient_case_id,
    { care_started_at: "2026-09-06T10:05:00Z", presenting_complaint: "Chest pain", location_lat: 51.508, location_lng: -0.129 },
    { ...meta, idempotencyKey: "encounter-location-key" }
  );
  assert.equal(replay.encounter_id, first.encounter_id);
});

test("setPatientCaseDisposition persists optional location context", () => {
  const { service, patientCase, meta } = setup();
  const disposition = service.setPatientCaseDisposition(
    patientCase.patient_case_id,
    { outcome: "treated_not_transported", reason: "No transport required", location_lat: 40.7128, location_lng: -74.006, location_accuracy_m: 8 },
    meta
  );
  assert.equal(disposition.location_lat, 40.7128);
  assert.equal(disposition.location_lng, -74.006);
  assert.equal(disposition.location_accuracy_m, 8);
});

test("setPatientCaseDisposition never requires location", () => {
  const { service, patientCase, meta } = setup();
  const disposition = service.setPatientCaseDisposition(
    patientCase.patient_case_id,
    { outcome: "treated_not_transported", reason: "No transport required" },
    meta
  );
  assert.equal(disposition.location_lat, null);
  assert.equal(disposition.location_lng, null);
  assert.equal(disposition.location_accuracy_m, null);
});

test("setPatientCaseDisposition rejects an out-of-range longitude", () => {
  const { service, patientCase, meta } = setup();
  assert.throws(
    () => service.setPatientCaseDisposition(
      patientCase.patient_case_id,
      { outcome: "treated_not_transported", reason: "No transport required", location_lat: 0, location_lng: 200 },
      meta
    ),
    /location_lng/
  );
});

test("setPatientCaseDisposition rejects a negative accuracy", () => {
  const { service, patientCase, meta } = setup();
  assert.throws(
    () => service.setPatientCaseDisposition(
      patientCase.patient_case_id,
      { outcome: "treated_not_transported", reason: "No transport required", location_lat: 0, location_lng: 0, location_accuracy_m: -5 },
      meta
    ),
    /location_accuracy_m/
  );
});

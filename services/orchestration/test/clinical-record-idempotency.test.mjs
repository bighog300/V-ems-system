import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function setup(openemr = {}) {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-clinical-idempotency-")), "platform.sqlite"),
    openemr: {
      searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
      createPatient: async () => ({ patient_id: "OE-500" }),
      createEncounter: async () => ({ encounter_id: "ENC-500", status: "Open" }),
      createObservation: async () => ({ observation_id: "OBSREF-500" }),
      ...openemr
    }
  });
  const meta = { correlationId: "clinical-idempotency-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Idempotency", address: "Test", patient_count: 1 }
  }, meta);
  const patientCase = service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-500" }, meta);
  return { service, patientCase, meta };
}

async function withEncounter(setupResult) {
  const { service, patientCase, meta } = setupResult;
  await service.createEncounterForPatientCase(patientCase.patient_case_id, {
    care_started_at: "2026-09-06T10:05:00Z",
    presenting_complaint: "Chest pain"
  }, meta);
  return setupResult;
}

test("createPatientCaseAssessment replays without creating a duplicate", () => {
  const { service, patientCase, meta } = setup();
  const payload = { section_type: "primary_survey", performed_at: "2026-09-06T10:08:00Z", payload: { airway: "patent" } };
  const first = service.createPatientCaseAssessment(patientCase.patient_case_id, payload, { ...meta, idempotencyKey: "assessment-key-1" });
  const replay = service.createPatientCaseAssessment(patientCase.patient_case_id, payload, { ...meta, idempotencyKey: "assessment-key-1" });
  assert.equal(replay.assessment_id, first.assessment_id);
  assert.equal(service.listPatientCaseAssessments(patientCase.patient_case_id).length, 1);
});

test("createPatientCaseAssessment rejects a reused key with a different payload", () => {
  const { service, patientCase, meta } = setup();
  service.createPatientCaseAssessment(
    patientCase.patient_case_id,
    { section_type: "primary_survey", performed_at: "2026-09-06T10:08:00Z", payload: { airway: "patent" } },
    { ...meta, idempotencyKey: "assessment-key-2" }
  );
  assert.throws(
    () => service.createPatientCaseAssessment(
      patientCase.patient_case_id,
      { section_type: "secondary_survey", performed_at: "2026-09-06T10:08:00Z", payload: { airway: "obstructed" } },
      { ...meta, idempotencyKey: "assessment-key-2" }
    ),
    /reused with a different request/
  );
});

test("createPatientCaseObservation replays without creating a duplicate", async () => {
  const setupResult = await withEncounter(setup());
  const { service, patientCase, meta } = setupResult;
  const payload = { recorded_at: "2026-09-06T10:10:00Z", vital_signs: { heart_rate_bpm: 88 } };
  const first = await service.createPatientCaseObservation(patientCase.patient_case_id, payload, { ...meta, idempotencyKey: "observation-key-1" });
  const replay = await service.createPatientCaseObservation(patientCase.patient_case_id, payload, { ...meta, idempotencyKey: "observation-key-1" });
  assert.equal(replay.observation_event_id, first.observation_event_id);
  assert.equal(service.listPatientCaseObservations(patientCase.patient_case_id).length, 1);
});

test("createPatientCaseObservation rejects a reused key with a different payload", async () => {
  const setupResult = await withEncounter(setup());
  const { service, patientCase, meta } = setupResult;
  await service.createPatientCaseObservation(
    patientCase.patient_case_id,
    { recorded_at: "2026-09-06T10:10:00Z", vital_signs: { heart_rate_bpm: 88 } },
    { ...meta, idempotencyKey: "observation-key-2" }
  );
  await assert.rejects(
    () => service.createPatientCaseObservation(
      patientCase.patient_case_id,
      { recorded_at: "2026-09-06T10:10:00Z", vital_signs: { heart_rate_bpm: 140 } },
      { ...meta, idempotencyKey: "observation-key-2" }
    ),
    /reused with a different request/
  );
});

test("setPatientCaseDisposition replays without a duplicate audit/event or shifting decision_at", () => {
  const { service, patientCase, meta } = setup();
  const payload = { outcome: "treated_not_transported", reason: "No transport required" };
  const first = service.setPatientCaseDisposition(patientCase.patient_case_id, payload, { ...meta, idempotencyKey: "disposition-key-1" });
  const replay = service.setPatientCaseDisposition(patientCase.patient_case_id, payload, { ...meta, idempotencyKey: "disposition-key-1" });
  assert.equal(replay.disposition_id, first.disposition_id);
  assert.equal(replay.decision_at, first.decision_at);
});

test("setPatientCaseDisposition rejects a reused key with a different payload", () => {
  const { service, patientCase, meta } = setup();
  service.setPatientCaseDisposition(
    patientCase.patient_case_id,
    { outcome: "treated_not_transported", reason: "No transport required" },
    { ...meta, idempotencyKey: "disposition-key-2" }
  );
  assert.throws(
    () => service.setPatientCaseDisposition(
      patientCase.patient_case_id,
      { outcome: "transported", reason: "Changed mind" },
      { ...meta, idempotencyKey: "disposition-key-2" }
    ),
    /reused with a different request/
  );
});

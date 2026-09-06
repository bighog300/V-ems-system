import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteClient } from "../src/db.mjs";
import {
  ClinicalObservationRepository,
  MedicationAdministrationRepository,
  PatientCaseAssessmentRepository,
  PatientCaseDemographicsRepository,
  PatientCaseTimelineRepository
} from "../src/repositories/clinical-record-repository.mjs";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "vems-stage7-"));
  const db = new SqliteClient(join(dir, "platform.sqlite"));
  const now = "2026-09-06T15:00:00.000Z";
  db.execute(`INSERT INTO incidents (incident_id,call_id,status,category,priority,description,address,patient_count,created_at,updated_at,correlation_id)
    VALUES ('INC-000001','CALL-001','Active','Medical','P2','Stage 7 test','Test address',1,'${now}','${now}','corr-1');`);
  db.execute(`INSERT INTO patient_cases (patient_case_id,incident_id,patient_sequence,status,crew_ids_json,created_at,updated_at,correlation_id)
    VALUES ('PCR-000001','INC-000001',1,'Created','[]','${now}','${now}','corr-1');`);
  return { db, now };
}

test("migration 009 creates Stage 7 clinical tables", () => {
  const { db } = setup();
  for (const table of [
    "patient_case_demographics",
    "patient_case_assessments",
    "clinical_observations",
    "medication_administrations",
    "clinical_procedures",
    "patient_case_dispositions",
    "patient_case_timeline_events"
  ]) {
    const row = db.queryOne(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}';`);
    assert.equal(row?.name, table);
  }
});

test("demographics preserve unknown identity metadata", () => {
  const { db, now } = setup();
  const repository = new PatientCaseDemographicsRepository(db);
  repository.save({
    patient_case_id: "PCR-000001",
    first_name: "Unknown",
    last_name: "Patient",
    dob: "1900-01-01",
    dob_unknown: true,
    unidentified: true,
    identity_source: "crew_observation",
    identity_confidence: "unverified",
    minor_context: { suspected_minor: false },
    created_at: now,
    updated_at: now,
    correlation_id: "corr-1"
  });
  const record = repository.find("PCR-000001");
  assert.equal(record.dob_unknown, true);
  assert.equal(record.unidentified, true);
  assert.deepEqual(record.minor_context, { suspected_minor: false });
});

test("serial observations remain immutable and chronological", () => {
  const { db, now } = setup();
  const repository = new ClinicalObservationRepository(db);
  repository.create({
    observation_event_id: "OBS-EVT-2",
    patient_case_id: "PCR-000001",
    encounter_id: "ENC-1",
    performed_at: "2026-09-06T15:02:00.000Z",
    observations: { hr: 110, spo2: 93 },
    downstream_status: "pending",
    created_at: now,
    correlation_id: "corr-2"
  });
  repository.create({
    observation_event_id: "OBS-EVT-1",
    patient_case_id: "PCR-000001",
    encounter_id: "ENC-1",
    performed_at: "2026-09-06T15:01:00.000Z",
    observations: { hr: 118, spo2: 91 },
    downstream_status: "created",
    created_at: now,
    correlation_id: "corr-1"
  });
  const records = repository.list("PCR-000001");
  assert.deepEqual(records.map((record) => record.observation_event_id), ["OBS-EVT-1", "OBS-EVT-2"]);
  assert.deepEqual(records.map((record) => record.observations.hr), [118, 110]);
});

test("assessment payloads and timeline events remain structured", () => {
  const { db, now } = setup();
  const assessments = new PatientCaseAssessmentRepository(db);
  const timeline = new PatientCaseTimelineRepository(db);
  assessments.create({
    assessment_id: "ASM-1",
    patient_case_id: "PCR-000001",
    encounter_id: "ENC-1",
    section_type: "primary_survey",
    payload: { airway: "patent", breathing: { effort: "normal" } },
    performed_at: now,
    clinician_id: "STAFF-001",
    created_at: now,
    correlation_id: "corr-1"
  });
  timeline.create({
    timeline_event_id: "TL-1",
    patient_case_id: "PCR-000001",
    encounter_id: "ENC-1",
    event_type: "assessment_recorded",
    occurred_at: now,
    source_system: "vems",
    source_entity_type: "assessment",
    source_entity_id: "ASM-1",
    payload: { section_type: "primary_survey" },
    created_at: now,
    correlation_id: "corr-1"
  });
  assert.equal(assessments.list("PCR-000001")[0].payload.airway, "patent");
  assert.equal(timeline.list("PCR-000001")[0].payload.section_type, "primary_survey");
});

test("medication authorization metadata is retained for audit", () => {
  const { db, now } = setup();
  const repository = new MedicationAdministrationRepository(db);
  repository.create({
    medication_administration_id: "MED-1",
    patient_case_id: "PCR-000001",
    encounter_id: "ENC-1",
    medication_name: "Test medication",
    dose: "1",
    dose_unit: "mg",
    route: "IV",
    performed_at: now,
    clinician_id: "STAFF-001",
    authorization: { protocol: "TEST-PROTOCOL", version: "1" },
    downstream_status: "pending",
    created_at: now,
    correlation_id: "corr-1"
  });
  assert.deepEqual(repository.find("MED-1").authorization, { protocol: "TEST-PROTOCOL", version: "1" });
});

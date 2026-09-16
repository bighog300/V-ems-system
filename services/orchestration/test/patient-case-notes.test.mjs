import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteClient } from "../src/db.mjs";
import { PatientCaseNoteRepository } from "../src/repositories/clinical-record-repository.mjs";
import { OrchestrationService } from "../src/index.mjs";

async function setupRepository() {
  const dir = mkdtempSync(join(tmpdir(), "vems-notes-repo-"));
  const db = new SqliteClient(join(dir, "platform.sqlite"));
  const now = "2026-09-16T15:00:00.000Z";
  await db.execute(`INSERT INTO incidents (incident_id,call_id,status,category,priority,description,address,patient_count,created_at,updated_at,correlation_id)
    VALUES ('INC-000001','CALL-001','Active','Medical','P2','Notes test','Test address',1,'${now}','${now}','corr-1');`);
  await db.execute(`INSERT INTO patient_cases (patient_case_id,incident_id,patient_sequence,status,crew_ids_json,created_at,updated_at,correlation_id)
    VALUES ('PCR-000001','INC-000001',1,'Created','[]','${now}','${now}','corr-1');`);
  return { db, now };
}

async function setupService(openemr = {}) {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-notes-service-")), "platform.sqlite"),
    openemr: {
      searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
      createPatient: async () => ({ patient_id: "OE-600" }),
      createEncounter: async () => ({ encounter_id: "ENC-600", status: "Open" }),
      ...openemr
    }
  });
  const meta = { correlationId: "notes-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-16T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Notes", address: "Test", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  return { service, patientCase, meta };
}

test("migration 020 creates the patient_case_notes table", async () => {
  const { db } = await setupRepository();
  const row = await db.queryOne(`SELECT name FROM sqlite_master WHERE type='table' AND name='patient_case_notes';`);
  assert.equal(row?.name, "patient_case_notes");
});

test("PatientCaseNoteRepository round-trips tags and keeps chronological order", async () => {
  const { db, now } = await setupRepository();
  const repository = new PatientCaseNoteRepository(db);
  await repository.create({
    note_id: "NOTE-2", patient_case_id: "PCR-000001", encounter_id: null,
    tags: ["general"], note_text: "Second note", authored_at: "2026-09-16T15:02:00.000Z",
    clinician_id: "STAFF-001", created_at: now, correlation_id: "corr-1"
  });
  await repository.create({
    note_id: "NOTE-1", patient_case_id: "PCR-000001", encounter_id: null,
    tags: ["scene_safety", "law_enforcement_involvement"], note_text: "First note", authored_at: "2026-09-16T15:01:00.000Z",
    clinician_id: "STAFF-001", created_at: now, correlation_id: "corr-1"
  });
  const notes = await repository.list("PCR-000001");
  assert.deepEqual(notes.map(n => n.note_id), ["NOTE-1", "NOTE-2"]);
  assert.deepEqual(notes[0].tags, ["scene_safety", "law_enforcement_involvement"]);
});

test("createPatientCaseNote requires at least one tag from the controlled vocabulary", async () => {
  const { service, patientCase, meta } = await setupService();
  await assert.rejects(
    () => service.createPatientCaseNote(patientCase.patient_case_id, { tags: [], text: "No tags" }, meta),
    /tags must be a non-empty array/
  );
  await assert.rejects(
    () => service.createPatientCaseNote(patientCase.patient_case_id, { tags: ["not_a_real_tag"], text: "Bad tag" }, meta),
    /Unknown note tags: not_a_real_tag/
  );
});

test("createPatientCaseNote requires non-empty text", async () => {
  const { service, patientCase, meta } = await setupService();
  await assert.rejects(
    () => service.createPatientCaseNote(patientCase.patient_case_id, { tags: ["general"], text: "   " }, meta),
    /text is required/
  );
});

test("createPatientCaseNote persists a structured note, deduplicates tags, and appends a timeline event", async () => {
  const { service, patientCase, meta } = await setupService();
  const note = await service.createPatientCaseNote(patientCase.patient_case_id, {
    tags: ["scene_safety", "scene_safety", "mechanism_of_injury"],
    text: "Downed power line near the vehicle; fire service requested."
  }, meta);

  assert.deepEqual(note.tags, ["scene_safety", "mechanism_of_injury"]);
  assert.equal(note.note_text, "Downed power line near the vehicle; fire service requested.");
  assert.equal(note.clinician_id, patientCase.lead_clinician_id ?? null);

  const notes = await service.listPatientCaseNotes(patientCase.patient_case_id);
  assert.equal(notes.length, 1);

  const timeline = await service.listPatientCaseTimeline(patientCase.patient_case_id);
  assert.ok(timeline.some(event => event.event_type === "note_recorded" && event.source_entity_id === note.note_id));
});

test("a note tagged safeguarding_concern auto-raises a QA flag on the next ePCR version, other tags stay informational", async () => {
  const { service, patientCase, meta } = await setupService();
  await service.createPatientCaseNote(patientCase.patient_case_id, { tags: ["general"], text: "Routine note, nothing concerning." }, meta);
  await service.createPatientCaseNote(patientCase.patient_case_id, { tags: ["safeguarding_concern"], text: "Signs of possible neglect at the home." }, meta);

  await service.createEpcrVersion(patientCase.patient_case_id, {}, meta);

  const flags = await service.listEpcrQaFlags(patientCase.patient_case_id);
  const safeguardingFlags = flags.filter(flag => flag.flag_type === "safeguarding_concern");
  assert.equal(safeguardingFlags.length, 1);
  assert.equal(safeguardingFlags[0].source, "system:patient_case_note");
  assert.equal(safeguardingFlags[0].raised_by, "system");
});

test("createPatientCaseNote is blocked once the ePCR is finalized", async () => {
  const { service, patientCase, meta } = await setupService();
  await service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-600" }, meta);
  await service.savePatientCaseDemographics(patientCase.patient_case_id, { first_name: "Jane", last_name: "Doe" }, meta);
  await service.createEncounterForPatientCase(patientCase.patient_case_id, { care_started_at: "2026-09-16T10:05:00Z", presenting_complaint: "Test" }, meta);
  await service.createPatientCaseAssessment(patientCase.patient_case_id, { section_type: "primary_survey", payload: { airway: "patent" } }, meta);
  await service.setPatientCaseDisposition(patientCase.patient_case_id, { outcome: "treated_not_transported", reason: "No transport required" }, meta);

  await service.completeEpcr(patientCase.patient_case_id, meta);
  await service.signEpcr(patientCase.patient_case_id, { signer_role: "treating_clinician", signer_identity: "STAFF-001" }, meta);
  await service.transitionEpcr(patientCase.patient_case_id, "submitted", meta);
  await service.transitionEpcr(patientCase.patient_case_id, "qa_review", meta);
  await service.transitionEpcr(patientCase.patient_case_id, "final", meta);

  await assert.rejects(
    () => service.createPatientCaseNote(patientCase.patient_case_id, { tags: ["general"], text: "Too late" }, meta),
    /EPCR_LOCKED|locked/i
  );
});

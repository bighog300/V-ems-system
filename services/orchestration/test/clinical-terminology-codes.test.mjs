import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

// Stage 13 milestone 13b: the active compliance profile's code lists,
// wired into the existing free-text clinical fields additively -- a
// *_code column populated alongside medication_name/procedure_name/
// outcome, never replacing them.

async function setup() {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-terminology-")), "platform.sqlite"),
    openemr: {
      searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
      createPatient: async () => ({ patient_id: "OE-700" }),
      createEncounter: async () => ({ encounter_id: "ENC-700", status: "Open" }),
      createIntervention: async () => ({ intervention_id: "INT-700" })
    }
  });
  const meta = { correlationId: "terminology-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Terminology test", address: "Test", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  await service.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-700" }, meta);
  await service.createEncounterForPatientCase(patientCase.patient_case_id, {
    care_started_at: "2026-09-06T10:05:00Z",
    presenting_complaint: "Overdose"
  }, meta);
  return { service, patientCase, meta };
}

test("createPatientCaseMedication resolves medication_code from the active profile's medication code list", async () => {
  const { service, patientCase, meta } = await setup();
  const created = await service.createPatientCaseMedication(patientCase.patient_case_id, {
    medication_name: "Naloxone", dose: "0.4", dose_unit: "mg", route: "IV", performed_at: "2026-09-06T10:10:00Z"
  }, meta);
  assert.equal(created.medication_name, "Naloxone");
  assert.equal(created.medication_code, "M-NAL");
});

test("createPatientCaseMedication resolves via an alias, case-insensitively", async () => {
  const { service, patientCase, meta } = await setup();
  const created = await service.createPatientCaseMedication(patientCase.patient_case_id, {
    medication_name: "narcan", dose: "0.4", dose_unit: "mg", route: "IV", performed_at: "2026-09-06T10:10:00Z"
  }, meta);
  assert.equal(created.medication_code, "M-NAL");
});

test("createPatientCaseMedication leaves medication_code null for an unmapped medication name", async () => {
  const { service, patientCase, meta } = await setup();
  const created = await service.createPatientCaseMedication(patientCase.patient_case_id, {
    medication_name: "Some Unlisted Compound", dose: "1", dose_unit: "mg", route: "IV", performed_at: "2026-09-06T10:10:00Z"
  }, meta);
  assert.equal(created.medication_name, "Some Unlisted Compound");
  assert.equal(created.medication_code, null);
});

test("createPatientCaseProcedure resolves procedure_code from the active profile's procedure code list", async () => {
  const { service, patientCase, meta } = await setup();
  const created = await service.createPatientCaseProcedure(patientCase.patient_case_id, {
    procedure_type: "airway", procedure_name: "Airway management", performed_at: "2026-09-06T10:12:00Z"
  }, meta);
  assert.equal(created.procedure_name, "Airway management");
  assert.equal(created.procedure_code, "P-AIRWAY");
});

test("createPatientCaseProcedure leaves procedure_code null for an unmapped procedure name", async () => {
  const { service, patientCase, meta } = await setup();
  const created = await service.createPatientCaseProcedure(patientCase.patient_case_id, {
    procedure_type: "other", procedure_name: "Bespoke local protocol procedure", performed_at: "2026-09-06T10:12:00Z"
  }, meta);
  assert.equal(created.procedure_code, null);
});

test("setPatientCaseDisposition resolves outcome_code -- every valid outcome resolves, since the reference profile's outcome list mirrors the enforced outcome enum exactly", async () => {
  const { service, patientCase, meta } = await setup();
  const disposition = await service.setPatientCaseDisposition(patientCase.patient_case_id, {
    outcome: "refusal_transport", decision_at: "2026-09-06T10:20:00Z"
  }, meta);
  assert.equal(disposition.outcome, "refusal_transport");
  assert.equal(disposition.outcome_code, "O-REFUSAL_TRANSPORT");
});

test("VEMS_COMPLIANCE_PROFILE selects a different active profile for code resolution", async () => {
  const { registerProfile } = await import("../src/compliance/registry.mjs");
  registerProfile({
    id: "custom-terminology-test-profile",
    name: "Custom",
    version: "1.0.0",
    requiredFields: [],
    codeLists: { medication: [{ code: "CUSTOM-NAL", label: "Naloxone" }] }
  });
  const previous = process.env.VEMS_COMPLIANCE_PROFILE;
  process.env.VEMS_COMPLIANCE_PROFILE = "custom-terminology-test-profile";
  try {
    const { service, patientCase, meta } = await setup();
    const created = await service.createPatientCaseMedication(patientCase.patient_case_id, {
      medication_name: "Naloxone", dose: "0.4", dose_unit: "mg", route: "IV", performed_at: "2026-09-06T10:10:00Z"
    }, meta);
    assert.equal(created.medication_code, "CUSTOM-NAL");
  } finally {
    if (previous === undefined) delete process.env.VEMS_COMPLIANCE_PROFILE;
    else process.env.VEMS_COMPLIANCE_PROFILE = previous;
  }
});

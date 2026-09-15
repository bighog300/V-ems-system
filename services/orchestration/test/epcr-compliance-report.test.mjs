import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

// Stage 13 milestone 13c: getEpcrComplianceReport() validates against the
// active jurisdiction profile (13a/13b) -- distinct from getEpcrReadiness()'s
// own Stage 8 workflow-completeness checks, and deliberately informational
// rather than a state-machine gate.

async function setup() {
  const service = new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-epcr-compliance-")), "platform.sqlite") });
  const meta = { correlationId: "compliance-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Compliance test", address: "1 Main St", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  return { service, patientCase, meta };
}

test("a wholly empty patient case fails the reference profile with the expected missing fields", async () => {
  const { service, patientCase } = await setup();
  const report = await service.getEpcrComplianceReport(patientCase.patient_case_id);
  assert.equal(report.ready, false);
  assert.equal(report.profile_id, "reference-nemsis-v3");
  const missingIds = report.missing.map((m) => m.id);
  assert.ok(missingIds.includes("patient_dob_or_estimated_age"));
  assert.ok(missingIds.includes("disposition_outcome"));
  assert.ok(missingIds.includes("primary_assessment"));
});

test("a patient case with every reference-profile field charted is ready", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  await service.savePatientCaseDemographics(id, { first_name: "Ada", last_name: "Lovelace", dob: "1990-01-01", sex: "female" }, meta);
  await service.createPatientCaseAssessment(id, { section_type: "primary_survey", payload: { airway: "patent" } }, meta);
  await service.setPatientCaseDisposition(id, { outcome: "refusal_transport", reason: "Patient declined" }, meta);
  const report = await service.getEpcrComplianceReport(id);
  assert.equal(report.ready, true);
  assert.deepEqual(report.missing, []);
});

test("compliance validation is informational, not a workflow gate -- an ePCR can complete/finalize while compliance-incomplete", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  // Satisfies getEpcrReadiness()'s Stage 8 workflow gate (identity,
  // demographics, an assessment, a disposition)...
  await service.savePatientCaseDemographics(id, { first_name: "Unknown", unidentified: true, dob_unknown: true }, meta);
  await service.createPatientCaseAssessment(id, { section_type: "refusal_capacity", payload: { capacity: "documented" } }, meta);
  await service.setPatientCaseDisposition(id, { outcome: "refusal_transport", reason: "Patient declined" }, meta);

  const readiness = await service.getEpcrReadiness(id);
  assert.equal(readiness.ready, true, "should satisfy the Stage 8 workflow gate");

  // ...but is still missing reference-profile-required fields (dob, sex)
  // since the patient is unidentified.
  const compliance = await service.getEpcrComplianceReport(id);
  assert.equal(compliance.ready, false, "should NOT satisfy the compliance profile (no dob/sex charted)");

  // completeEpcr() only ever consults readiness -- unaffected by the
  // compliance report being incomplete.
  const completed = await service.completeEpcr(id, meta);
  assert.ok(completed.version);
  assert.equal((await service.getEpcrLifecycle(id)).current_state, "crew_complete");
});

test("getEpcrSummary includes both readiness and compliance as distinct fields", async () => {
  const { service, patientCase } = await setup();
  const summary = await service.getEpcrSummary(patientCase.patient_case_id);
  assert.ok("ready" in summary.readiness);
  assert.ok("ready" in summary.compliance);
  assert.equal(summary.compliance.profile_id, "reference-nemsis-v3");
});

test("getEpcrComplianceReport throws NOT_FOUND for an unknown patient case", async () => {
  const { service } = await setup();
  await assert.rejects(() => service.getEpcrComplianceReport("PCR-000999"), /not found/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";
import { canonicalJson, hashCanonical } from "../src/epcr-finalization.mjs";

async function setup() {
  const service = new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-stage8-")), "stage8.sqlite") });
  const meta = { correlationId: "stage8-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({ call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "Stage 8", address: "Test", patient_count: 1 } }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  await service.savePatientCaseDemographics(patientCase.patient_case_id, { first_name: "Unknown", unidentified: true, dob_unknown: true }, meta);
  await service.createPatientCaseAssessment(patientCase.patient_case_id, { section_type: "refusal_capacity", payload: { capacity: "documented", refusal: true } }, meta);
  await service.setPatientCaseDisposition(patientCase.patient_case_id, { outcome: "refusal_transport", reason: "Patient declined transport" }, meta);
  return { service, patientCase, meta };
}

test("canonical ePCR hashes are stable and sensitive to changes", () => {
  const first = { z: 1, nested: { b: true, a: "x" } };
  const equivalent = { nested: { a: "x", b: true }, z: 1 };
  assert.equal(canonicalJson(first), canonicalJson(equivalent));
  assert.equal(hashCanonical(first), hashCanonical(equivalent));
  assert.notEqual(hashCanonical(first), hashCanonical({ ...first, z: 2 }));
});

test("incomplete ePCR returns exact readiness requirements", async () => {
  const { service, patientCase } = await setup();
  const result = await service.getEpcrReadiness(patientCase.patient_case_id);
  assert.equal(result.ready, true);
  const incomplete = await service.createPatientCase((await service.getPatientCase(patientCase.patient_case_id)).incident_id, { temporary_label: "Incomplete" }, { correlationId: "incomplete" });
  assert.equal((await service.getEpcrReadiness(incomplete.patient_case_id)).ready, false);
  assert.ok((await service.getEpcrReadiness(incomplete.patient_case_id)).missing.some(item => item.id === "demographics"));
  assert.equal((await service.listEpcrVersions(incomplete.patient_case_id)).length, 0);
});

test("finalization flow preserves signed hash and locks clinical mutation", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  const complete = await service.completeEpcr(id, meta);
  assert.ok((await service.listEpcrQaFlags(id)).some(flag => flag.source === "system:disposition"));
  await service.createEpcrQaFlag(id, { flag_type: "manual_clinical_concern", severity: "high" }, meta);
  assert.ok((await service.listEpcrQaFlags(id)).some(flag => flag.flag_type === "manual_clinical_concern"));
  const signature = await service.signEpcr(id, { signer_role: "treating_clinician", signer_identity: "STAFF-001", signer_display_name: "Clinician" }, meta);
  assert.equal(signature[0].record_hash, complete.version.content_hash);
  await service.submitEpcr(id, meta);
  await service.reviewEpcr(id, { action: "accept", comment: "Reviewed" }, { ...meta, actorRole: "clinical_reviewer", actorId: "STAFF-002" });
  await service.reviewEpcr(id, { action: "finalize", comment: "Final" }, { ...meta, actorRole: "supervisor", actorId: "STAFF-003" });
  assert.equal((await service.getEpcrLifecycle(id)).current_state, "final");
  const lockedWrites = [
    () => service.savePatientCaseDemographics(id, { first_name: "Changed" }, meta),
    () => service.createPatientCaseAssessment(id, { section_type: "late", payload: {} }, meta),
    () => service.setPatientCaseDisposition(id, { outcome: "treated_not_transported" }, meta)
  ];
  for (const write of lockedWrites) await assert.rejects(write, error => error.code === "EPCR_LOCKED");
  await assert.rejects(() => service.createPatientCaseObservation(id, { observations: { hr: 80 } }, meta), error => error.code === "EPCR_LOCKED");
  await assert.rejects(() => service.createPatientCaseMedication(id, { medication_name: "Late", dose: "1", dose_unit: "mg", route: "IV" }, meta), error => error.code === "EPCR_LOCKED");
  await assert.rejects(() => service.createPatientCaseProcedure(id, { procedure_type: "late", procedure_name: "Late" }, meta), error => error.code === "EPCR_LOCKED");
  const amendment = await service.createEpcrAmendment(id, { reason: "Corrected refusal detail", affected_path: "assessment.refusal", before_value: "old", after_value: "corrected" }, { ...meta, actorRole: "supervisor" });
  assert.equal(amendment.version.version_number, 2);
  assert.notEqual(amendment.version.content_hash, complete.version.content_hash);
  assert.equal((await service.listEpcrAmendments(id))[0].after_value, "corrected");
});

test("returned PCR preserves submitted version and requires a new completion", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  const first = await service.completeEpcr(id, meta);
  await service.signEpcr(id, { signer_role: "treating_clinician", signer_identity: "STAFF-001" }, meta);
  await service.submitEpcr(id, meta);
  await service.reviewEpcr(id, { action: "return_for_correction", comment: "Add context" }, { ...meta, actorRole: "clinical_reviewer" });
  assert.equal((await service.getEpcrLifecycle(id)).current_state, "returned_for_correction");
  await service.completeEpcr(id, { ...meta, correlationId: "correction" });
  assert.equal((await service.listEpcrVersions(id)).length, 2);
  assert.equal((await service.getEpcrSignatures(id)).length, 1);
  assert.equal((await service.getEpcrSignatures(id))[0].version_id, first.version.version_id);
});

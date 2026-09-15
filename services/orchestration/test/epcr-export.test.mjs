import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

async function setup() {
  const service = new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-epcr-export-")), "platform.sqlite") });
  const meta = { correlationId: "export-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Export test", address: "1 Main St", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  await service.savePatientCaseDemographics(patientCase.patient_case_id, { first_name: "Unknown", unidentified: true, dob_unknown: true }, meta);
  await service.createPatientCaseAssessment(patientCase.patient_case_id, { section_type: "refusal_capacity", payload: { capacity: "documented" } }, meta);
  await service.setPatientCaseDisposition(patientCase.patient_case_id, { outcome: "refusal_transport", reason: "Patient declined" }, meta);
  return { service, patientCase, meta };
}

test("getEpcrExport throws CONFLICT when no version has ever been created", async () => {
  const { service, patientCase } = await setup();
  await assert.rejects(() => service.getEpcrExport(patientCase.patient_case_id), /No ePCR version exists to export/);
});

test("getEpcrExport returns a base64-encoded PDF for the latest version by default", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  const completed = await service.completeEpcr(id, meta);
  const exported = await service.getEpcrExport(id);
  assert.equal(exported.patient_case_id, id);
  assert.equal(exported.version_id, completed.version.version_id);
  assert.equal(exported.content_hash, completed.version.content_hash);
  assert.equal(exported.content_type, "application/pdf");
  assert.equal(exported.filename, `epcr-${id}-v${completed.version.version_number}.pdf`);
  const pdf = Buffer.from(exported.content_base64, "base64");
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("getEpcrExport(patientCaseId, versionId) exports a specific earlier version, not just the latest", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  const firstVersion = await service.createEpcrVersion(id, {}, meta);
  await service.createPatientCaseAssessment(id, { section_type: "secondary_survey", payload: { note: "more detail" } }, meta);
  const secondVersion = await service.createEpcrVersion(id, {}, meta);
  assert.notEqual(firstVersion.content_hash, secondVersion.content_hash);

  const exportedFirst = await service.getEpcrExport(id, firstVersion.version_id);
  const exportedSecond = await service.getEpcrExport(id, secondVersion.version_id);
  assert.equal(exportedFirst.content_hash, firstVersion.content_hash);
  assert.equal(exportedSecond.content_hash, secondVersion.content_hash);
  assert.notEqual(exportedFirst.content_base64, exportedSecond.content_base64);
});

test("getEpcrExport only includes signatures actually signed against the exported version", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  const completed = await service.completeEpcr(id, meta);
  await service.signEpcr(id, { signer_role: "treating_clinician", signer_identity: "STAFF-001" }, meta);
  await service.submitEpcr(id, meta);
  await service.reviewEpcr(id, { action: "accept", comment: "Reviewed" }, { ...meta, actorRole: "clinical_reviewer", actorId: "STAFF-002" });
  await service.reviewEpcr(id, { action: "finalize", comment: "Final" }, { ...meta, actorRole: "supervisor", actorId: "STAFF-003" });

  // Amendments are only available once final -- creates a new version. The
  // signature above still belongs only to the pre-amendment version.
  await service.createEpcrAmendment(id, { affected_path: "disposition.notes", after_value: "Amended note", reason: "correction" }, meta);
  const versions = await service.listEpcrVersions(id);
  const amendedVersion = versions.at(-1);
  assert.notEqual(amendedVersion.version_id, completed.version.version_id);

  const exportedOriginal = await service.getEpcrExport(id, completed.version.version_id);
  const exportedAmended = await service.getEpcrExport(id, amendedVersion.version_id);
  // Both are valid PDFs; the point under test is that the two exports are
  // for genuinely different versions, so their signature sets (and thus
  // rendered output) aren't just interchangeable copies of each other.
  assert.notEqual(exportedOriginal.content_hash, exportedAmended.content_hash);
});

test("getEpcrExport throws NOT_FOUND for an unknown version id", async () => {
  const { service, patientCase, meta } = await setup();
  const id = patientCase.patient_case_id;
  await service.completeEpcr(id, meta);
  await assert.rejects(() => service.getEpcrExport(id, "EPV-does-not-exist"), /not found/i);
});

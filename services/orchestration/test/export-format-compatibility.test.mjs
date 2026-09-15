import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderPcrDocument, extractExportFormatVersion, EXPORT_FORMAT_VERSION } from "../src/reporting/pcr-document.mjs";
import { OrchestrationService } from "../src/index.mjs";

function fakeVersion(overrides = {}) {
  return {
    version_id: "EPV-1",
    patient_case_id: "PCR-000001",
    version_number: 3,
    lifecycle_state: "final",
    content_hash: "abc123",
    hash_algorithm: "sha256",
    source_revision: "manual",
    created_at: "2026-04-16T10:00:00.000Z",
    created_by: "STAFF-001",
    correlation_id: "corr-1",
    content: {
      incident: { incident_id: "INC-000001", category: "medical_emergency", address: "1 Main St" },
      demographics: { first_name: "Ada", last_name: "Lovelace", dob: "1990-01-01", sex: "female" },
      assessments: [{ section_type: "primary_survey", performed_at: "2026-04-16T09:50:00Z" }],
      medications: [{ medication_name: "Naloxone", dose: "0.4", dose_unit: "mg", route: "IV", performed_at: "2026-04-16T09:55:00Z" }],
      procedures: [{ procedure_name: "Airway management", performed_at: "2026-04-16T09:52:00Z" }],
      disposition: { outcome: "transported", destination_facility: "General Hospital", decision_at: "2026-04-16T09:58:00Z" }
    },
    ...overrides
  };
}

test("EXPORT_FORMAT_VERSION is a stable, independent number -- not tied to epcr_versions.version_number", () => {
  assert.equal(EXPORT_FORMAT_VERSION, 1);
  assert.notEqual(EXPORT_FORMAT_VERSION, fakeVersion().version_number);
});

test("extractExportFormatVersion reads back the version a fresh render embeds", async () => {
  const pdf = await renderPcrDocument({ version: fakeVersion(), signatures: [] });
  assert.equal(extractExportFormatVersion(pdf), String(EXPORT_FORMAT_VERSION));
});

test("extractExportFormatVersion returns null for a buffer with no such field, rather than throwing", () => {
  assert.equal(extractExportFormatVersion(Buffer.from("%PDF-1.7\nnot a real pdf\n%%EOF")), null);
  assert.equal(extractExportFormatVersion(Buffer.from("")), null);
});

test("the v1 renderer stays backward-compatible with a pre-13b content shape (no *_code fields at all)", async () => {
  // Simulates an epcr_versions row created before milestone 13b added
  // medication_code/procedure_code/outcome_code -- those keys are simply
  // absent from content, not present-and-null.
  const version = fakeVersion({
    content: {
      incident: { incident_id: "INC-000003", category: "medical_emergency", address: "3 Old St" },
      demographics: { first_name: "Grace", last_name: "Hopper", dob: "1985-01-01", sex: "female" },
      assessments: [{ section_type: "primary_survey", performed_at: "2026-04-16T09:50:00Z" }],
      medications: [{ medication_name: "Aspirin", dose: "300", dose_unit: "mg", route: "PO", performed_at: "2026-04-16T09:55:00Z" }],
      procedures: [{ procedure_name: "Splinting", performed_at: "2026-04-16T09:52:00Z" }],
      disposition: { outcome: "transported", destination_facility: "General Hospital", decision_at: "2026-04-16T09:58:00Z" }
    }
  });
  const pdf = await renderPcrDocument({ version, signatures: [] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(extractExportFormatVersion(pdf), String(EXPORT_FORMAT_VERSION));
});

test("the v1 renderer stays backward-compatible with a pre-Stage-8 minimal shape (no assessments/medications/procedures/disposition sections at all)", async () => {
  const version = fakeVersion({
    content: {
      incident: { incident_id: "INC-000004", category: "trauma", address: "4 Old St" },
      demographics: null
    }
  });
  const pdf = await renderPcrDocument({ version, signatures: [] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(extractExportFormatVersion(pdf), String(EXPORT_FORMAT_VERSION));
});

test("the v1 renderer tolerates a future content shape with unknown extra fields, ignoring what it doesn't recognize", async () => {
  const version = fakeVersion({
    content: {
      ...fakeVersion().content,
      // Fields no milestone has added yet -- a stand-in for whatever
      // Stage 14+ eventually adds to the snapshot shape.
      future_vitals_trend: { pattern: "improving" },
      future_scene_hazards: ["downed power line"]
    }
  });
  const pdf = await renderPcrDocument({ version, signatures: [] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.equal(extractExportFormatVersion(pdf), String(EXPORT_FORMAT_VERSION));
});

test("golden regression: format v1's exact byte output for a fixed input is pinned -- a change here means the v1 contract itself changed", async () => {
  // Unlike the determinism test in pcr-document.test.mjs (which only
  // proves *this* build renders the *same* version identically twice),
  // this pins the actual bytes against a hash captured when
  // EXPORT_FORMAT_VERSION was 1. If a future schema/layout change to the
  // renderer changes this hash without also bumping EXPORT_FORMAT_VERSION,
  // that's exactly the failure this milestone exists to catch: the v1
  // format silently changing shape out from under anything that depends
  // on it.
  const pdf = await renderPcrDocument({ version: fakeVersion(), signatures: [{ signature_id: "SIG-1", version_id: "EPV-1", record_hash: "abc123", signer_role: "treating_clinician", signer_identity: "STAFF-001", signed_at: "2026-04-16T10:01:00Z" }] });
  const { createHash } = await import("node:crypto");
  assert.equal(createHash("sha256").update(pdf).digest("hex"), "a4eb8b6e0b15e87f782d223d44b57bb6e84a92349b61a716575d528717ffa3c6");
  assert.equal(extractExportFormatVersion(pdf), "1");
});

test("getEpcrExport's JSON metadata reports export_format_version alongside the clinical version_number", async () => {
  const service = new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-export-format-")), "platform.sqlite") });
  const meta = { correlationId: "export-format-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Export format test", address: "1 Main St", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  await service.savePatientCaseDemographics(patientCase.patient_case_id, { first_name: "Unknown", unidentified: true, dob_unknown: true }, meta);
  await service.createPatientCaseAssessment(patientCase.patient_case_id, { section_type: "refusal_capacity", payload: { capacity: "documented" } }, meta);
  await service.setPatientCaseDisposition(patientCase.patient_case_id, { outcome: "refusal_transport", reason: "Patient declined" }, meta);
  await service.completeEpcr(patientCase.patient_case_id, meta);

  const exported = await service.getEpcrExport(patientCase.patient_case_id);
  assert.equal(exported.export_format_version, EXPORT_FORMAT_VERSION);
  const pdf = Buffer.from(exported.content_base64, "base64");
  assert.equal(extractExportFormatVersion(pdf), String(exported.export_format_version));
});

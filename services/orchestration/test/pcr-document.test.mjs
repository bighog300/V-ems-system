import test from "node:test";
import assert from "node:assert/strict";
import { renderPcrDocument } from "../src/reporting/pcr-document.mjs";

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
      medications: [{ medication_name: "Naloxone", medication_code: "M-NAL", dose: "0.4", dose_unit: "mg", route: "IV", performed_at: "2026-04-16T09:55:00Z" }],
      procedures: [{ procedure_name: "Airway management", procedure_code: "P-AIRWAY", performed_at: "2026-04-16T09:52:00Z" }],
      disposition: { outcome: "transported", outcome_code: "O-TRANSPORTED", destination_facility: "General Hospital", decision_at: "2026-04-16T09:58:00Z" }
    },
    ...overrides
  };
}

function fakeSignature(overrides = {}) {
  return {
    signature_id: "SIG-1",
    version_id: "EPV-1",
    record_hash: "abc123",
    signer_role: "treating_clinician",
    signer_identity: "STAFF-001",
    signed_at: "2026-04-16T10:01:00Z",
    ...overrides
  };
}

test("renderPcrDocument produces a well-formed PDF buffer", async () => {
  const pdf = await renderPcrDocument({ version: fakeVersion(), signatures: [fakeSignature()] });
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pdf.length > 0);
});

test("renderPcrDocument is deterministic -- rendering the same version twice produces byte-identical output", async () => {
  const version = fakeVersion();
  const signatures = [fakeSignature()];
  const first = await renderPcrDocument({ version, signatures });
  const second = await renderPcrDocument({ version, signatures });
  assert.ok(first.equals(second), "two renders of the same version should be byte-identical");
});

test("renderPcrDocument output differs when the version's content differs", async () => {
  const first = await renderPcrDocument({ version: fakeVersion(), signatures: [] });
  const second = await renderPcrDocument({ version: fakeVersion({ version_number: 4 }), signatures: [] });
  assert.ok(!first.equals(second));
});

test("renderPcrDocument handles an unidentified patient, no signatures, and empty clinical sections", async () => {
  const version = fakeVersion({
    content: {
      incident: { incident_id: "INC-000002", category: "trauma", address: "2 Side St" },
      demographics: { unidentified: true },
      assessments: [],
      medications: [],
      procedures: [],
      disposition: null
    }
  });
  const pdf = await renderPcrDocument({ version, signatures: [] });
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
});

test("renderPcrDocument's output differs between a signature that matches the version's content hash and one that doesn't", async () => {
  // pdfkit writes standard-font text as hex-encoded glyph codes split
  // across TJ array entries for kerning, so asserting on literal ASCII
  // text in the content stream isn't practical without a PDF-text-
  // extraction dependency. Comparing rendered output for a matching vs.
  // mismatched record_hash is a lighter-weight way to prove the mismatch
  // actually changes what's rendered (the "bound"/"DOES NOT match" wording
  // in pcr-document.mjs), without asserting on encoding internals.
  const version = fakeVersion({ content_hash: "current-hash" });
  const matching = await renderPcrDocument({ version, signatures: [fakeSignature({ record_hash: "current-hash" })] });
  const mismatched = await renderPcrDocument({ version, signatures: [fakeSignature({ record_hash: "stale-hash" })] });
  assert.ok(!matching.equals(mismatched));
});

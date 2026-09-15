import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function service() {
  const dir = mkdtempSync(join(tmpdir(), "vems-attachments-"));
  return new OrchestrationService({
    dbPath: join(dir, "platform.sqlite"),
    objectStorageOptions: { rootDir: join(dir, "objects"), encryptionKey: "c".repeat(64) }
  });
}

async function withCase(o) {
  const incident = await o.createIncident(
    { call: { call_source: "phone", received_at: "2026-01-01T00:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "d", address: "a", patient_count: 1 } },
    { correlationId: "incident-correlation" }
  );
  const patientCase = await o.createPatientCase(incident.incident_id, {}, { correlationId: "case-correlation" });
  return { incident, patientCase };
}

const meta = { correlationId: "upload-correlation", actorId: "STAFF-001", actorRole: "field_crew" };
const photoPayload = (overrides = {}) => ({
  attachment_id: "ATT-photo-1",
  kind: "photo",
  file_name: "scene.jpg",
  mime_type: "image/jpeg",
  content_base64: Buffer.from("fake jpeg bytes").toString("base64"),
  ...overrides
});

test("uploads an attachment and returns metadata without content", async () => {
  const o = service();
  const { patientCase, incident } = await withCase(o);
  const record = await o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload(), meta);
  assert.equal(record.attachment_id, "ATT-photo-1");
  assert.equal(record.patient_case_id, patientCase.patient_case_id);
  assert.equal(record.incident_id, incident.incident_id);
  assert.equal(record.kind, "photo");
  assert.equal(record.file_name, "scene.jpg");
  assert.equal(record.mime_type, "image/jpeg");
  assert.equal(record.size_bytes, Buffer.from("fake jpeg bytes").length);
  assert.equal(typeof record.checksum, "string");
  assert.equal("content_base64" in record, false);
});

test("re-uploading the same attachment id with identical content is idempotent", async () => {
  const o = service();
  const { patientCase } = await withCase(o);
  const first = await o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload(), meta);
  const second = await o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload(), { ...meta, correlationId: "replay-correlation" });
  assert.equal(second.attachment_id, first.attachment_id);
  assert.equal(second.checksum, first.checksum);
  assert.equal(second.created_at, first.created_at);
});

test("re-uploading the same attachment id with different content is rejected", async () => {
  const o = service();
  const { patientCase } = await withCase(o);
  await o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload(), meta);
  await assert.rejects(
    () => o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ content_base64: Buffer.from("different bytes").toString("base64") }), meta),
    (error) => error.code === "CONFLICT"
  );
});

test("an attachment id already used by another patient case is rejected", async () => {
  const o = service();
  const { patientCase: caseA } = await withCase(o);
  const { patientCase: caseB } = await withCase(o);
  await o.uploadPatientCaseAttachment(caseA.patient_case_id, photoPayload(), meta);
  await assert.rejects(
    () => o.uploadPatientCaseAttachment(caseB.patient_case_id, photoPayload(), meta),
    (error) => error.code === "CONFLICT"
  );
});

test("upload validates required fields and rejects unknown ones", async () => {
  const o = service();
  const { patientCase } = await withCase(o);
  await assert.rejects(() => o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ kind: "video" }), meta), (e) => e.code === "INVALID_PAYLOAD");
  await assert.rejects(() => o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ file_name: "" }), meta), (e) => e.code === "INVALID_PAYLOAD");
  await assert.rejects(() => o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ content_base64: "" }), meta), (e) => e.code === "INVALID_PAYLOAD");
  await assert.rejects(() => o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ extra_field: "nope" }), meta), (e) => e.code === "INVALID_PAYLOAD");
});

test("upload fails for a nonexistent patient case", async () => {
  const o = service();
  await withCase(o);
  await assert.rejects(() => o.uploadPatientCaseAttachment("PCR-999999", photoPayload(), meta), (e) => e.code === "NOT_FOUND");
});

test("lists attachment metadata for a patient case, ordered, without content", async () => {
  const o = service();
  const { patientCase } = await withCase(o);
  await o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ attachment_id: "ATT-1", captured_at: "2026-01-01T00:00:01Z" }), meta);
  await o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ attachment_id: "ATT-2", captured_at: "2026-01-01T00:00:02Z", content_base64: Buffer.from("second file").toString("base64") }), meta);

  const list = await o.listPatientCaseAttachments(patientCase.patient_case_id);
  assert.deepEqual(list.map((a) => a.attachment_id), ["ATT-1", "ATT-2"]);
  assert.ok(list.every((a) => !("content_base64" in a)));
});

test("fetches decrypted attachment content on demand", async () => {
  const o = service();
  const { patientCase } = await withCase(o);
  const content = Buffer.from("document bytes").toString("base64");
  await o.uploadPatientCaseAttachment(patientCase.patient_case_id, photoPayload({ attachment_id: "ATT-doc", kind: "document", file_name: "form.pdf", mime_type: "application/pdf", content_base64: content }), meta);

  const fetched = await o.getPatientCaseAttachmentContent(patientCase.patient_case_id, "ATT-doc");
  assert.equal(fetched.content_base64, content);
  assert.equal(fetched.mime_type, "application/pdf");
});

test("getPatientCaseAttachmentContent 404s for an attachment that doesn't belong to the given case", async () => {
  const o = service();
  const { patientCase: caseA } = await withCase(o);
  const { patientCase: caseB } = await withCase(o);
  await o.uploadPatientCaseAttachment(caseA.patient_case_id, photoPayload(), meta);
  await assert.rejects(() => o.getPatientCaseAttachmentContent(caseB.patient_case_id, "ATT-photo-1"), (e) => e.code === "NOT_FOUND");
});

test("getPatientCaseAttachmentContent 404s for an unknown attachment id", async () => {
  const o = service();
  const { patientCase } = await withCase(o);
  await assert.rejects(() => o.getPatientCaseAttachmentContent(patientCase.patient_case_id, "ATT-nope"), (e) => e.code === "NOT_FOUND");
});

test("server-generates an attachment id when the caller doesn't supply one", async () => {
  const o = service();
  const { patientCase } = await withCase(o);
  const { attachment_id: _omit, ...payload } = photoPayload();
  const record = await o.uploadPatientCaseAttachment(patientCase.patient_case_id, payload, meta);
  assert.match(record.attachment_id, /^ATT-/);
});

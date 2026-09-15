import { randomUUID } from "node:crypto";
import { ApiError } from "@vems/shared";

const ATTACHMENT_KINDS = new Set(["photo", "document"]);

const invalid = (message) => { throw new ApiError("INVALID_PAYLOAD", message, 400); };
const conflict = (message) => { throw new ApiError("CONFLICT", message, 409); };

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalid("Attachment payload must be an object");
  const allowed = ["attachment_id", "kind", "file_name", "mime_type", "size_bytes", "content_base64", "captured_at"];
  const unknown = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid(`Unknown attachment fields: ${unknown.join(", ")}`);
  if (!ATTACHMENT_KINDS.has(payload.kind)) invalid(`kind must be one of: ${[...ATTACHMENT_KINDS].join(", ")}`);
  if (typeof payload.file_name !== "string" || !payload.file_name.trim()) invalid("file_name is required");
  if (typeof payload.mime_type !== "string" || !payload.mime_type.trim()) invalid("mime_type is required");
  if (typeof payload.content_base64 !== "string" || !payload.content_base64.trim()) invalid("content_base64 is required");
}

export const attachmentMethods = {
  /**
   * Server-side half of Stage 11's on-device attachment queue: mobile
   * already encrypts and queues captured photos/documents locally
   * (attachmentStore.ts) with no sync path, since there was nowhere to
   * sync to before this milestone's encrypted object storage existed.
   * The attachment's own id -- generated client-side when it was queued
   * (the same id attachmentStore.ts already tracks) -- is the natural
   * idempotency key for a retried upload: content-addressed storage
   * already dedupes identical bytes, this just makes a retried upload of
   * the *same queued attachment* a clean replay instead of a second row.
   */
  async uploadPatientCaseAttachment(patientCaseId, payload, meta) {
    const patientCase = await this.getPatientCase(patientCaseId);
    validatePayload(payload);

    const attachmentId = payload.attachment_id ?? `ATT-${randomUUID()}`;
    const buffer = Buffer.from(payload.content_base64, "base64");
    if (buffer.length === 0) invalid("content_base64 must decode to a non-empty file");

    const existing = await this.attachments.find(attachmentId);
    if (existing) {
      if (existing.patient_case_id !== patientCaseId) conflict("Attachment id already belongs to a different patient case");
      const stored = await this.objectStorage.putObject(buffer, { contentType: payload.mime_type });
      if (stored.checksum !== existing.checksum) conflict("Attachment id was reused with different content");
      return existing;
    }

    const stored = await this.objectStorage.putObject(buffer, { contentType: payload.mime_type });
    const now = new Date().toISOString();
    const record = await this.attachments.create({
      attachment_id: attachmentId,
      patient_case_id: patientCaseId,
      incident_id: patientCase.incident_id,
      kind: payload.kind,
      file_name: payload.file_name,
      mime_type: payload.mime_type,
      size_bytes: stored.sizeBytes,
      checksum: stored.checksum,
      storage_key: stored.key,
      captured_at: payload.captured_at ?? now,
      uploaded_by: meta.actorId ?? null,
      created_at: now,
      correlation_id: meta.correlationId
    });
    await this.audit("patient_case_attachment", attachmentId, "upload_attachment", meta.correlationId, undefined, { ...record, storage_key: undefined });
    await this.event("PatientCaseAttachmentUploaded", meta.correlationId, { patient_case_id: patientCaseId, incident_id: patientCase.incident_id, attachment_id: attachmentId, kind: payload.kind, size_bytes: stored.sizeBytes });
    return record;
  },

  async listPatientCaseAttachments(patientCaseId) {
    await this.getPatientCase(patientCaseId);
    return this.attachments.list(patientCaseId);
  },

  async getPatientCaseAttachmentContent(patientCaseId, attachmentId) {
    await this.getPatientCase(patientCaseId);
    const record = await this.attachments.find(attachmentId);
    if (!record || record.patient_case_id !== patientCaseId) throw new ApiError("NOT_FOUND", "Attachment not found", 404);

    const stored = await this.objectStorage.getObject(record.storage_key);
    if (!stored) throw new ApiError("CONFLICT", "Attachment content is missing from object storage", 409);

    return { ...record, content_base64: stored.content.toString("base64") };
  }
};

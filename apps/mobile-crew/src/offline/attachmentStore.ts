import { decryptJson, encryptJson, type OfflineCryptoModule } from "./crypto.ts";
import {
  getAttachmentRow,
  insertAttachment,
  listAttachmentsByPatientCase,
  type AttachmentKind,
  type AttachmentRow,
  type AttachmentStatus,
  type OfflineSqliteLike
} from "./db.ts";

export interface AttachmentCryptoModule extends OfflineCryptoModule {
  randomUUID(): string;
}

// expo-crypto is a native module lazily imported the same way as
// outboxStore.ts's other native dependencies.
let cryptoModulePromise: Promise<AttachmentCryptoModule> | null = null;
function getCryptoModule(): Promise<AttachmentCryptoModule> {
  if (!cryptoModulePromise) cryptoModulePromise = import("expo-crypto");
  return cryptoModulePromise;
}

export interface AttachmentMetadata {
  attachmentId: string;
  patientCaseId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  capturedAt: string;
}

function toMetadata(row: AttachmentRow): AttachmentMetadata {
  return {
    attachmentId: row.attachment_id,
    patientCaseId: row.patient_case_id,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    capturedAt: row.captured_at
  };
}

export interface NewAttachment {
  patientCaseId: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Raw file content, base64-encoded (what expo-image-picker/expo-file-system already hand back). */
  base64Content: string;
}

/**
 * Encrypts and queues a captured attachment. The content is encrypted with
 * the same device key and the same `encryptJson`/`decryptJson` primitives
 * the outbox and read cache already use — the base64 string is just
 * another JSON-serializable value, so no new crypto code was needed for
 * this milestone.
 */
export async function enqueueAttachment(
  db: OfflineSqliteLike,
  key: Uint8Array,
  attachment: NewAttachment,
  deps: { cryptoModule?: AttachmentCryptoModule } = {}
): Promise<string> {
  const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
  const attachmentId = cryptoModule.randomUUID();
  const encryptedContent = await encryptJson(attachment.base64Content, key, { cryptoModule });
  await insertAttachment(db, {
    attachmentId,
    patientCaseId: attachment.patientCaseId,
    kind: attachment.kind,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    encryptedContent,
    capturedAt: new Date().toISOString()
  });
  return attachmentId;
}

/** Metadata only — never decrypts, so listing attachments can never expose captured content. */
export async function listAttachments(db: OfflineSqliteLike, patientCaseId: string): Promise<AttachmentMetadata[]> {
  const rows = await listAttachmentsByPatientCase(db, patientCaseId);
  return rows.map(toMetadata);
}

/** Decrypts one attachment's content on demand (e.g. to preview it), returning the original base64 string. */
export async function getAttachmentContent(db: OfflineSqliteLike, key: Uint8Array, attachmentId: string): Promise<string | null> {
  const row = await getAttachmentRow(db, attachmentId);
  if (!row) return null;
  return decryptJson<string>(row.encrypted_content, key);
}

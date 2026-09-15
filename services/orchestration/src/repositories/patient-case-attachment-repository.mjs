import { sqlValue } from "../db.mjs";

function map(row) {
  if (!row) return undefined;
  return { ...row, size_bytes: Number(row.size_bytes) };
}

export class PatientCaseAttachmentRepository {
  constructor(db) {
    this.db = db;
  }

  async create(record) {
    await this.db.execute(`INSERT INTO patient_case_attachments
      (attachment_id, patient_case_id, incident_id, kind, file_name, mime_type, size_bytes, checksum, storage_key, captured_at, uploaded_by, created_at, correlation_id)
      VALUES (${sqlValue(record.attachment_id)}, ${sqlValue(record.patient_case_id)}, ${sqlValue(record.incident_id)}, ${sqlValue(record.kind)}, ${sqlValue(record.file_name)}, ${sqlValue(record.mime_type)}, ${sqlValue(record.size_bytes)}, ${sqlValue(record.checksum)}, ${sqlValue(record.storage_key)}, ${sqlValue(record.captured_at)}, ${sqlValue(record.uploaded_by)}, ${sqlValue(record.created_at)}, ${sqlValue(record.correlation_id)});`);
    return this.find(record.attachment_id);
  }

  async find(attachmentId) {
    return map(await this.db.queryOne(`SELECT * FROM patient_case_attachments WHERE attachment_id=${sqlValue(attachmentId)};`));
  }

  async list(patientCaseId) {
    const rows = await this.db.queryAll(`SELECT * FROM patient_case_attachments WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY captured_at, attachment_id;`);
    return rows.map(map);
  }
}

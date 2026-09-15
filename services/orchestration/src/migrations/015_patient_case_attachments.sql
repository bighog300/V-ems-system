CREATE TABLE IF NOT EXISTS patient_case_attachments (
  attachment_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  incident_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_case_attachments_case ON patient_case_attachments(patient_case_id, captured_at);

-- Stage 15 milestone 15d: structured crew notes. A small controlled tag
-- vocabulary (validated in clinical-record.mjs, not the schema -- the
-- vocabulary is expected to evolve faster than a migration) plus free
-- text, mirroring the existing epcr_qa_flags shape (flag_type +
-- resolution_note) per the Stage 15 design decision rather than inventing
-- a new pattern.
CREATE TABLE IF NOT EXISTS patient_case_notes (
  note_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  encounter_id TEXT,
  tags_json TEXT NOT NULL,
  note_text TEXT NOT NULL,
  authored_at TEXT NOT NULL,
  clinician_id TEXT,
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_case_notes_timeline
  ON patient_case_notes(patient_case_id, authored_at, note_id);

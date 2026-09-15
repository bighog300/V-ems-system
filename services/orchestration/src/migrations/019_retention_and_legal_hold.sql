-- Stage 13 milestone 13g: retention_expires_at + legal_hold, per the
-- design decision in docs/STAGE13_COMPLIANCE_REPORTING_PLAN.md. Applied
-- at the patient_case level -- the clinical record's aggregate root --
-- rather than duplicated onto epcr_versions/signatures/amendments/etc:
-- those are archived and purged as part of their parent case, never
-- independently, so they don't need their own copies of these columns.
--
-- archived_at marks a case the purge job has already processed.
-- "Deletion" always means archival-then-mark (see patient_case_archives
-- below): a purged case's row is never hard-DELETEd, mirroring the same
-- soft/reversible posture as Stage 12's backup/DR work.
ALTER TABLE patient_cases ADD COLUMN retention_expires_at TEXT;
ALTER TABLE patient_cases ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE patient_cases ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_patient_cases_retention ON patient_cases(retention_expires_at, legal_hold, archived_at);

-- One row per archival run of a patient case (in the ordinary case, at
-- most one -- a case is only ever archived once retention_expires_at
-- passes with no legal hold). storage_key points into the same encrypted,
-- content-addressed object storage attachments already use.
CREATE TABLE IF NOT EXISTS patient_case_archives (
  archive_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id),
  storage_key TEXT NOT NULL,
  checksum TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  archived_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_patient_case_archives_case ON patient_case_archives(patient_case_id, archived_at);

-- D11: reconciling a provisional patient with a verified one records that OpenEMR needs an administrative merge, but nothing
-- tracked whether it happened, so provisional "Unidentified PCR-..." patients were left behind unnoticed. OpenEMR has no API
-- for a merge (only the interactive Merge Patients page), so an administrator does it there and attests it here.
ALTER TABLE patient_case_identity_reconciliations ADD COLUMN merged_at TEXT;
ALTER TABLE patient_case_identity_reconciliations ADD COLUMN merged_by TEXT;
ALTER TABLE patient_case_identity_reconciliations ADD COLUMN merge_note TEXT;
CREATE INDEX IF NOT EXISTS idx_identity_reconciliations_pending ON patient_case_identity_reconciliations(created_at) WHERE merged_at IS NULL;

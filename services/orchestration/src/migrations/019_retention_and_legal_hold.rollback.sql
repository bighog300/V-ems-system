DROP INDEX IF EXISTS idx_patient_case_archives_case;
DROP TABLE IF EXISTS patient_case_archives;
DROP INDEX IF EXISTS idx_patient_cases_retention;
ALTER TABLE patient_cases DROP COLUMN archived_at;
ALTER TABLE patient_cases DROP COLUMN legal_hold;
ALTER TABLE patient_cases DROP COLUMN retention_expires_at;

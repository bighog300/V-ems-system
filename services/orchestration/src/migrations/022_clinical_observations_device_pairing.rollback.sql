DROP INDEX IF EXISTS idx_clinical_observations_device_pairing;
ALTER TABLE clinical_observations DROP COLUMN device_pairing_id;

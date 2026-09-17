-- Stage 15 milestone 15f: the provenance link from a BLE-sourced
-- clinical_observations row back to the device_pairings row that
-- produced it -- so a reading is traceably device-sourced vs.
-- crew-manually-entered. Nullable: most observations today are, and will
-- keep being, manually entered.
ALTER TABLE clinical_observations ADD COLUMN device_pairing_id TEXT REFERENCES device_pairings(pairing_id);
CREATE INDEX IF NOT EXISTS idx_clinical_observations_device_pairing ON clinical_observations(device_pairing_id);

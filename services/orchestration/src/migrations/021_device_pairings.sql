-- Stage 15 milestone 15f: the device_pairings registry. One row per
-- pairing lifecycle: a physical vitals monitor (identified by its serial
-- number, since a vendor/model alone doesn't distinguish two units of the
-- same model) gets paired to the vehicle it lives in, and later linked to
-- the specific patient case it was used for during that pairing. Both
-- paired_at/unpaired_at (the pairing session itself) and, separately,
-- patient_case_id (set once the crew starts using it on a specific
-- patient, possibly some time after pairing to the vehicle) are tracked
-- so a specific physical unit's full history is queryable if it's later
-- found miscalibrated or recalled -- across every vehicle and patient
-- case it was ever paired to, not just its current pairing.
CREATE TABLE IF NOT EXISTS device_pairings (
  pairing_id TEXT PRIMARY KEY,
  serial_number TEXT NOT NULL,
  vendor TEXT NOT NULL,
  model TEXT NOT NULL,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(vehicle_id),
  patient_case_id TEXT REFERENCES patient_cases(patient_case_id),
  paired_at TEXT NOT NULL,
  unpaired_at TEXT,
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_pairings_serial ON device_pairings(serial_number, paired_at);
CREATE INDEX IF NOT EXISTS idx_device_pairings_vehicle ON device_pairings(vehicle_id, paired_at);
CREATE INDEX IF NOT EXISTS idx_device_pairings_patient_case ON device_pairings(patient_case_id);

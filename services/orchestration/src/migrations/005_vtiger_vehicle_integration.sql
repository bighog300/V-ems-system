CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  operational_status TEXT NOT NULL,
  service_status TEXT NOT NULL,
  home_station TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_vtiger_links (
  vehicle_id TEXT PRIMARY KEY,
  remote_id TEXT,
  remote_number TEXT,
  external_key TEXT NOT NULL UNIQUE,
  create_correlation_id TEXT NOT NULL,
  last_correlation_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vehicle_vtiger_links_status ON vehicle_vtiger_links (sync_status);
CREATE INDEX IF NOT EXISTS idx_assignments_vehicle_active ON assignments (vehicle_id, status);

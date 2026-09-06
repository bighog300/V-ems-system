CREATE TABLE IF NOT EXISTS personnel (
  staff_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  operational_status TEXT NOT NULL,
  home_station TEXT NOT NULL,
  callsign TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personnel_operational_status ON personnel(operational_status);

CREATE TABLE IF NOT EXISTS personnel_vtiger_links (
  staff_id TEXT PRIMARY KEY,
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
  FOREIGN KEY (staff_id) REFERENCES personnel(staff_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assignment_personnel_vtiger_links (
  assignment_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  assignment_remote_id TEXT,
  personnel_remote_id TEXT,
  junction_remote_id TEXT,
  junction_remote_number TEXT,
  external_key TEXT NOT NULL UNIQUE,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT,
  create_correlation_id TEXT NOT NULL,
  last_correlation_id TEXT NOT NULL,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (assignment_id, staff_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES personnel(staff_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_personnel_staff ON assignment_personnel_vtiger_links(staff_id);
CREATE INDEX IF NOT EXISTS idx_assignment_personnel_status ON assignment_personnel_vtiger_links(sync_status);
CREATE INDEX IF NOT EXISTS idx_assignments_active_status ON assignments(status);

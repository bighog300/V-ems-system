CREATE TABLE IF NOT EXISTS assignment_vtiger_links (
  assignment_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  remote_id TEXT,
  remote_number TEXT,
  external_key TEXT NOT NULL UNIQUE,
  incident_remote_id TEXT,
  create_correlation_id TEXT NOT NULL,
  last_correlation_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
  FOREIGN KEY (incident_id) REFERENCES incidents(incident_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assignment_vtiger_links_incident ON assignment_vtiger_links (incident_id);
CREATE INDEX IF NOT EXISTS idx_assignment_vtiger_links_status ON assignment_vtiger_links (sync_status);

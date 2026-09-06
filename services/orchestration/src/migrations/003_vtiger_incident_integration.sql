ALTER TABLE idempotency_keys ADD COLUMN request_fingerprint TEXT;
ALTER TABLE sync_intents ADD COLUMN claim_token TEXT;
ALTER TABLE sync_intents ADD COLUMN claimed_at TEXT;
ALTER TABLE sync_intents ADD COLUMN lease_expires_at TEXT;
ALTER TABLE sync_intents ADD COLUMN outcome_unknown INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_intents ADD COLUMN retryable INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS calls (
  call_id TEXT PRIMARY KEY,
  call_source TEXT NOT NULL,
  received_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vtiger_links (
  incident_id TEXT PRIMARY KEY,
  target_system TEXT NOT NULL DEFAULT 'vtiger',
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
  FOREIGN KEY (incident_id) REFERENCES incidents(incident_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_intents_claimable
  ON sync_intents (target_system, status, next_attempt_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_sync_intents_external_key
  ON sync_intents (target_system, entity_type, status);

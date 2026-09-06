CREATE TABLE IF NOT EXISTS incidents (
  incident_id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  description TEXT NOT NULL,
  address TEXT NOT NULL,
  patient_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  assignment_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  status TEXT NOT NULL,
  vehicle_status TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  crew_ids_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(incident_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS id_sequences (
  name TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);

CREATE TABLE IF NOT EXISTS event_outbox (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source_system TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  request_fingerprint TEXT,
  PRIMARY KEY (scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS sync_intents (
  intent_id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_system TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_classification TEXT,
  processed_at TEXT,
  dead_lettered_at TEXT,
  claim_token TEXT,
  claimed_at TEXT,
  lease_expires_at TEXT,
  outcome_unknown INTEGER NOT NULL DEFAULT 0,
  retryable INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_links (
  incident_id TEXT PRIMARY KEY,
  openemr_patient_id TEXT,
  temporary_label TEXT,
  verification_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(incident_id)
);

CREATE TABLE IF NOT EXISTS encounter_links (
  incident_id TEXT PRIMARY KEY,
  openemr_patient_id TEXT NOT NULL,
  openemr_encounter_id TEXT NOT NULL UNIQUE,
  encounter_status TEXT NOT NULL,
  care_started_at TEXT NOT NULL,
  handover_time TEXT,
  handover_status TEXT,
  disposition TEXT,
  destination_facility TEXT,
  receiving_clinician TEXT,
  handover_notes TEXT,
  closure_ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(incident_id)
);

-- Vtiger incident integration additions are applied by migration 003.
-- Keep this reference schema aligned for fresh schema inspection.
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
  updated_at TEXT NOT NULL
  ,FOREIGN KEY (incident_id) REFERENCES incidents(incident_id) ON DELETE CASCADE
);

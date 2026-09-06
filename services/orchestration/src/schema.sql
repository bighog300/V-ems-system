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

CREATE INDEX IF NOT EXISTS idx_assignments_active_status ON assignments(status);

-- Vtiger stock integration additions are applied by migration 007.
CREATE TABLE IF NOT EXISTS stock_items (
  stock_item_id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL, item_type TEXT NOT NULL, active_status TEXT NOT NULL,
  description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, correlation_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicle_stock (
  vehicle_id TEXT NOT NULL, stock_item_id TEXT NOT NULL, quantity_on_hand TEXT NOT NULL DEFAULT '0',
  minimum_quantity TEXT NOT NULL DEFAULT '0', target_quantity TEXT NOT NULL DEFAULT '0',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, correlation_id TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, stock_item_id), FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id),
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(stock_item_id)
);
CREATE TABLE IF NOT EXISTS stock_transactions (
  transaction_id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, stock_item_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL, quantity_delta TEXT NOT NULL, source_reference TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL, correlation_id TEXT NOT NULL, actor_id TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (vehicle_id, stock_item_id) REFERENCES vehicle_stock(vehicle_id, stock_item_id)
);
CREATE TABLE IF NOT EXISTS stock_usage (
  stock_usage_id TEXT PRIMARY KEY, intervention_id TEXT NOT NULL, incident_id TEXT NOT NULL,
  patient_case_id TEXT REFERENCES patient_cases(patient_case_id),
  encounter_id TEXT, stock_item_id TEXT NOT NULL, vehicle_id TEXT, quantity_used TEXT NOT NULL,
  usage_source TEXT NOT NULL, performed_at TEXT NOT NULL, intervention_type TEXT NOT NULL,
  correlation_id TEXT NOT NULL, discrepancy_status TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(stock_item_id)
);
CREATE TABLE IF NOT EXISTS stock_item_vtiger_links (
  stock_item_id TEXT PRIMARY KEY, remote_id TEXT, remote_number TEXT, external_key TEXT NOT NULL UNIQUE,
  create_correlation_id TEXT NOT NULL, last_correlation_id TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(stock_item_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS vehicle_stock_vtiger_links (
  vehicle_id TEXT NOT NULL, stock_item_id TEXT NOT NULL, remote_id TEXT, remote_number TEXT,
  external_key TEXT NOT NULL UNIQUE, create_correlation_id TEXT NOT NULL, last_correlation_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending', last_error_code TEXT, last_synced_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (vehicle_id, stock_item_id),
  FOREIGN KEY (vehicle_id, stock_item_id) REFERENCES vehicle_stock(vehicle_id, stock_item_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS stock_usage_vtiger_links (
  stock_usage_id TEXT PRIMARY KEY, remote_id TEXT, remote_number TEXT, external_key TEXT NOT NULL UNIQUE,
  create_correlation_id TEXT NOT NULL, last_correlation_id TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (stock_usage_id) REFERENCES stock_usage(stock_usage_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_stock_items_status ON stock_items(active_status);
CREATE INDEX IF NOT EXISTS idx_vehicle_stock_item ON vehicle_stock(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_loadout ON stock_transactions(vehicle_id, stock_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_usage_intervention ON stock_usage(intervention_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_usage_vehicle ON stock_usage(vehicle_id, stock_item_id);

-- Stage 6: legacy tables above are retained as migration archives.
CREATE TABLE patient_cases (
  patient_case_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
  patient_sequence INTEGER NOT NULL CHECK(patient_sequence > 0),
  status TEXT NOT NULL DEFAULT 'Created',
  assignment_id TEXT REFERENCES assignments(assignment_id),
  vehicle_id TEXT,
  crew_ids_json TEXT NOT NULL DEFAULT '[]',
  lead_clinician_id TEXT REFERENCES personnel(staff_id),
  temporary_label TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, correlation_id TEXT NOT NULL,
  UNIQUE(incident_id, patient_sequence), UNIQUE(patient_case_id, incident_id)
);
CREATE INDEX idx_patient_cases_assignment ON patient_cases(assignment_id);
CREATE INDEX idx_patient_cases_vehicle ON patient_cases(vehicle_id);
CREATE TABLE patient_case_patient_links (
  patient_case_id TEXT PRIMARY KEY REFERENCES patient_cases(patient_case_id),
  incident_id TEXT NOT NULL,
  openemr_patient_id TEXT,
  temporary_label TEXT,
  verification_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  FOREIGN KEY (patient_case_id, incident_id) REFERENCES patient_cases(patient_case_id, incident_id)
);
CREATE TABLE patient_case_encounter_links (
  patient_case_id TEXT PRIMARY KEY REFERENCES patient_cases(patient_case_id),
  incident_id TEXT NOT NULL,
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
  FOREIGN KEY (patient_case_id, incident_id) REFERENCES patient_cases(patient_case_id, incident_id)
);
CREATE TABLE patient_case_identity_reconciliations (
 reconciliation_id TEXT PRIMARY KEY, patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id),
 clinical_patient_id TEXT NOT NULL, verified_patient_id TEXT NOT NULL, reason TEXT NOT NULL,
 created_at TEXT NOT NULL, correlation_id TEXT NOT NULL
);
CREATE TABLE patient_case_encounter_requests (
 patient_case_id TEXT PRIMARY KEY REFERENCES patient_cases(patient_case_id),
 request_fingerprint TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE patient_case_provisional_requests (
  patient_case_id TEXT PRIMARY KEY REFERENCES patient_cases(patient_case_id),
  status TEXT NOT NULL, created_at TEXT NOT NULL
);

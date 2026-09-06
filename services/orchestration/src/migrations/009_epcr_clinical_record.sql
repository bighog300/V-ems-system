CREATE TABLE patient_case_demographics (
  patient_case_id TEXT PRIMARY KEY REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  preferred_name TEXT,
  dob TEXT,
  dob_unknown INTEGER NOT NULL DEFAULT 0,
  estimated_age_years INTEGER,
  sex TEXT,
  gender_identity TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country_code TEXT,
  phone TEXT,
  identity_document_type TEXT,
  identity_document_value TEXT,
  identity_source TEXT,
  identity_confidence TEXT,
  next_of_kin_name TEXT,
  next_of_kin_relationship TEXT,
  next_of_kin_phone TEXT,
  guardian_name TEXT,
  guardian_relationship TEXT,
  guardian_phone TEXT,
  minor_context_json TEXT,
  unidentified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE TABLE patient_case_assessments (
  assessment_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  encounter_id TEXT,
  section_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  performed_at TEXT NOT NULL,
  clinician_id TEXT,
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE INDEX idx_patient_case_assessments_timeline
  ON patient_case_assessments(patient_case_id, performed_at, assessment_id);

CREATE TABLE clinical_observations (
  observation_event_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL,
  performed_at TEXT NOT NULL,
  clinician_id TEXT,
  observations_json TEXT NOT NULL,
  notes TEXT,
  openemr_observation_id TEXT,
  downstream_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE INDEX idx_clinical_observations_timeline
  ON clinical_observations(patient_case_id, performed_at, observation_event_id);

CREATE TABLE medication_administrations (
  medication_administration_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL,
  medication_name TEXT NOT NULL,
  formulation TEXT,
  dose TEXT NOT NULL,
  dose_unit TEXT NOT NULL,
  route TEXT NOT NULL,
  indication TEXT,
  performed_at TEXT NOT NULL,
  clinician_id TEXT,
  authorization_json TEXT,
  response TEXT,
  adverse_reaction TEXT,
  stock_item_id TEXT REFERENCES stock_items(stock_item_id),
  vehicle_id TEXT,
  quantity_used TEXT,
  openemr_reference_id TEXT,
  downstream_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE INDEX idx_medication_administrations_timeline
  ON medication_administrations(patient_case_id, performed_at, medication_administration_id);

CREATE TABLE clinical_procedures (
  procedure_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  encounter_id TEXT NOT NULL,
  procedure_type TEXT NOT NULL,
  procedure_name TEXT NOT NULL,
  performed_at TEXT NOT NULL,
  clinician_id TEXT,
  attempts INTEGER,
  success INTEGER,
  complications TEXT,
  response TEXT,
  stock_item_id TEXT REFERENCES stock_items(stock_item_id),
  vehicle_id TEXT,
  quantity_used TEXT,
  openemr_reference_id TEXT,
  downstream_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE INDEX idx_clinical_procedures_timeline
  ON clinical_procedures(patient_case_id, performed_at, procedure_id);

CREATE TABLE patient_case_dispositions (
  disposition_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL UNIQUE REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  encounter_id TEXT,
  outcome TEXT NOT NULL,
  destination_facility TEXT,
  receiving_provider TEXT,
  decision_at TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE TABLE patient_case_timeline_events (
  timeline_event_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE CASCADE,
  encounter_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_entity_type TEXT,
  source_entity_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE INDEX idx_patient_case_timeline
  ON patient_case_timeline_events(patient_case_id, occurred_at, timeline_event_id);

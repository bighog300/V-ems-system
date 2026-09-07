CREATE TABLE epcr_versions (
  version_id TEXT PRIMARY KEY,
  patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK(version_number > 0), lifecycle_state TEXT NOT NULL,
  content_json TEXT NOT NULL, content_hash TEXT NOT NULL, hash_algorithm TEXT NOT NULL DEFAULT 'sha256',
  source_revision TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT, correlation_id TEXT NOT NULL,
  UNIQUE(patient_case_id, version_number)
);
CREATE INDEX idx_epcr_versions_case ON epcr_versions(patient_case_id, version_number);
CREATE TABLE epcr_lifecycle_events (
  lifecycle_event_id TEXT PRIMARY KEY, patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE RESTRICT,
  previous_state TEXT NOT NULL, new_state TEXT NOT NULL, actor_id TEXT, actor_role TEXT, occurred_at TEXT NOT NULL,
  reason TEXT, record_version_id TEXT REFERENCES epcr_versions(version_id), correlation_id TEXT NOT NULL
);
CREATE INDEX idx_epcr_lifecycle_case ON epcr_lifecycle_events(patient_case_id, occurred_at);
CREATE TABLE epcr_signatures (
  signature_id TEXT PRIMARY KEY, patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE RESTRICT,
  version_id TEXT NOT NULL REFERENCES epcr_versions(version_id) ON DELETE RESTRICT, record_hash TEXT NOT NULL,
  signer_role TEXT NOT NULL, signer_identity TEXT NOT NULL, signer_display_name TEXT, personnel_id TEXT REFERENCES personnel(staff_id),
  signed_at TEXT NOT NULL, signature_method TEXT NOT NULL, acknowledgement TEXT NOT NULL, signature_image_ref TEXT,
  witness_context_json TEXT, correlation_id TEXT NOT NULL,
  UNIQUE(version_id, signer_role, signer_identity)
);
CREATE INDEX idx_epcr_signatures_case ON epcr_signatures(patient_case_id, signed_at);
CREATE TABLE epcr_amendments (
  amendment_id TEXT PRIMARY KEY, patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE RESTRICT,
  base_version_id TEXT NOT NULL REFERENCES epcr_versions(version_id) ON DELETE RESTRICT,
  resulting_version_id TEXT REFERENCES epcr_versions(version_id) ON DELETE RESTRICT, author_id TEXT, reason TEXT NOT NULL,
  affected_path TEXT NOT NULL, before_value_json TEXT, after_value_json TEXT, status TEXT NOT NULL DEFAULT 'applied',
  created_at TEXT NOT NULL, correlation_id TEXT NOT NULL
);
CREATE INDEX idx_epcr_amendments_case ON epcr_amendments(patient_case_id, created_at);
CREATE TABLE epcr_reviews (
  review_id TEXT PRIMARY KEY, patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE RESTRICT,
  version_id TEXT NOT NULL REFERENCES epcr_versions(version_id) ON DELETE RESTRICT, reviewer_id TEXT, reviewer_role TEXT NOT NULL,
  action TEXT NOT NULL, comment TEXT, flags_json TEXT NOT NULL DEFAULT '[]', resulting_state TEXT NOT NULL,
  created_at TEXT NOT NULL, correlation_id TEXT NOT NULL
);
CREATE INDEX idx_epcr_reviews_queue ON epcr_reviews(patient_case_id, created_at);
CREATE TABLE epcr_qa_flags (
  flag_id TEXT PRIMARY KEY, patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id) ON DELETE RESTRICT,
  version_id TEXT REFERENCES epcr_versions(version_id) ON DELETE RESTRICT, flag_type TEXT NOT NULL, severity TEXT NOT NULL,
  source TEXT NOT NULL, raised_at TEXT NOT NULL, raised_by TEXT, resolved_at TEXT, resolved_by TEXT, resolution_note TEXT,
  correlation_id TEXT NOT NULL
);
CREATE INDEX idx_epcr_qa_flags_case ON epcr_qa_flags(patient_case_id, resolved_at, raised_at);

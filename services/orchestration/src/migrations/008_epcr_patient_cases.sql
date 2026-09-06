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
INSERT INTO patient_cases(patient_case_id,incident_id,patient_sequence,status,temporary_label,created_at,updated_at,correlation_id)
SELECT 'PCR-' || printf('%06d',row_number() OVER (ORDER BY i.incident_id)), i.incident_id,1,
 CASE WHEN e.closure_ready=1 THEN 'Handover Completed' WHEN e.openemr_encounter_id IS NOT NULL THEN 'Encounter Open' WHEN p.openemr_patient_id IS NOT NULL THEN 'Patient Linked' ELSE 'Patient Identification Pending' END,
 p.temporary_label, COALESCE(p.created_at,e.created_at),COALESCE(e.updated_at,p.updated_at),COALESCE(e.correlation_id,p.correlation_id)
FROM incidents i LEFT JOIN patient_links p USING(incident_id) LEFT JOIN encounter_links e USING(incident_id)
WHERE p.incident_id IS NOT NULL OR e.incident_id IS NOT NULL;
UPDATE patient_cases SET
 assignment_id=(SELECT a.assignment_id FROM assignments a WHERE a.incident_id=patient_cases.incident_id AND a.status IN ('Assigned','Accepted','Mobilised','Active')),
 vehicle_id=(SELECT a.vehicle_id FROM assignments a WHERE a.incident_id=patient_cases.incident_id AND a.status IN ('Assigned','Accepted','Mobilised','Active')),
 crew_ids_json=(SELECT a.crew_ids_json FROM assignments a WHERE a.incident_id=patient_cases.incident_id AND a.status IN ('Assigned','Accepted','Mobilised','Active'))
WHERE (SELECT count(*) FROM assignments a WHERE a.incident_id=patient_cases.incident_id AND a.status IN ('Assigned','Accepted','Mobilised','Active'))=1;
INSERT INTO id_sequences(name,next_value) SELECT 'patient_case',count(*)+1 FROM patient_cases;
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
INSERT INTO patient_case_patient_links SELECT c.patient_case_id,l.* FROM patient_links l JOIN patient_cases c USING(incident_id);
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
INSERT INTO patient_case_encounter_links SELECT c.patient_case_id,l.* FROM encounter_links l JOIN patient_cases c USING(incident_id);
-- An encounter-only legacy record still owns a real clinical patient identity.
INSERT INTO patient_case_patient_links(patient_case_id,incident_id,openemr_patient_id,temporary_label,verification_status,created_at,updated_at,correlation_id)
SELECT patient_case_id,incident_id,openemr_patient_id,NULL,'provisional',created_at,updated_at,correlation_id
FROM patient_case_encounter_links e WHERE NOT EXISTS (SELECT 1 FROM patient_case_patient_links p WHERE p.patient_case_id=e.patient_case_id);
CREATE INDEX idx_case_patient_identity ON patient_case_patient_links(openemr_patient_id);
CREATE INDEX idx_case_encounter_patient ON patient_case_encounter_links(openemr_patient_id);
CREATE TABLE patient_case_identity_reconciliations (
 reconciliation_id TEXT PRIMARY KEY, patient_case_id TEXT NOT NULL REFERENCES patient_cases(patient_case_id),
 clinical_patient_id TEXT NOT NULL, verified_patient_id TEXT NOT NULL, reason TEXT NOT NULL,
 created_at TEXT NOT NULL, correlation_id TEXT NOT NULL
);
CREATE TABLE patient_case_encounter_requests (
 patient_case_id TEXT PRIMARY KEY REFERENCES patient_cases(patient_case_id),
 request_fingerprint TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
ALTER TABLE stock_usage ADD COLUMN patient_case_id TEXT REFERENCES patient_cases(patient_case_id);
UPDATE stock_usage SET patient_case_id=(SELECT patient_case_id FROM patient_case_encounter_links e WHERE e.openemr_encounter_id=stock_usage.encounter_id);
CREATE INDEX idx_stock_usage_patient_case ON stock_usage(patient_case_id);
CREATE TABLE patient_case_provisional_requests (
  patient_case_id TEXT PRIMARY KEY REFERENCES patient_cases(patient_case_id),
  status TEXT NOT NULL, created_at TEXT NOT NULL
);

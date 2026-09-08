ALTER TABLE patient_case_encounter_links ADD COLUMN location_lat REAL;
ALTER TABLE patient_case_encounter_links ADD COLUMN location_lng REAL;
ALTER TABLE patient_case_encounter_links ADD COLUMN location_accuracy_m REAL;

ALTER TABLE patient_case_dispositions ADD COLUMN location_lat REAL;
ALTER TABLE patient_case_dispositions ADD COLUMN location_lng REAL;
ALTER TABLE patient_case_dispositions ADD COLUMN location_accuracy_m REAL;

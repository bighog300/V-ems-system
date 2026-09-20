-- D13: a patient's weight is the basis of paediatric and weight-based dosing decisions, and there was nowhere to record it.
-- Kilograms; nullable because most records will not have one.
ALTER TABLE patient_case_demographics ADD COLUMN weight_kg REAL;

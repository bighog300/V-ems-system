-- Stage 13 milestone 13b: additive coded-terminology columns alongside the
-- existing free-text clinical fields. Nullable, populated best-effort at
-- write time from the active compliance profile's code lists (13a) -- an
-- unmapped or legacy value simply leaves its *_code column NULL, the
-- existing free-text column is untouched and stays authoritative.
--
-- "complaint" and "impression" (the other two categories a compliance
-- profile can supply code lists for) are deliberately not given a column
-- here: neither has a persisted free-text field to canonicalize today.
-- incidents.category is already a closed, validated enum (INCIDENT_CATEGORIES)
-- with no free-text variance to code against, and presenting_complaint is
-- only ever a transient request-time value forwarded to OpenEMR at
-- encounter creation -- never stored in V-EMS's own schema. See
-- docs/STAGE13_COMPLIANCE_REPORTING_PLAN.md's 13b entry.

ALTER TABLE medication_administrations ADD COLUMN medication_code TEXT;
ALTER TABLE clinical_procedures ADD COLUMN procedure_code TEXT;
ALTER TABLE patient_case_dispositions ADD COLUMN outcome_code TEXT;

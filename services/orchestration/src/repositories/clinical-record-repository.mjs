import { sqlValue } from "../db.mjs";

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  return JSON.parse(value);
}

function serializeRecord(record, jsonFields = []) {
  const values = { ...record };
  for (const field of jsonFields) {
    if (field in values) values[field] = JSON.stringify(values[field] ?? null);
  }
  return values;
}

function insert(db, table, record, jsonFields = []) {
  const values = serializeRecord(record, jsonFields);
  const keys = Object.keys(values);
  db.execute(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((key) => sqlValue(values[key])).join(",")});`);
}

export class PatientCaseDemographicsRepository {
  constructor(db) { this.db = db; }

  find(patientCaseId) {
    const row = this.db.queryOne(`SELECT * FROM patient_case_demographics WHERE patient_case_id=${sqlValue(patientCaseId)};`);
    if (!row) return undefined;
    return {
      ...row,
      dob_unknown: Boolean(row.dob_unknown),
      unidentified: Boolean(row.unidentified),
      minor_context: parseJson(row.minor_context_json, null)
    };
  }

  save(record) {
    const values = { ...record, minor_context_json: JSON.stringify(record.minor_context ?? null) };
    delete values.minor_context;
    values.dob_unknown = record.dob_unknown ? 1 : 0;
    values.unidentified = record.unidentified ? 1 : 0;
    const keys = Object.keys(values);
    this.db.execute(`INSERT INTO patient_case_demographics (${keys.join(",")}) VALUES (${keys.map((key) => sqlValue(values[key])).join(",")})
      ON CONFLICT(patient_case_id) DO UPDATE SET ${keys.filter((key) => !["patient_case_id", "created_at"].includes(key)).map((key) => `${key}=excluded.${key}`).join(",")};`);
  }
}

export class PatientCaseAssessmentRepository {
  constructor(db) { this.db = db; }
  create(record) {
    const { payload, ...rest } = record;
    insert(this.db, "patient_case_assessments", { ...rest, payload_json: payload ?? {} }, ["payload_json"]);
  }
  list(patientCaseId) {
    return this.db.queryAll(`SELECT * FROM patient_case_assessments WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY performed_at, assessment_id;`)
      .map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) }));
  }
}

export class ClinicalObservationRepository {
  constructor(db) { this.db = db; }
  create(record) {
    const { observations, ...rest } = record;
    insert(this.db, "clinical_observations", { ...rest, observations_json: observations ?? {} }, ["observations_json"]);
  }
  list(patientCaseId) {
    return this.db.queryAll(`SELECT * FROM clinical_observations WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY performed_at, observation_event_id;`)
      .map((row) => ({ ...row, observations: parseJson(row.observations_json, {}) }));
  }
}

export class MedicationAdministrationRepository {
  constructor(db) { this.db = db; }
  create(record) {
    const { authorization, ...rest } = record;
    insert(this.db, "medication_administrations", { ...rest, authorization_json: authorization ?? null }, ["authorization_json"]);
  }
  find(id) {
    const row = this.db.queryOne(`SELECT * FROM medication_administrations WHERE medication_administration_id=${sqlValue(id)};`);
    if (!row) return undefined;
    return { ...row, authorization: parseJson(row.authorization_json, null) };
  }
  list(patientCaseId) {
    return this.db.queryAll(`SELECT * FROM medication_administrations WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY performed_at, medication_administration_id;`)
      .map((row) => ({ ...row, authorization: parseJson(row.authorization_json, null) }));
  }
}

export class ClinicalProcedureRepository {
  constructor(db) { this.db = db; }
  create(record) {
    insert(this.db, "clinical_procedures", {
      ...record,
      success: record.success === undefined || record.success === null ? null : record.success ? 1 : 0
    });
  }
  find(id) {
    const row = this.db.queryOne(`SELECT * FROM clinical_procedures WHERE procedure_id=${sqlValue(id)};`);
    if (!row) return undefined;
    return { ...row, success: row.success === null ? null : Boolean(row.success) };
  }
  list(patientCaseId) {
    return this.db.queryAll(`SELECT * FROM clinical_procedures WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY performed_at, procedure_id;`)
      .map((row) => ({ ...row, success: row.success === null ? null : Boolean(row.success) }));
  }
}

export class PatientCaseDispositionRepository {
  constructor(db) { this.db = db; }
  find(patientCaseId) { return this.db.queryOne(`SELECT * FROM patient_case_dispositions WHERE patient_case_id=${sqlValue(patientCaseId)};`); }
  save(record) {
    const keys = Object.keys(record);
    this.db.execute(`INSERT INTO patient_case_dispositions (${keys.join(",")}) VALUES (${keys.map((key) => sqlValue(record[key])).join(",")})
      ON CONFLICT(patient_case_id) DO UPDATE SET ${keys.filter((key) => !["disposition_id", "patient_case_id", "created_at"].includes(key)).map((key) => `${key}=excluded.${key}`).join(",")};`);
  }
}

export class PatientCaseTimelineRepository {
  constructor(db) { this.db = db; }
  create(record) {
    const { payload, ...rest } = record;
    insert(this.db, "patient_case_timeline_events", { ...rest, payload_json: payload ?? {} }, ["payload_json"]);
  }
  list(patientCaseId) {
    return this.db.queryAll(`SELECT * FROM patient_case_timeline_events WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY occurred_at, timeline_event_id;`)
      .map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) }));
  }
}

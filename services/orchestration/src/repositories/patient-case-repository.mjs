import { sqlValue } from '../db.mjs';

function map(row) {
  if (!row) return undefined;
  const { crew_ids_json, ...record } = row;
  return { ...record, crew_ids: JSON.parse(crew_ids_json) };
}

export class PatientCaseRepository {
  constructor(db) { this.db = db; }
  nextId() {
    const row = this.db.queryOne(`INSERT INTO id_sequences(name,next_value) VALUES ('patient_case',2)
      ON CONFLICT(name) DO UPDATE SET next_value=next_value+1 RETURNING next_value-1 AS value;`);
    return `PCR-${String(row.value).padStart(6, '0')}`;
  }
  find(id) { return map(this.db.queryOne(`SELECT * FROM patient_cases WHERE patient_case_id=${sqlValue(id)};`)); }
  list(incidentId) { return this.db.queryAll(`SELECT * FROM patient_cases WHERE incident_id=${sqlValue(incidentId)} ORDER BY patient_sequence;`).map(map); }
  save(record) {
    const { crew_ids, ...values } = record;
    values.crew_ids_json = JSON.stringify(crew_ids);
    const keys = Object.keys(values);
    this.db.execute(`INSERT INTO patient_cases(${keys.join(',')}) VALUES (${keys.map(k => sqlValue(values[k])).join(',')})
      ON CONFLICT(patient_case_id) DO UPDATE SET ${keys.filter(k => !['patient_case_id','incident_id','patient_sequence','created_at'].includes(k)).map(k => `${k}=excluded.${k}`).join(',')};`);
  }
}

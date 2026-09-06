import { ApiError } from '@vems/shared';
import { sqlValue } from "../db.mjs";

function mapPatientLink(row) {
  if (!row) return undefined;
  return {
    patient_case_id: row.patient_case_id,
    incident_id: row.incident_id,
    openemr_patient_id: row.openemr_patient_id,
    temporary_label: row.temporary_label,
    verification_status: row.verification_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    correlation_id: row.correlation_id
  };
}

export class PatientLinkRepository {
  constructor(db) {
    this.db = db;
  }

  findByPatientCaseId(id) {
    return mapPatientLink(this.db.queryOne(`SELECT * FROM patient_case_patient_links WHERE patient_case_id = ${sqlValue(id)};`));
  }

  listByIncidentId(id) {
    return this.db.queryAll(`SELECT * FROM patient_case_patient_links WHERE incident_id = ${sqlValue(id)};`).map(mapPatientLink);
  }

  findByIncidentId(incidentId) {
    const records = this.listByIncidentId(incidentId);
    if (records.length > 1) throw new ApiError('CONFLICT', 'Multiple patient cases: patient_case_id is required', 409);
    return records[0];
  }

  save(record) {
    this.db.execute(`INSERT INTO patient_case_patient_links (patient_case_id, incident_id, openemr_patient_id, temporary_label, verification_status, created_at, updated_at, correlation_id)
      VALUES (${sqlValue(record.patient_case_id)}, ${sqlValue(record.incident_id)}, ${sqlValue(record.openemr_patient_id)}, ${sqlValue(record.temporary_label)}, ${sqlValue(record.verification_status)}, ${sqlValue(record.created_at)}, ${sqlValue(record.updated_at)}, ${sqlValue(record.correlation_id)})
      ON CONFLICT(patient_case_id) DO UPDATE SET
        openemr_patient_id = excluded.openemr_patient_id,
        temporary_label = excluded.temporary_label,
        verification_status = excluded.verification_status,
        updated_at = excluded.updated_at,
        correlation_id = excluded.correlation_id;`);
  }
}

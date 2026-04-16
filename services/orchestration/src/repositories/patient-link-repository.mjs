import { sqlValue } from "../db.mjs";

function mapPatientLink(row) {
  if (!row) return undefined;
  return {
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

  findByIncidentId(incidentId) {
    return mapPatientLink(this.db.queryOne(`SELECT * FROM patient_links WHERE incident_id = ${sqlValue(incidentId)};`));
  }

  save(record) {
    this.db.execute(`INSERT INTO patient_links (incident_id, openemr_patient_id, temporary_label, verification_status, created_at, updated_at, correlation_id)
      VALUES (${sqlValue(record.incident_id)}, ${sqlValue(record.openemr_patient_id)}, ${sqlValue(record.temporary_label)}, ${sqlValue(record.verification_status)}, ${sqlValue(record.created_at)}, ${sqlValue(record.updated_at)}, ${sqlValue(record.correlation_id)})
      ON CONFLICT(incident_id) DO UPDATE SET
        openemr_patient_id = excluded.openemr_patient_id,
        temporary_label = excluded.temporary_label,
        verification_status = excluded.verification_status,
        updated_at = excluded.updated_at,
        correlation_id = excluded.correlation_id;`);
  }
}

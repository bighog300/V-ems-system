import { sqlValue } from "../db.mjs";

function mapEncounterLink(row) {
  if (!row) return undefined;
  return {
    incident_id: row.incident_id,
    openemr_patient_id: row.openemr_patient_id,
    openemr_encounter_id: row.openemr_encounter_id,
    encounter_status: row.encounter_status,
    care_started_at: row.care_started_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    correlation_id: row.correlation_id
  };
}

export class EncounterLinkRepository {
  constructor(db) {
    this.db = db;
  }

  findByIncidentId(incidentId) {
    return mapEncounterLink(this.db.queryOne(`SELECT * FROM encounter_links WHERE incident_id = ${sqlValue(incidentId)};`));
  }

  findByEncounterId(encounterId) {
    return mapEncounterLink(this.db.queryOne(`SELECT * FROM encounter_links WHERE openemr_encounter_id = ${sqlValue(encounterId)};`));
  }

  findByIncidentAndPatient(incidentId, patientId) {
    return mapEncounterLink(this.db.queryOne(`SELECT * FROM encounter_links WHERE incident_id = ${sqlValue(incidentId)} AND openemr_patient_id = ${sqlValue(patientId)};`));
  }

  save(record) {
    this.db.execute(`INSERT INTO encounter_links (incident_id, openemr_patient_id, openemr_encounter_id, encounter_status, care_started_at, created_at, updated_at, correlation_id)
      VALUES (${sqlValue(record.incident_id)}, ${sqlValue(record.openemr_patient_id)}, ${sqlValue(record.openemr_encounter_id)}, ${sqlValue(record.encounter_status)}, ${sqlValue(record.care_started_at)}, ${sqlValue(record.created_at)}, ${sqlValue(record.updated_at)}, ${sqlValue(record.correlation_id)})
      ON CONFLICT(incident_id) DO UPDATE SET
        openemr_patient_id = excluded.openemr_patient_id,
        openemr_encounter_id = excluded.openemr_encounter_id,
        encounter_status = excluded.encounter_status,
        care_started_at = excluded.care_started_at,
        updated_at = excluded.updated_at,
        correlation_id = excluded.correlation_id;`);
  }
}

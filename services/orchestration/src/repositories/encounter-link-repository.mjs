import { sqlValue } from "../db.mjs";

function mapEncounterLink(row) {
  if (!row) return undefined;
  return {
    incident_id: row.incident_id,
    openemr_encounter_id: row.openemr_encounter_id,
    encounter_status: row.encounter_status,
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

  save(record) {
    this.db.execute(`INSERT INTO encounter_links (incident_id, openemr_encounter_id, encounter_status, created_at, updated_at, correlation_id)
      VALUES (${sqlValue(record.incident_id)}, ${sqlValue(record.openemr_encounter_id)}, ${sqlValue(record.encounter_status)}, ${sqlValue(record.created_at)}, ${sqlValue(record.updated_at)}, ${sqlValue(record.correlation_id)})
      ON CONFLICT(incident_id) DO UPDATE SET
        openemr_encounter_id = excluded.openemr_encounter_id,
        encounter_status = excluded.encounter_status,
        updated_at = excluded.updated_at,
        correlation_id = excluded.correlation_id;`);
  }
}

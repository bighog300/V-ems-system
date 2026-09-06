import { sqlValue } from "../db.mjs";

function map(row) {
  if (!row) return undefined;
  return { ...row };
}

export class VtigerLinkRepository {
  constructor(db) { this.db = db; }

  findByIncidentId(incidentId) {
    return map(this.db.queryOne(`SELECT * FROM vtiger_links WHERE incident_id = ${sqlValue(incidentId)};`));
  }

  findByExternalKey(externalKey) {
    return map(this.db.queryOne(`SELECT * FROM vtiger_links WHERE external_key = ${sqlValue(externalKey)};`));
  }

  upsert(link) {
    this.db.execute(`INSERT INTO vtiger_links
      (incident_id,target_system,remote_id,remote_number,external_key,create_correlation_id,last_correlation_id,sync_status,last_error_code,last_synced_at,created_at,updated_at)
      VALUES (${sqlValue(link.incident_id)},'vtiger',${sqlValue(link.remote_id)},${sqlValue(link.remote_number)},${sqlValue(link.external_key)},${sqlValue(link.create_correlation_id)},${sqlValue(link.last_correlation_id)},${sqlValue(link.sync_status)},${sqlValue(link.last_error_code)},${sqlValue(link.last_synced_at)},${sqlValue(link.created_at)},${sqlValue(link.updated_at)})
      ON CONFLICT(incident_id) DO UPDATE SET
        remote_id=excluded.remote_id, remote_number=excluded.remote_number,
        last_correlation_id=excluded.last_correlation_id, sync_status=excluded.sync_status,
        last_error_code=excluded.last_error_code, last_synced_at=excluded.last_synced_at,
        updated_at=excluded.updated_at;`);
  }

  markFailure(incidentId, code, status = "retrying", updatedAt = new Date().toISOString()) {
    this.db.execute(`UPDATE vtiger_links SET sync_status=${sqlValue(status)}, last_error_code=${sqlValue(code)}, updated_at=${sqlValue(updatedAt)} WHERE incident_id=${sqlValue(incidentId)};`);
  }
}

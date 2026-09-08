import { sqlValue } from "../db.mjs";

function map(row) { return row ? { ...row } : null; }

export class AssignmentVtigerLinkRepository {
  constructor(db) { this.db = db; }
  async findByAssignmentId(id) { return map(await this.db.queryOne(`SELECT * FROM assignment_vtiger_links WHERE assignment_id=${sqlValue(id)};`)); }
  async findByExternalKey(key) { return map(await this.db.queryOne(`SELECT * FROM assignment_vtiger_links WHERE external_key=${sqlValue(key)};`)); }
  async upsert(link) {
    const existing = await this.findByAssignmentId(link.assignment_id);
    if (!existing) {
      await this.db.execute(`INSERT INTO assignment_vtiger_links (assignment_id,incident_id,remote_id,remote_number,external_key,incident_remote_id,create_correlation_id,last_correlation_id,sync_status,last_error_code,last_synced_at,created_at,updated_at)
        VALUES (${sqlValue(link.assignment_id)},${sqlValue(link.incident_id)},${sqlValue(link.remote_id)},${sqlValue(link.remote_number)},${sqlValue(link.external_key)},${sqlValue(link.incident_remote_id)},${sqlValue(link.create_correlation_id)},${sqlValue(link.last_correlation_id)},${sqlValue(link.sync_status ?? "pending")},${sqlValue(link.last_error_code)},${sqlValue(link.last_synced_at)},${sqlValue(link.created_at)},${sqlValue(link.updated_at)});`);
      return;
    }
    await this.db.execute(`UPDATE assignment_vtiger_links SET remote_id=${sqlValue(link.remote_id ?? existing.remote_id)},remote_number=${sqlValue(link.remote_number ?? existing.remote_number)},external_key=${sqlValue(link.external_key ?? existing.external_key)},incident_remote_id=${sqlValue(link.incident_remote_id ?? existing.incident_remote_id)},last_correlation_id=${sqlValue(link.last_correlation_id ?? existing.last_correlation_id)},sync_status=${sqlValue(link.sync_status ?? existing.sync_status)},last_error_code=${sqlValue(link.last_error_code)},last_synced_at=${sqlValue(link.last_synced_at)},updated_at=${sqlValue(link.updated_at ?? new Date().toISOString())} WHERE assignment_id=${sqlValue(link.assignment_id)};`);
  }
  async markFailure(id, code, status, updatedAt) { await this.db.execute(`UPDATE assignment_vtiger_links SET sync_status=${sqlValue(status)},last_error_code=${sqlValue(code)},updated_at=${sqlValue(updatedAt)} WHERE assignment_id=${sqlValue(id)};`); }
}

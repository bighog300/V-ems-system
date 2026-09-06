import { sqlValue } from "../db.mjs";

function map(row) { return row ? { ...row } : undefined; }

export class PersonnelVtigerLinkRepository {
  constructor(db) { this.db = db; }
  findByStaffId(id) { return map(this.db.queryOne(`SELECT * FROM personnel_vtiger_links WHERE staff_id=${sqlValue(id)};`)); }
  findByExternalKey(key) { return map(this.db.queryOne(`SELECT * FROM personnel_vtiger_links WHERE external_key=${sqlValue(key)};`)); }
  upsert(link) {
    const existing = this.findByStaffId(link.staff_id);
    if (!existing) {
      this.db.execute(`INSERT INTO personnel_vtiger_links (staff_id,remote_id,remote_number,external_key,create_correlation_id,last_correlation_id,sync_status,last_error_code,last_synced_at,created_at,updated_at) VALUES (${sqlValue(link.staff_id)},${sqlValue(link.remote_id)},${sqlValue(link.remote_number)},${sqlValue(link.external_key)},${sqlValue(link.create_correlation_id)},${sqlValue(link.last_correlation_id)},${sqlValue(link.sync_status ?? "pending")},${sqlValue(link.last_error_code)},${sqlValue(link.last_synced_at)},${sqlValue(link.created_at)},${sqlValue(link.updated_at)});`);
      return;
    }
    this.db.execute(`UPDATE personnel_vtiger_links SET remote_id=${sqlValue(link.remote_id ?? existing.remote_id)},remote_number=${sqlValue(link.remote_number ?? existing.remote_number)},external_key=${sqlValue(link.external_key ?? existing.external_key)},last_correlation_id=${sqlValue(link.last_correlation_id ?? existing.last_correlation_id)},sync_status=${sqlValue(link.sync_status ?? existing.sync_status)},last_error_code=${sqlValue(link.last_error_code)},last_synced_at=${sqlValue(link.last_synced_at)},updated_at=${sqlValue(link.updated_at ?? new Date().toISOString())} WHERE staff_id=${sqlValue(link.staff_id)};`);
  }
  markFailure(id, code, status, updatedAt) { this.db.execute(`UPDATE personnel_vtiger_links SET sync_status=${sqlValue(status)},last_error_code=${sqlValue(code)},updated_at=${sqlValue(updatedAt)} WHERE staff_id=${sqlValue(id)};`); }
}

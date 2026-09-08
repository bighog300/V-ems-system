import { sqlValue } from "../db.mjs";

function map(row) { return row ? { ...row } : undefined; }

export class AssignmentPersonnelVtigerLinkRepository {
  constructor(db) { this.db = db; }
  async find(assignmentId, staffId) { return map(await this.db.queryOne(`SELECT * FROM assignment_personnel_vtiger_links WHERE assignment_id=${sqlValue(assignmentId)} AND staff_id=${sqlValue(staffId)};`)); }
  async listByAssignmentId(id) {
    const rows = await this.db.queryAll(`SELECT * FROM assignment_personnel_vtiger_links WHERE assignment_id=${sqlValue(id)} ORDER BY staff_id;`);
    return rows.map(map);
  }
  async ensure(link) {
    if (!(await this.find(link.assignment_id, link.staff_id))) await this.db.execute(`INSERT INTO assignment_personnel_vtiger_links (assignment_id,staff_id,external_key,sync_status,create_correlation_id,last_correlation_id,created_at,updated_at) VALUES (${sqlValue(link.assignment_id)},${sqlValue(link.staff_id)},${sqlValue(link.external_key)},'pending',${sqlValue(link.create_correlation_id)},${sqlValue(link.last_correlation_id)},${sqlValue(link.created_at)},${sqlValue(link.updated_at)});`);
  }
  async upsert(link) {
    const existing = await this.find(link.assignment_id, link.staff_id);
    if (!existing) {
      await this.db.execute(`INSERT INTO assignment_personnel_vtiger_links (assignment_id,staff_id,assignment_remote_id,personnel_remote_id,junction_remote_id,junction_remote_number,external_key,sync_status,last_error_code,create_correlation_id,last_correlation_id,last_synced_at,created_at,updated_at) VALUES (${sqlValue(link.assignment_id)},${sqlValue(link.staff_id)},${sqlValue(link.assignment_remote_id)},${sqlValue(link.personnel_remote_id)},${sqlValue(link.junction_remote_id)},${sqlValue(link.junction_remote_number)},${sqlValue(link.external_key)},${sqlValue(link.sync_status ?? "pending")},${sqlValue(link.last_error_code)},${sqlValue(link.create_correlation_id)},${sqlValue(link.last_correlation_id)},${sqlValue(link.last_synced_at)},${sqlValue(link.created_at)},${sqlValue(link.updated_at)});`);
      return;
    }
    await this.db.execute(`UPDATE assignment_personnel_vtiger_links SET assignment_remote_id=${sqlValue(link.assignment_remote_id ?? existing.assignment_remote_id)},personnel_remote_id=${sqlValue(link.personnel_remote_id ?? existing.personnel_remote_id)},junction_remote_id=${sqlValue(link.junction_remote_id ?? existing.junction_remote_id)},junction_remote_number=${sqlValue(link.junction_remote_number ?? existing.junction_remote_number)},external_key=${sqlValue(link.external_key ?? existing.external_key)},sync_status=${sqlValue(link.sync_status ?? existing.sync_status)},last_error_code=${sqlValue(link.last_error_code)},last_correlation_id=${sqlValue(link.last_correlation_id ?? existing.last_correlation_id)},last_synced_at=${sqlValue(link.last_synced_at)},updated_at=${sqlValue(link.updated_at ?? new Date().toISOString())} WHERE assignment_id=${sqlValue(link.assignment_id)} AND staff_id=${sqlValue(link.staff_id)};`);
  }
  async markFailure(assignmentId, staffId, code, status, updatedAt) { await this.db.execute(`UPDATE assignment_personnel_vtiger_links SET sync_status=${sqlValue(status)},last_error_code=${sqlValue(code)},updated_at=${sqlValue(updatedAt)} WHERE assignment_id=${sqlValue(assignmentId)} AND staff_id=${sqlValue(staffId)};`); }
}

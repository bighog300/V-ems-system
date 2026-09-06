import { sqlValue } from "../db.mjs";

function map(row) {
  if (!row) return undefined;
  return { staff_id: row.staff_id, display_name: row.display_name, role: row.role, operational_status: row.operational_status, home_station: row.home_station, callsign: row.callsign ?? null, phone: row.phone ?? null, email: row.email ?? null, notes: row.notes ?? null, created_at: row.created_at, updated_at: row.updated_at, correlation_id: row.correlation_id };
}

export class PersonnelRepository {
  constructor(db) { this.db = db; }
  create(personnel) {
    this.db.execute(`INSERT INTO personnel (staff_id,display_name,role,operational_status,home_station,callsign,phone,email,notes,created_at,updated_at,correlation_id) VALUES (${sqlValue(personnel.staff_id)},${sqlValue(personnel.display_name)},${sqlValue(personnel.role)},${sqlValue(personnel.operational_status)},${sqlValue(personnel.home_station)},${sqlValue(personnel.callsign)},${sqlValue(personnel.phone)},${sqlValue(personnel.email)},${sqlValue(personnel.notes)},${sqlValue(personnel.created_at)},${sqlValue(personnel.updated_at)},${sqlValue(personnel.correlation_id)});`);
  }
  findById(id) { return map(this.db.queryOne(`SELECT * FROM personnel WHERE staff_id=${sqlValue(id)};`)); }
  list() { return this.db.queryAll("SELECT * FROM personnel ORDER BY staff_id;").map(map); }
  update(personnel) { this.db.execute(`UPDATE personnel SET display_name=${sqlValue(personnel.display_name)},role=${sqlValue(personnel.role)},operational_status=${sqlValue(personnel.operational_status)},home_station=${sqlValue(personnel.home_station)},callsign=${sqlValue(personnel.callsign)},phone=${sqlValue(personnel.phone)},email=${sqlValue(personnel.email)},notes=${sqlValue(personnel.notes)},updated_at=${sqlValue(personnel.updated_at)},correlation_id=${sqlValue(personnel.correlation_id)} WHERE staff_id=${sqlValue(personnel.staff_id)};`); }
  countActiveAssignments(staffId) { return Number(this.db.queryOne(`SELECT COUNT(*) AS count FROM assignments a WHERE a.status IN ('Assigned','Accepted','Mobilised','Active') AND EXISTS (SELECT 1 FROM json_each(a.crew_ids_json) WHERE json_each.value=${sqlValue(staffId)});`)?.count ?? 0); }
}

import { sqlValue } from "../db.mjs";

function map(row) {
  if (!row) return undefined;
  return { vehicle_id: row.vehicle_id, callsign: row.callsign, vehicle_type: row.vehicle_type, operational_status: row.operational_status, service_status: row.service_status, home_station: row.home_station, notes: row.notes ?? null, created_at: row.created_at, updated_at: row.updated_at, correlation_id: row.correlation_id };
}

export class VehicleRepository {
  constructor(db) { this.db = db; }
  create(vehicle) {
    this.db.execute(`INSERT INTO vehicles (vehicle_id,callsign,vehicle_type,operational_status,service_status,home_station,notes,created_at,updated_at,correlation_id) VALUES (${sqlValue(vehicle.vehicle_id)},${sqlValue(vehicle.callsign)},${sqlValue(vehicle.vehicle_type)},${sqlValue(vehicle.operational_status)},${sqlValue(vehicle.service_status)},${sqlValue(vehicle.home_station)},${sqlValue(vehicle.notes)},${sqlValue(vehicle.created_at)},${sqlValue(vehicle.updated_at)},${sqlValue(vehicle.correlation_id)});`);
  }
  findById(id) { return map(this.db.queryOne(`SELECT * FROM vehicles WHERE vehicle_id=${sqlValue(id)};`)); }
  list() { return this.db.queryAll("SELECT * FROM vehicles ORDER BY vehicle_id;").map(map); }
  update(vehicle) { this.db.execute(`UPDATE vehicles SET callsign=${sqlValue(vehicle.callsign)},vehicle_type=${sqlValue(vehicle.vehicle_type)},operational_status=${sqlValue(vehicle.operational_status)},service_status=${sqlValue(vehicle.service_status)},home_station=${sqlValue(vehicle.home_station)},notes=${sqlValue(vehicle.notes)},updated_at=${sqlValue(vehicle.updated_at)},correlation_id=${sqlValue(vehicle.correlation_id)} WHERE vehicle_id=${sqlValue(vehicle.vehicle_id)};`); }
  countActiveAssignments(vehicleId) { return Number(this.db.queryOne(`SELECT COUNT(*) AS count FROM assignments WHERE vehicle_id=${sqlValue(vehicleId)} AND status NOT IN ('Completed','Cancelled','Stood Down');`)?.count ?? 0); }
}

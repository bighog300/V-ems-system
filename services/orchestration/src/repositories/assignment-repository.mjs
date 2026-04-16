import { sqlValue } from "../db.mjs";

function mapAssignment(row) {
  if (!row) return undefined;
  return {
    assignment_id: row.assignment_id,
    incident_id: row.incident_id,
    status: row.status,
    vehicle_status: row.vehicle_status,
    vehicle_id: row.vehicle_id,
    crew_ids: JSON.parse(row.crew_ids_json),
    reason: row.reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    correlation_id: row.correlation_id
  };
}

export class AssignmentRepository {
  constructor(db) {
    this.db = db;
  }

  nextAssignmentId() {
    const row = this.db.queryOne("SELECT COALESCE(MAX(CAST(SUBSTR(assignment_id, 5) AS INTEGER)), 0) + 1 AS next_id FROM assignments;");
    return `ASN-${String(row.next_id).padStart(6, "0")}`;
  }

  create(record) {
    this.db.execute(`INSERT INTO assignments (assignment_id, incident_id, status, vehicle_status, vehicle_id, crew_ids_json, reason, created_at, updated_at, correlation_id)
      VALUES (${sqlValue(record.assignment_id)}, ${sqlValue(record.incident_id)}, ${sqlValue(record.status)}, ${sqlValue(record.vehicle_status)}, ${sqlValue(record.vehicle_id)}, ${sqlValue(JSON.stringify(record.crew_ids))}, ${sqlValue(record.reason)}, ${sqlValue(record.created_at)}, ${sqlValue(record.updated_at)}, ${sqlValue(record.correlation_id)});`);
  }

  findById(assignmentId) {
    return mapAssignment(this.db.queryOne(`SELECT * FROM assignments WHERE assignment_id = ${sqlValue(assignmentId)};`));
  }

  updateStatus(assignmentId, status, updatedAt, correlationId) {
    this.db.execute(`UPDATE assignments SET status = ${sqlValue(status)}, updated_at = ${sqlValue(updatedAt)}, correlation_id = ${sqlValue(correlationId)} WHERE assignment_id = ${sqlValue(assignmentId)};`);
  }

  findActiveByIncident(incidentId) {
    return this.db.queryAll(`SELECT * FROM assignments WHERE incident_id = ${sqlValue(incidentId)} AND status IN ('Assigned', 'Accepted', 'Mobilised', 'Active');`).map(mapAssignment);
  }

  findByIncidentId(incidentId) {
    return this.db
      .queryAll(`SELECT * FROM assignments WHERE incident_id = ${sqlValue(incidentId)} ORDER BY created_at DESC;`)
      .map(mapAssignment);
  }
}

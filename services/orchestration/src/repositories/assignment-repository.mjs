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

  async nextAssignmentId() {
    const row = await this.db.queryOne(`
      INSERT INTO id_sequences (name, next_value)
      VALUES ('assignment', 2)
      ON CONFLICT(name) DO UPDATE SET next_value = id_sequences.next_value + 1
      RETURNING next_value - 1 AS next_id;
    `);
    return `ASN-${String(row.next_id).padStart(6, "0")}`;
  }

  async create(record) {
    await this.db.execute(`INSERT INTO assignments (assignment_id, incident_id, status, vehicle_status, vehicle_id, crew_ids_json, reason, created_at, updated_at, correlation_id)
      VALUES (${sqlValue(record.assignment_id)}, ${sqlValue(record.incident_id)}, ${sqlValue(record.status)}, ${sqlValue(record.vehicle_status)}, ${sqlValue(record.vehicle_id)}, ${sqlValue(JSON.stringify(record.crew_ids))}, ${sqlValue(record.reason)}, ${sqlValue(record.created_at)}, ${sqlValue(record.updated_at)}, ${sqlValue(record.correlation_id)});`);
  }

  async findById(assignmentId) {
    return mapAssignment(await this.db.queryOne(`SELECT * FROM assignments WHERE assignment_id = ${sqlValue(assignmentId)};`));
  }

  async updateStatus(assignmentId, status, updatedAt, correlationId) {
    await this.db.execute(`UPDATE assignments SET status = ${sqlValue(status)}, updated_at = ${sqlValue(updatedAt)}, correlation_id = ${sqlValue(correlationId)} WHERE assignment_id = ${sqlValue(assignmentId)};`);
  }

  async findActiveByIncident(incidentId) {
    const rows = await this.db.queryAll(`SELECT * FROM assignments WHERE incident_id = ${sqlValue(incidentId)} AND status IN ('Assigned', 'Accepted', 'Mobilised', 'Active');`);
    return rows.map(mapAssignment);
  }

  async findActiveByCrewMember(actorId) {
    const rows = await this.db.queryAll(`
        SELECT * FROM assignments
        WHERE status IN ('Assigned', 'Accepted', 'Mobilised', 'Active')
          AND EXISTS (SELECT 1 FROM json_each(crew_ids_json) WHERE json_each.value = ${sqlValue(actorId)})
        ORDER BY created_at DESC;
      `);
    return rows.map(mapAssignment);
  }

  async findByIncidentId(incidentId) {
    const rows = await this.db.queryAll(`SELECT * FROM assignments WHERE incident_id = ${sqlValue(incidentId)} ORDER BY created_at DESC;`);
    return rows.map(mapAssignment);
  }
}

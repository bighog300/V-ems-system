import { sqlValue } from "../db.mjs";

function mapIncident(row) {
  if (!row) return undefined;
  return {
    incident_id: row.incident_id,
    call_id: row.call_id,
    status: row.status,
    category: row.category,
    priority: row.priority,
    description: row.description,
    address: row.address,
    patient_count: Number(row.patient_count),
    created_at: row.created_at,
    updated_at: row.updated_at,
    correlation_id: row.correlation_id
  };
}

export class IncidentRepository {
  constructor(db) {
    this.db = db;
  }

  nextIncidentId() {
    const row = this.db.queryOne("SELECT COALESCE(MAX(CAST(SUBSTR(incident_id, 5) AS INTEGER)), 0) + 1 AS next_id FROM incidents;");
    return `INC-${String(row.next_id).padStart(6, "0")}`;
  }

  nextCallId() {
    const row = this.db.queryOne("SELECT COALESCE(MAX(CAST(SUBSTR(call_id, 6) AS INTEGER)), 0) + 1 AS next_id FROM incidents;");
    return `CALL-${String(row.next_id).padStart(6, "0")}`;
  }

  create(record) {
    this.db.execute(`INSERT INTO incidents (incident_id, call_id, status, category, priority, description, address, patient_count, created_at, updated_at, correlation_id)
      VALUES (${sqlValue(record.incident_id)}, ${sqlValue(record.call_id)}, ${sqlValue(record.status)}, ${sqlValue(record.category)}, ${sqlValue(record.priority)}, ${sqlValue(record.description)}, ${sqlValue(record.address)}, ${sqlValue(record.patient_count)}, ${sqlValue(record.created_at)}, ${sqlValue(record.updated_at)}, ${sqlValue(record.correlation_id)});`);
  }

  findById(incidentId) {
    return mapIncident(this.db.queryOne(`SELECT * FROM incidents WHERE incident_id = ${sqlValue(incidentId)};`));
  }

  updateStatus(incidentId, status, updatedAt, correlationId) {
    this.db.execute(`UPDATE incidents SET status = ${sqlValue(status)}, updated_at = ${sqlValue(updatedAt)}, correlation_id = ${sqlValue(correlationId)} WHERE incident_id = ${sqlValue(incidentId)};`);
  }
}

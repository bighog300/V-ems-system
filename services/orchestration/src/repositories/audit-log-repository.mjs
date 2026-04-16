import { sqlValue } from "../db.mjs";

export class AuditLogRepository {
  constructor(db) {
    this.db = db;
  }

  append(entry) {
    this.db.execute(`INSERT INTO audit_logs (timestamp, entity_type, entity_id, action, correlation_id, before_json, after_json)
      VALUES (${sqlValue(entry.timestamp)}, ${sqlValue(entry.entity_type)}, ${sqlValue(entry.entity_id)}, ${sqlValue(entry.action)}, ${sqlValue(entry.correlation_id)}, ${sqlValue(entry.before_json ? JSON.stringify(entry.before_json) : null)}, ${sqlValue(entry.after_json ? JSON.stringify(entry.after_json) : null)});`);
  }
}

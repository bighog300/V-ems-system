import { sqlValue } from "../db.mjs";

function mapIntent(row) {
  return {
    intent_id: Number(row.intent_id),
    target_system: row.target_system,
    entity_type: row.entity_type,
    operation: row.operation,
    correlation_id: row.correlation_id,
    created_at: row.created_at,
    payload: JSON.parse(row.payload_json)
  };
}

export class SyncIntentRepository {
  constructor(db) {
    this.db = db;
  }

  append(intent) {
    this.db.execute(`INSERT INTO sync_intents (target_system, entity_type, operation, correlation_id, created_at, payload_json)
      VALUES (${sqlValue(intent.target_system)}, ${sqlValue(intent.entity_type)}, ${sqlValue(intent.operation)}, ${sqlValue(intent.correlation_id)}, ${sqlValue(intent.created_at)}, ${sqlValue(JSON.stringify(intent.payload))});`);
  }

  listAll() {
    return this.db.queryAll("SELECT * FROM sync_intents ORDER BY intent_id;").map(mapIntent);
  }
}

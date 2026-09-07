import { sqlValue } from "../db.mjs";

function mapEvent(row) {
  return {
    event_id: row.event_id,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    source_system: row.source_system,
    correlation_id: row.correlation_id,
    payload: JSON.parse(row.payload_json)
  };
}

export class EventOutboxRepository {
  constructor(db) {
    this.db = db;
  }

  append(event) {
    this.db.execute(`INSERT INTO event_outbox (event_id, event_type, occurred_at, source_system, correlation_id, payload_json)
      VALUES (${sqlValue(event.event_id)}, ${sqlValue(event.event_type)}, ${sqlValue(event.occurred_at)}, ${sqlValue(event.source_system)}, ${sqlValue(event.correlation_id)}, ${sqlValue(JSON.stringify(event.payload))});`);
  }

  listAll() {
    // event_id is a random UUID, not a monotonic sequence, so it can't break ties
    // between events with an identical occurred_at timestamp in insertion order.
    // rowid (implicit on this table) reflects actual insertion order and is stable.
    return this.db.queryAll("SELECT * FROM event_outbox ORDER BY occurred_at, rowid;").map(mapEvent);
  }
}

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

  async append(event) {
    // event_id is a random UUID, not a monotonic sequence, so it can't break
    // ties between events with an identical occurred_at timestamp in
    // insertion order — event_seq (via the same portable id_sequences
    // atomic-increment pattern used for INC-/CALL-/PCR- ids) does that job
    // instead, since neither backend's implicit row order is something to
    // depend on (Postgres has none at all).
    const seq = await this.db.queryOne(`
      INSERT INTO id_sequences (name, next_value)
      VALUES ('event_outbox', 2)
      ON CONFLICT(name) DO UPDATE SET next_value = id_sequences.next_value + 1
      RETURNING next_value - 1 AS next_seq;
    `);
    await this.db.execute(`INSERT INTO event_outbox (event_id, event_type, occurred_at, source_system, correlation_id, payload_json, event_seq)
      VALUES (${sqlValue(event.event_id)}, ${sqlValue(event.event_type)}, ${sqlValue(event.occurred_at)}, ${sqlValue(event.source_system)}, ${sqlValue(event.correlation_id)}, ${sqlValue(JSON.stringify(event.payload))}, ${sqlValue(seq.next_seq)});`);
  }

  async listAll() {
    const rows = await this.db.queryAll("SELECT * FROM event_outbox ORDER BY occurred_at, event_seq;");
    return rows.map(mapEvent);
  }
}

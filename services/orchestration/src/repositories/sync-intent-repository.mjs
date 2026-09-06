import { sqlValue } from "../db.mjs";

function mapIntent(row) {
  return {
    intent_id: Number(row.intent_id),
    target_system: row.target_system,
    intent_type: row.intent_type ?? row.operation,
    entity_type: row.entity_type,
    operation: row.operation,
    correlation_id: row.correlation_id,
    created_at: row.created_at,
    status: row.status ?? "pending",
    attempt_count: Number(row.attempt_count ?? 0),
    last_error: row.last_error ?? null,
    last_error_classification: row.last_error_classification ?? null,
    processed_at: row.processed_at ?? null,
    dead_lettered_at: row.dead_lettered_at ?? null,
    next_attempt_at: row.next_attempt_at ?? null,
    claim_token: row.claim_token ?? null,
    claimed_at: row.claimed_at ?? null,
    lease_expires_at: row.lease_expires_at ?? null,
    outcome_unknown: Boolean(row.outcome_unknown),
    retryable: row.retryable !== 0,
    payload: JSON.parse(row.payload_json)
  };
}

export class SyncIntentRepository {
  constructor(db) {
    this.db = db;
  }

  append(intent) {
    const createdAt = intent.created_at;
    this.db.execute(`INSERT INTO sync_intents (target_system, intent_type, entity_type, operation, correlation_id, created_at, status, attempt_count, next_attempt_at, payload_json)
      VALUES (${sqlValue(intent.target_system)}, ${sqlValue(intent.intent_type ?? intent.operation)}, ${sqlValue(intent.entity_type)}, ${sqlValue(intent.operation)}, ${sqlValue(intent.correlation_id)}, ${sqlValue(createdAt)}, 'pending', 0, ${sqlValue(createdAt)}, ${sqlValue(JSON.stringify(intent.payload))});`);
  }

  listAll() {
    return this.db.queryAll("SELECT * FROM sync_intents ORDER BY intent_id;").map(mapIntent);
  }

  listPending(limit = 100) {
    return this.db.queryAll(
      `SELECT * FROM sync_intents WHERE (status = 'pending' OR (status='processing' AND lease_expires_at IS NOT NULL AND julianday(lease_expires_at) <= julianday('now'))) AND (next_attempt_at IS NULL OR julianday(next_attempt_at) <= julianday('now')) ORDER BY intent_id LIMIT ${sqlValue(limit)};`
    ).map(mapIntent);
  }

  claim(intentId, token, leaseMs = 30000) {
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + leaseMs).toISOString();
    return this.db.withTransaction(() => {
      const current = this.db.queryOne(`SELECT status,claim_token,lease_expires_at FROM sync_intents WHERE intent_id=${sqlValue(intentId)};`);
      if (!current || (current.status === "processing" && current.lease_expires_at > now && current.claim_token !== token)) return false;
      this.db.execute(`UPDATE sync_intents SET status='processing', claim_token=${sqlValue(token)}, claimed_at=${sqlValue(now)}, lease_expires_at=${sqlValue(expires)} WHERE intent_id=${sqlValue(intentId)};`);
      return true;
    });
  }

  markSucceeded(intentId, processedAt) {
    this.db.execute(`UPDATE sync_intents
      SET status = 'succeeded',
          processed_at = ${sqlValue(processedAt)},
          last_error = NULL,
          last_error_classification = NULL,
          next_attempt_at = NULL
          ,claim_token = NULL
          ,claimed_at = NULL
          ,lease_expires_at = NULL
      WHERE intent_id = ${sqlValue(intentId)};`);
  }

  markFailed(intentId, failure) {
    this.db.execute(`UPDATE sync_intents
      SET status = ${sqlValue(failure.status)},
          attempt_count = ${sqlValue(failure.attempt_count)},
          last_error = ${sqlValue(failure.last_error)},
          last_error_classification = ${sqlValue(failure.last_error_classification)},
          dead_lettered_at = ${sqlValue(failure.dead_lettered_at ?? null)},
          next_attempt_at = ${sqlValue(failure.next_attempt_at ?? null)},
          outcome_unknown = ${sqlValue(failure.outcome_unknown ? 1 : 0)},
          retryable = ${sqlValue(failure.retryable === false ? 0 : 1)},
          claim_token = NULL,
          claimed_at = NULL,
          lease_expires_at = NULL
      WHERE intent_id = ${sqlValue(intentId)};`);
  }

  replayDeadLetter(intentId) {
    this.db.execute(`UPDATE sync_intents
      SET status = 'pending',
          attempt_count = 0,
          last_error = NULL,
          last_error_classification = NULL,
          dead_lettered_at = NULL,
          next_attempt_at = ${sqlValue(new Date().toISOString())}
      WHERE intent_id = ${sqlValue(intentId)} AND status = 'dead_lettered';`);
  }
}

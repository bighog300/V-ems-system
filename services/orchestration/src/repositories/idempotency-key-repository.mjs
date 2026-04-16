import { sqlValue } from "../db.mjs";

export class IdempotencyKeyRepository {
  constructor(db) {
    this.db = db;
  }

  getResourceId(scope, idempotencyKey) {
    const row = this.db.queryOne(`SELECT resource_id FROM idempotency_keys WHERE scope = ${sqlValue(scope)} AND idempotency_key = ${sqlValue(idempotencyKey)};`);
    return row?.resource_id;
  }

  save(scope, idempotencyKey, resourceId, createdAt) {
    this.db.execute(`INSERT OR IGNORE INTO idempotency_keys (scope, idempotency_key, resource_id, created_at)
      VALUES (${sqlValue(scope)}, ${sqlValue(idempotencyKey)}, ${sqlValue(resourceId)}, ${sqlValue(createdAt)});`);
  }
}

import { sqlValue } from "../db.mjs";

export class IdempotencyKeyRepository {
  constructor(db) {
    this.db = db;
  }

  get(scope, idempotencyKey) {
    return this.db.queryOne(`SELECT * FROM idempotency_keys WHERE scope = ${sqlValue(scope)} AND idempotency_key = ${sqlValue(idempotencyKey)};`);
  }

  getResourceId(scope, idempotencyKey) {
    return this.get(scope, idempotencyKey)?.resource_id;
  }

  save(scope, idempotencyKey, resourceId, createdAt, requestFingerprint = null) {
    this.db.execute(`INSERT OR IGNORE INTO idempotency_keys (scope, idempotency_key, resource_id, created_at, request_fingerprint)
      VALUES (${sqlValue(scope)}, ${sqlValue(idempotencyKey)}, ${sqlValue(resourceId)}, ${sqlValue(createdAt)}, ${sqlValue(requestFingerprint)});`);
  }
}

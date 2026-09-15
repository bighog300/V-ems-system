import { sqlValue } from "../db.mjs";

export class IdempotencyKeyRepository {
  constructor(db) {
    this.db = db;
  }

  async get(scope, idempotencyKey) {
    return this.db.queryOne(`SELECT * FROM idempotency_keys WHERE scope = ${sqlValue(scope)} AND idempotency_key = ${sqlValue(idempotencyKey)};`);
  }

  async getResourceId(scope, idempotencyKey) {
    return (await this.get(scope, idempotencyKey))?.resource_id;
  }

  async save(scope, idempotencyKey, resourceId, createdAt, requestFingerprint = null) {
    await this.db.execute(`INSERT INTO idempotency_keys (scope, idempotency_key, resource_id, created_at, request_fingerprint)
      VALUES (${sqlValue(scope)}, ${sqlValue(idempotencyKey)}, ${sqlValue(resourceId)}, ${sqlValue(createdAt)}, ${sqlValue(requestFingerprint)})
      ON CONFLICT (scope, idempotency_key) DO NOTHING;`);
  }
}

import { sqlValue } from "../db.mjs";

export class RevocationRepository {
  constructor(db) {
    this.db = db;
  }

  async revoke(record) {
    await this.db.execute(`INSERT INTO access_revocations (revocation_id, scope, target, reason, revoked_by, revoked_at, correlation_id)
      VALUES (${sqlValue(record.revocation_id)}, ${sqlValue(record.scope)}, ${sqlValue(record.target)}, ${sqlValue(record.reason)}, ${sqlValue(record.revoked_by)}, ${sqlValue(record.revoked_at)}, ${sqlValue(record.correlation_id)})
      ON CONFLICT(scope, target) DO UPDATE SET
        reason = excluded.reason,
        revoked_by = excluded.revoked_by,
        revoked_at = excluded.revoked_at,
        correlation_id = excluded.correlation_id;`);
  }

  async isRevoked(scope, target) {
    if (!target) return false;
    return Boolean(await this.db.queryOne(`SELECT 1 AS found FROM access_revocations WHERE scope=${sqlValue(scope)} AND target=${sqlValue(target)};`));
  }

  async list() {
    return this.db.queryAll("SELECT * FROM access_revocations ORDER BY revoked_at DESC;");
  }
}

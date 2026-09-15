CREATE TABLE IF NOT EXISTS access_revocations (
  revocation_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT,
  revoked_by TEXT,
  revoked_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE(scope, target)
);

CREATE INDEX IF NOT EXISTS idx_access_revocations_scope_target ON access_revocations(scope, target);

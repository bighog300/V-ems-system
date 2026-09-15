-- Stage 13 milestone 13f: adds an actor column to audit_logs so the
-- audit trail can answer "who", not just "what happened and when" --
-- per docs/STAGE13_COMPLIANCE_REPORTING_PLAN.md's 13f entry. Nullable and
-- additive: every audit_logs row written before this migration predates
-- the column and stays actor-less, a known, documented gap for historical
-- entries. Every audit() call going forward populates it from meta.actorId.

ALTER TABLE audit_logs ADD COLUMN actor_id TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, timestamp);

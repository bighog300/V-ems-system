DROP INDEX IF EXISTS idx_audit_logs_entity;
DROP INDEX IF EXISTS idx_audit_logs_actor;
ALTER TABLE audit_logs DROP COLUMN actor_id;

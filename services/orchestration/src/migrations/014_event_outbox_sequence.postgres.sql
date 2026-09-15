-- Postgres has no implicit rowid, and every Postgres deployment starts
-- fresh (no pre-existing event_outbox rows to preserve insertion order
-- for), so there's nothing to backfill — just seed the sequence at 1.
ALTER TABLE event_outbox ADD COLUMN event_seq INTEGER;
INSERT INTO id_sequences (name, next_value) VALUES ('event_outbox', 1);

-- event_id is a random UUID and can't break ties between events sharing an
-- occurred_at timestamp in true insertion order. SQLite's implicit rowid
-- did that job until now, but rowid doesn't exist in Postgres, so listAll's
-- ordering needs an explicit, portable sequence column instead. Backfilling
-- from rowid here preserves the ordering of any events already on disk.
ALTER TABLE event_outbox ADD COLUMN event_seq INTEGER;
UPDATE event_outbox SET event_seq = rowid;
INSERT INTO id_sequences (name, next_value) SELECT 'event_outbox', COALESCE(MAX(event_seq), 0) + 1 FROM event_outbox;

DELETE FROM id_sequences WHERE name = 'event_outbox';
ALTER TABLE event_outbox DROP COLUMN event_seq;

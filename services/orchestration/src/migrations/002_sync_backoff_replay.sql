ALTER TABLE sync_intents ADD COLUMN next_attempt_at TEXT;

UPDATE sync_intents
SET next_attempt_at = created_at
WHERE next_attempt_at IS NULL;

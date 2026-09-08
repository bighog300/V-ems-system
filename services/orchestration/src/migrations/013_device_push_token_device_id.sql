ALTER TABLE device_push_tokens ADD COLUMN device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_device_id ON device_push_tokens(device_id);

CREATE TABLE IF NOT EXISTS device_push_tokens (
  device_push_token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id TEXT NOT NULL,
  expo_push_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_staff_id ON device_push_tokens(staff_id);

CREATE TABLE IF NOT EXISTS stock_items (
  stock_item_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  item_type TEXT NOT NULL,
  active_status TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_stock (
  vehicle_id TEXT NOT NULL,
  stock_item_id TEXT NOT NULL,
  quantity_on_hand TEXT NOT NULL DEFAULT '0',
  minimum_quantity TEXT NOT NULL DEFAULT '0',
  target_quantity TEXT NOT NULL DEFAULT '0',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, stock_item_id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id),
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(stock_item_id)
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  transaction_id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  stock_item_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  quantity_delta TEXT NOT NULL,
  source_reference TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (vehicle_id, stock_item_id) REFERENCES vehicle_stock(vehicle_id, stock_item_id)
);

CREATE TABLE IF NOT EXISTS stock_usage (
  stock_usage_id TEXT PRIMARY KEY,
  intervention_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  encounter_id TEXT,
  stock_item_id TEXT NOT NULL,
  vehicle_id TEXT,
  quantity_used TEXT NOT NULL,
  usage_source TEXT NOT NULL,
  performed_at TEXT NOT NULL,
  intervention_type TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  discrepancy_status TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(stock_item_id)
);

CREATE TABLE IF NOT EXISTS stock_item_vtiger_links (
  stock_item_id TEXT PRIMARY KEY,
  remote_id TEXT,
  remote_number TEXT,
  external_key TEXT NOT NULL UNIQUE,
  create_correlation_id TEXT NOT NULL,
  last_correlation_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(stock_item_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicle_stock_vtiger_links (
  vehicle_id TEXT NOT NULL,
  stock_item_id TEXT NOT NULL,
  remote_id TEXT,
  remote_number TEXT,
  external_key TEXT NOT NULL UNIQUE,
  create_correlation_id TEXT NOT NULL,
  last_correlation_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, stock_item_id),
  FOREIGN KEY (vehicle_id, stock_item_id) REFERENCES vehicle_stock(vehicle_id, stock_item_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_usage_vtiger_links (
  stock_usage_id TEXT PRIMARY KEY,
  remote_id TEXT,
  remote_number TEXT,
  external_key TEXT NOT NULL UNIQUE,
  create_correlation_id TEXT NOT NULL,
  last_correlation_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_error_code TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (stock_usage_id) REFERENCES stock_usage(stock_usage_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stock_items_status ON stock_items(active_status);
CREATE INDEX IF NOT EXISTS idx_vehicle_stock_item ON vehicle_stock(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_loadout ON stock_transactions(vehicle_id, stock_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_usage_intervention ON stock_usage(intervention_id, stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_usage_vehicle ON stock_usage(vehicle_id, stock_item_id);

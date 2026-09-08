#!/usr/bin/env node
// One-time data migration from an existing SQLite deployment to Postgres,
// once VEMS_DB_DRIVER=postgres is ready to become the deployment's driver.
// The target Postgres database is migrated to the current schema first
// (via PostgresClient's own bootstrap), then every table is copied over in
// FK-dependency order, generically — reading each row's own columns rather
// than hardcoding a column list per table — so this doesn't drift out of
// sync with the migrations as new columns/tables are added over time.
//
// Usage:
//   node scripts/migrate-sqlite-to-postgres.mjs <sqlite-db-path> <postgres-connection-string>
//
// Safe to re-run: every insert uses ON CONFLICT DO NOTHING, so a partially
// completed run (or a target that already has some rows) just fills in
// whatever's missing rather than erroring or duplicating.
import { SqliteClient } from "../services/orchestration/src/db.mjs";
import { PostgresClient } from "../services/orchestration/src/postgres-client.mjs";
import { sqlValue } from "../services/orchestration/src/sql-value.mjs";

// Mirrors the order tables are first CREATEd across the migration set, so
// every foreign key a row references has already been copied in by the
// time that row is inserted.
const TABLES_IN_DEPENDENCY_ORDER = [
  "incidents",
  "calls",
  "assignments",
  "vehicles",
  "personnel",
  "stock_items",
  "id_sequences",
  "audit_logs",
  "event_outbox",
  "idempotency_keys",
  "sync_intents",
  "patient_links",
  "encounter_links",
  "vtiger_links",
  "assignment_vtiger_links",
  "vehicle_vtiger_links",
  "personnel_vtiger_links",
  "assignment_personnel_vtiger_links",
  "vehicle_stock",
  "stock_transactions",
  "stock_item_vtiger_links",
  "vehicle_stock_vtiger_links",
  "patient_cases",
  "stock_usage",
  "stock_usage_vtiger_links",
  "patient_case_patient_links",
  "patient_case_encounter_links",
  "patient_case_identity_reconciliations",
  "patient_case_encounter_requests",
  "patient_case_provisional_requests",
  "patient_case_demographics",
  "patient_case_assessments",
  "clinical_observations",
  "medication_administrations",
  "clinical_procedures",
  "patient_case_dispositions",
  "patient_case_timeline_events",
  "epcr_versions",
  "epcr_lifecycle_events",
  "epcr_signatures",
  "epcr_amendments",
  "epcr_reviews",
  "epcr_qa_flags",
  "device_push_tokens"
];

// Tables whose SQLite INTEGER PRIMARY KEY AUTOINCREMENT column became a
// Postgres SERIAL (see migrations 001/012's .postgres.sql variants).
// Copying rows in with their original, explicit id values doesn't advance
// the backing sequence, so the next auto-generated insert would collide
// with an id we just migrated in — bump each sequence past the migrated
// data's high-water mark once the copy is done.
const SERIAL_COLUMNS = {
  audit_logs: "id",
  sync_intents: "intent_id",
  device_push_tokens: "device_push_token_id"
};

async function resyncSerialSequence(postgres, table, column) {
  await postgres.execute(
    `SELECT setval(pg_get_serial_sequence('${table}', '${column}'), COALESCE((SELECT MAX(${column}) FROM ${table}), 1), (SELECT MAX(${column}) FROM ${table}) IS NOT NULL);`
  );
}

async function copyTable(sqlite, postgres, table) {
  const rows = await sqlite.queryAll(`SELECT * FROM ${table};`);
  if (!rows.length) {
    console.log(`${table}: 0 rows`);
    return;
  }
  const columns = Object.keys(rows[0]);
  for (const row of rows) {
    const values = columns.map((column) => sqlValue(row[column])).join(",");
    await postgres.execute(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${values}) ON CONFLICT DO NOTHING;`);
  }
  if (SERIAL_COLUMNS[table]) await resyncSerialSequence(postgres, table, SERIAL_COLUMNS[table]);
  console.log(`${table}: ${rows.length} rows migrated`);
}

async function main() {
  const [sqlitePath, postgresUrl] = process.argv.slice(2);
  if (!sqlitePath || !postgresUrl) {
    console.error("Usage: node scripts/migrate-sqlite-to-postgres.mjs <sqlite-db-path> <postgres-connection-string>");
    process.exitCode = 1;
    return;
  }

  const sqlite = new SqliteClient(sqlitePath);
  const postgres = new PostgresClient({ connectionString: postgresUrl });
  await postgres.execute("SELECT 1;"); // wait for the target schema to bootstrap

  try {
    for (const table of TABLES_IN_DEPENDENCY_ORDER) {
      await copyTable(sqlite, postgres, table);
    }
    console.log("Data migration complete.");
  } finally {
    await postgres.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

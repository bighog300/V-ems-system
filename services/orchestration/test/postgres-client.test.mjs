import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDbClient } from "../src/db.mjs";
import { migrationFiles } from "../src/migration-files.mjs";

// PostgresClient needs a real Postgres to talk to. It's exercised here only
// when VEMS_TEST_POSTGRES_URL points at one (set by CI's postgres service
// container, or by a developer running one locally) — everywhere else these
// tests skip cleanly rather than fail, the same way sqlite's embedded
// runtime falls back gracefully when node:sqlite isn't available.
const POSTGRES_URL = process.env.VEMS_TEST_POSTGRES_URL;
const maybeTest = POSTGRES_URL ? test : test.skip;

async function freshClient() {
  const db = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  await db.execute("SELECT 1;"); // wait for migration bootstrap
  return db;
}

maybeTest("bootstraps the full migration set and is idempotent across instances", async () => {
  const db = await freshClient();
  try {
    const rows = await db.queryAll("SELECT id FROM schema_migrations ORDER BY id;");
    const expectedIds = migrationFiles("postgres").map((m) => m.id);
    assert.deepEqual(rows.map((r) => r.id), expectedIds);

    // A second client against the same database should see every migration
    // already applied and bootstrap as a no-op.
    const second = await freshClient();
    const rowsAgain = await second.queryAll("SELECT id FROM schema_migrations ORDER BY id;");
    assert.deepEqual(rowsAgain.map((r) => r.id), expectedIds);
    await second.close();
  } finally {
    await db.close();
  }
});

maybeTest("queryOne/queryAll/execute round-trip through the DbClient interface", async () => {
  const db = await freshClient();
  try {
    const id = randomUUID();
    await db.execute(`INSERT INTO incidents (incident_id, call_id, status, category, priority, description, address, patient_count, created_at, updated_at, correlation_id)
      VALUES ('${id}', 'CALL-1', 'Open', 'medical_emergency', 'high', 'test', 'test', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'corr');`);
    const one = await db.queryOne(`SELECT * FROM incidents WHERE incident_id = '${id}';`);
    assert.equal(one.incident_id, id);
    const all = await db.queryAll(`SELECT * FROM incidents WHERE incident_id = '${id}';`);
    assert.equal(all.length, 1);
  } finally {
    await db.close();
  }
});

maybeTest("withTransaction commits on success and rolls back on error", async () => {
  const db = await freshClient();
  try {
    const id = randomUUID();
    await db.withTransaction(async () => {
      await db.execute(`INSERT INTO incidents (incident_id, call_id, status, category, priority, description, address, patient_count, created_at, updated_at, correlation_id)
        VALUES ('${id}', 'CALL-1', 'Open', 'medical_emergency', 'high', 'test', 'test', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'corr');`);
    });
    assert.ok(await db.queryOne(`SELECT 1 FROM incidents WHERE incident_id = '${id}';`));

    const failingId = randomUUID();
    await assert.rejects(() => db.withTransaction(async () => {
      await db.execute(`INSERT INTO incidents (incident_id, call_id, status, category, priority, description, address, patient_count, created_at, updated_at, correlation_id)
        VALUES ('${failingId}', 'CALL-1', 'Open', 'medical_emergency', 'high', 'test', 'test', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'corr');`);
      throw new Error("boom");
    }));
    assert.equal(await db.queryOne(`SELECT 1 FROM incidents WHERE incident_id = '${failingId}';`), undefined);
  } finally {
    await db.close();
  }
});

maybeTest("queries made inside a transaction's own callback see uncommitted rows and don't deadlock", async () => {
  const db = await freshClient();
  try {
    const id = randomUUID();
    const seenInsideTransaction = await db.withTransaction(async () => {
      await db.execute(`INSERT INTO incidents (incident_id, call_id, status, category, priority, description, address, patient_count, created_at, updated_at, correlation_id)
        VALUES ('${id}', 'CALL-1', 'Open', 'medical_emergency', 'high', 'test', 'test', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'corr');`);
      // A nested withTransaction call (as OrchestrationService methods that
      // call other transactional methods sometimes do) must reenter on the
      // same connection rather than deadlock waiting on itself.
      return db.withTransaction(async () => db.queryOne(`SELECT 1 AS found FROM incidents WHERE incident_id = '${id}';`));
    });
    assert.equal(seenInsideTransaction.found, 1);
  } finally {
    await db.close();
  }
});

maybeTest("two overlapping withTransaction calls don't corrupt each other's writes", async () => {
  const db = await freshClient();
  try {
    const idA = randomUUID();
    const idB = randomUUID();
    const insert = (id) => db.withTransaction(async () => {
      await db.execute(`INSERT INTO incidents (incident_id, call_id, status, category, priority, description, address, patient_count, created_at, updated_at, correlation_id)
        VALUES ('${id}', 'CALL-1', 'Open', 'medical_emergency', 'high', 'test', 'test', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'corr');`);
    });
    await Promise.all([insert(idA), insert(idB)]);
    const rows = await db.queryAll(`SELECT incident_id FROM incidents WHERE incident_id IN ('${idA}', '${idB}') ORDER BY incident_id;`);
    assert.deepEqual(rows.map((r) => r.incident_id).sort(), [idA, idB].sort());
  } finally {
    await db.close();
  }
});

maybeTest("createDbClient(VEMS_DB_DRIVER=postgres) selects PostgresClient", async () => {
  const previous = process.env.VEMS_DB_DRIVER;
  process.env.VEMS_DB_DRIVER = "postgres";
  try {
    const db = createDbClient({ connectionString: POSTGRES_URL });
    await db.execute("SELECT 1;");
    assert.equal(db.dialect, "postgres");
    await db.close();
  } finally {
    if (previous === undefined) delete process.env.VEMS_DB_DRIVER;
    else process.env.VEMS_DB_DRIVER = previous;
  }
});

test("createDbClient rejects an unknown driver", () => {
  assert.throws(() => createDbClient({ driver: "mysql" }), /Unknown VEMS_DB_DRIVER/);
});

test("migrationFiles resolves dialect-specific variants only where they exist", () => {
  const sqliteFiles = migrationFiles("sqlite");
  const postgresFiles = migrationFiles("postgres");
  assert.deepEqual(sqliteFiles.map((m) => m.id), postgresFiles.map((m) => m.id));

  const postgresById = new Map(postgresFiles.map((m) => [m.id, m.file.href]));
  assert.match(postgresById.get("001_initial_schema"), /001_initial_schema\.postgres\.sql$/);
  assert.match(postgresById.get("008_epcr_patient_cases"), /008_epcr_patient_cases\.postgres\.sql$/);
  assert.match(postgresById.get("012_device_push_tokens"), /012_device_push_tokens\.postgres\.sql$/);
  assert.match(postgresById.get("014_event_outbox_sequence"), /014_event_outbox_sequence\.postgres\.sql$/);

  const sqliteById = new Map(sqliteFiles.map((m) => [m.id, m.file.href]));
  // A migration with no dialect-specific variant is shared as-is.
  assert.match(sqliteById.get("003_vtiger_incident_integration"), /003_vtiger_incident_integration\.sql$/);
  assert.doesNotMatch(sqliteById.get("003_vtiger_incident_integration"), /\.sqlite\.sql$/);
});

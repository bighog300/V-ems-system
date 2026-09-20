import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteClient, assertFreshDevelopmentPath, hasEmbeddedSqliteRuntime } from "../src/db.mjs";

function mockEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
}

test("sqlite runtime remains operational in test environment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-db-runtime-"));
  const db = new SqliteClient(join(dir, "platform.sqlite"));

  await db.execute("CREATE TABLE IF NOT EXISTS runtime_test (id TEXT PRIMARY KEY, value TEXT NOT NULL);");
  await db.execute("INSERT INTO runtime_test (id, value) VALUES ('1', 'ok');");
  const row = await db.queryOne("SELECT value FROM runtime_test WHERE id = '1';");

  assert.equal(row.value, "ok");
  assert.equal(typeof hasEmbeddedSqliteRuntime(), "boolean");
});

test("existing-database mode fails visibly instead of creating a fallback database", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-db-missing-"));
  assert.throws(
    () => new SqliteClient(join(dir, "missing.sqlite"), { requireExisting: true }),
    /Configured SQLite database is missing/
  );
});

test("existing-database mode accepts the configured database file", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-db-existing-"));
  const path = join(dir, "platform.sqlite");
  writeFileSync(path, "");
  assert.doesNotThrow(() => new SqliteClient(path, { requireExisting: true }));
});

test("fresh-development mode initializes only an explicit disposable SQLite path", (t) => {
  mockEnv(t, 'NODE_ENV', 'development');
  mockEnv(t, 'APP_ENV', 'development');
  const dir = mkdtempSync(join(tmpdir(), "vems-db-fresh-"));
  const path = join(dir, "windows-development.sqlite");
  assert.doesNotThrow(() => assertFreshDevelopmentPath(path));
  assert.doesNotThrow(() => new SqliteClient(path, { initMode: "fresh-development" }));
  assert.throws(() => assertFreshDevelopmentPath(join(dir, "platform.sqlite")), /retained or production-style/);
  assert.throws(() => assertFreshDevelopmentPath(join(process.cwd(), "services/api-gateway/.data/windows.sqlite")), /outside the repository/);
});

test('fresh initialization fails closed in production and respects require-existing', (t) => {
  const path = join(mkdtempSync(join(tmpdir(), 'vems-db-guard-')), 'windows-development.sqlite');
  mockEnv(t, 'NODE_ENV', 'production');
  mockEnv(t, 'APP_ENV', 'development');
  assert.throws(() => new SqliteClient(path, { initMode: 'fresh-development' }), /requires NODE_ENV/);
  process.env.NODE_ENV = 'development';
  mockEnv(t, 'VEMS_REQUIRE_EXISTING_DB', 'true');
  assert.throws(() => new SqliteClient(path, { initMode: 'fresh-development' }), /database is missing/);
  assert.throws(() => assertFreshDevelopmentPath('relative.sqlite'), /absolute/);
});

test("unknown database initialization modes fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-db-mode-"));
  assert.throws(() => new SqliteClient(join(dir, "windows.sqlite"), { initMode: "anything-else" }), /Unsupported VEMS_DB_INIT_MODE/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteClient, hasEmbeddedSqliteRuntime } from "../src/db.mjs";

test("sqlite runtime remains operational in test environment", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-db-runtime-"));
  const db = new SqliteClient(join(dir, "platform.sqlite"));

  db.execute("CREATE TABLE IF NOT EXISTS runtime_test (id TEXT PRIMARY KEY, value TEXT NOT NULL);");
  db.execute("INSERT INTO runtime_test (id, value) VALUES ('1', 'ok');");
  const row = db.queryOne("SELECT value FROM runtime_test WHERE id = '1';");

  assert.equal(row.value, "ok");
  assert.equal(typeof hasEmbeddedSqliteRuntime(), "boolean");
});

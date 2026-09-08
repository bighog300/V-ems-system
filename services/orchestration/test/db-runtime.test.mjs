import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteClient, hasEmbeddedSqliteRuntime } from "../src/db.mjs";

test("sqlite runtime remains operational in test environment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-db-runtime-"));
  const db = new SqliteClient(join(dir, "platform.sqlite"));

  await db.execute("CREATE TABLE IF NOT EXISTS runtime_test (id TEXT PRIMARY KEY, value TEXT NOT NULL);");
  await db.execute("INSERT INTO runtime_test (id, value) VALUES ('1', 'ok');");
  const row = await db.queryOne("SELECT value FROM runtime_test WHERE id = '1';");

  assert.equal(row.value, "ok");
  assert.equal(typeof hasEmbeddedSqliteRuntime(), "boolean");
});

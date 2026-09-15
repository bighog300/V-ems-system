import test from "node:test";
import assert from "node:assert/strict";
import { createDbClient } from "../src/db.mjs";
import { rollbackLastMigration, lastAppliedMigration } from "../src/rollback.mjs";
import { migrationFiles } from "../src/migration-files.mjs";

const POSTGRES_URL = process.env.VEMS_TEST_POSTGRES_URL;
const maybeTest = POSTGRES_URL ? test : test.skip;

maybeTest("rolls back the last migration and re-migrating reapplies it", async () => {
  const db = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  try {
    await db.execute("SELECT 1;");
    const allIds = migrationFiles("postgres").map((m) => m.id);
    const lastId = allIds.at(-1);
    assert.equal(await lastAppliedMigration(db), lastId);
    assert.ok(await db.queryOne("SELECT column_name FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'event_seq';"));

    const rolledBack = await rollbackLastMigration(db);
    assert.equal(rolledBack, lastId);
    assert.equal(await lastAppliedMigration(db), allIds.at(-2));
    assert.equal(await db.queryOne("SELECT column_name FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'event_seq';"), undefined);
  } finally {
    await db.close();
  }

  // A fresh client against the same (now rolled-back) database should
  // notice the missing migration during bootstrap and reapply it.
  const reconnected = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  try {
    await reconnected.execute("SELECT 1;");
    const allIds = migrationFiles("postgres").map((m) => m.id);
    assert.equal(await lastAppliedMigration(reconnected), allIds.at(-1));
  } finally {
    await reconnected.close();
  }
});

maybeTest("rolling back a migration with no rollback script fails loudly", async () => {
  const db = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  try {
    await db.execute("SELECT 1;");
    // 013 has no rollback script — roll back 014 (which does) first so 013
    // becomes the "last applied" migration under test.
    await rollbackLastMigration(db);
    await assert.rejects(() => rollbackLastMigration(db), /No rollback script exists for migration "013_device_push_token_device_id"/);
  } finally {
    await db.close();
  }
});

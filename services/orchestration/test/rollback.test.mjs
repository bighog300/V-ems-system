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
    assert.ok(await db.queryOne("SELECT column_name FROM information_schema.columns WHERE table_name = 'patient_case_demographics' AND column_name = 'weight_kg';"));

    const rolledBack = await rollbackLastMigration(db);
    assert.equal(rolledBack, lastId);
    assert.equal(await lastAppliedMigration(db), allIds.at(-2));
    assert.equal(await db.queryOne("SELECT column_name FROM information_schema.columns WHERE table_name = 'patient_case_demographics' AND column_name = 'weight_kg';"), undefined);
    // Earlier migrations remain applied when only the newest migration is rolled back.
    assert.ok(await db.queryOne("SELECT column_name FROM information_schema.columns WHERE table_name = 'clinical_observations' AND column_name = 'device_pairing_id';"));
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

maybeTest("consecutive migrations can each be rolled back in turn, until one with no rollback script is reached", async () => {
  const db = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  try {
    // Fresh client against a fully-migrated database (the prior test leaves
    // it that way, but don't depend on inter-test ordering) — bootstrap
    // reapplies anything missing before any assertion here.
    await db.execute("SELECT 1;");

    // 024 (demographics_weight), 023 (identity_merge_tracking), 022 (clinical_observations_device_pairing), 021 (device_pairings),
    // 020 (patient_case_notes), 019 (retention_and_legal_hold), 018
    // (audit_log_actor), 017 (clinical_terminology_codes), 016
    // (access_revocations), 015 (patient_case_attachments) and 014
    // (event_outbox_sequence) all ship rollback scripts; roll each back in
    // turn.
    const rolledBack024 = await rollbackLastMigration(db);
    assert.equal(rolledBack024, "024_demographics_weight");

    const rolledBack023 = await rollbackLastMigration(db);
    assert.equal(rolledBack023, "023_identity_merge_tracking");

    const rolledBack022 = await rollbackLastMigration(db);
    assert.equal(rolledBack022, "022_clinical_observations_device_pairing");

    const rolledBack021 = await rollbackLastMigration(db);
    assert.equal(rolledBack021, "021_device_pairings");

    const rolledBack020 = await rollbackLastMigration(db);
    assert.equal(rolledBack020, "020_patient_case_notes");

    const rolledBack019 = await rollbackLastMigration(db);
    assert.equal(rolledBack019, "019_retention_and_legal_hold");

    const rolledBack018 = await rollbackLastMigration(db);
    assert.equal(rolledBack018, "018_audit_log_actor");

    const rolledBack017 = await rollbackLastMigration(db);
    assert.equal(rolledBack017, "017_clinical_terminology_codes");

    const rolledBack016 = await rollbackLastMigration(db);
    assert.equal(rolledBack016, "016_access_revocations");

    const rolledBack015 = await rollbackLastMigration(db);
    assert.equal(rolledBack015, "015_patient_case_attachments");
    assert.ok(await db.queryOne("SELECT column_name FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'event_seq';"));

    const rolledBack014 = await rollbackLastMigration(db);
    assert.equal(rolledBack014, "014_event_outbox_sequence");
    assert.equal(await db.queryOne("SELECT column_name FROM information_schema.columns WHERE table_name = 'event_outbox' AND column_name = 'event_seq';"), undefined);

    // 013 has no rollback script.
    await assert.rejects(() => rollbackLastMigration(db), /No rollback script exists for migration "013_device_push_token_device_id"/);
  } finally {
    await db.close();
  }

  // Leave the database fully migrated again for any test that runs after
  // this one.
  const reconnected = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  await reconnected.execute("SELECT 1;");
  await reconnected.close();
});

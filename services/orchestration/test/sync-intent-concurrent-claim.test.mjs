import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDbClient } from "../src/db.mjs";
import { SyncIntentRepository } from "../src/repositories/sync-intent-repository.mjs";
import { SyncWorker } from "../src/sync-worker.mjs";

// Stage 12 milestone 12j: regression coverage for a real race reproduced
// against actual Postgres -- claim()'s original read-then-write
// (SELECT status, then a separate UPDATE) let two independent connections
// both read "claimable" before either write landed, so both claims
// returned true and both would have gone on to process the same intent.
// SQLite masked this in every existing test because SqliteClient
// serializes all async queries through one in-process lock; two separate
// PostgresClient connections/pools (the shape of two real sync-worker
// processes) have no such shared lock, so this needs Postgres to
// reproduce and needs Postgres to verify the fix.
const POSTGRES_URL = process.env.VEMS_TEST_POSTGRES_URL;
const maybeTest = POSTGRES_URL ? test : test.skip;

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-concurrent-claim-"));
  return join(dir, "platform.sqlite");
}

async function insertPendingIntent(db) {
  await db.execute(`INSERT INTO sync_intents (target_system, entity_type, intent_type, operation, correlation_id, created_at, status, attempt_count, payload_json)
    VALUES ('vtiger', 'incident', 'createIncident', 'create', 'corr', '2026-01-01T00:00:00Z', 'pending', 0, '{}');`);
  const row = await db.queryOne("SELECT intent_id FROM sync_intents ORDER BY intent_id DESC LIMIT 1;");
  return row.intent_id;
}

test("claim() serializes concurrent callers on a single SQLite connection (already safe pre-fix)", async () => {
  const db = createDbClient({ dbPath: createDbPath() });
  const syncIntents = new SyncIntentRepository(db);
  const intentId = await insertPendingIntent(db);

  const results = await Promise.all([
    syncIntents.claim(intentId, "token-A", 30000),
    syncIntents.claim(intentId, "token-B", 30000)
  ]);

  assert.equal(results.filter(Boolean).length, 1);
});

maybeTest("claim() is atomic across two independent Postgres connections racing the same intent", async () => {
  // Two separate clients/pools -- the actual shape of two independent
  // sync-worker processes, unlike two calls sharing one SqliteClient.
  const dbA = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  await dbA.execute("SELECT 1;"); // wait for migration bootstrap before constructing dbB, to avoid racing bootstrap itself
  const dbB = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  await dbB.execute("SELECT 1;");

  try {
    const repoA = new SyncIntentRepository(dbA);
    const repoB = new SyncIntentRepository(dbB);
    const intentId = await insertPendingIntent(dbA);

    // Run many trials -- a race that doesn't reproduce on every single
    // attempt is still a real bug; repetition is what makes this
    // regression test meaningful.
    for (let trial = 0; trial < 20; trial += 1) {
      await dbA.execute(`UPDATE sync_intents SET status='pending', claim_token=NULL, claimed_at=NULL, lease_expires_at=NULL WHERE intent_id=${intentId};`);
      const results = await Promise.all([
        repoA.claim(intentId, `token-A-${trial}`, 30000),
        repoB.claim(intentId, `token-B-${trial}`, 30000)
      ]);
      assert.equal(results.filter(Boolean).length, 1, `trial ${trial}: exactly one of two concurrent claims should succeed`);
    }
  } finally {
    await dbA.close();
    await dbB.close();
  }
});

maybeTest("two independent SyncWorker instances processing the same Postgres-backed queue never both process the same intent", async () => {
  const dbA = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  await dbA.execute("SELECT 1;");
  const dbB = createDbClient({ driver: "postgres", connectionString: POSTGRES_URL });
  await dbB.execute("SELECT 1;");

  try {
    const syncIntentsA = new SyncIntentRepository(dbA);
    const syncIntentsB = new SyncIntentRepository(dbB);

    const intentCount = 10;
    // Track exactly which intent_ids this test created -- the previous
    // test shares the same database (a fresh per-test schema isn't worth
    // the setup cost here) and can leave its own single intent behind in
    // a non-'succeeded' state, so checks below must not look at the whole
    // table.
    const intentIds = [];
    for (let i = 0; i < intentCount; i += 1) intentIds.push(await insertPendingIntent(dbA));

    function workerFor(syncIntents) {
      return new SyncWorker({
        syncIntents,
        vtiger: { createIncident: async () => ({ ok: true }) },
        openemr: {},
        expo: {},
        onSuccess: async (intent) => syncIntents.markSucceeded(intent.intent_id, new Date().toISOString())
      });
    }

    // adapter[methodName] only receives the intent's payload, not the
    // intent itself, so which intent a given adapter call belongs to
    // can't be read back out of that call -- but processIntent() only
    // ever runs for an intent this worker successfully claimed, so
    // recording claims (below) is an equivalent, and simpler, proxy for
    // "which worker actually processed which intent".
    const claimedBy = [];
    const originalClaimA = syncIntentsA.claim.bind(syncIntentsA);
    const originalClaimB = syncIntentsB.claim.bind(syncIntentsB);
    syncIntentsA.claim = async (intentId, token, leaseMs) => {
      const ok = await originalClaimA(intentId, token, leaseMs);
      if (ok) claimedBy.push({ intentId, worker: "A" });
      return ok;
    };
    syncIntentsB.claim = async (intentId, token, leaseMs) => {
      const ok = await originalClaimB(intentId, token, leaseMs);
      if (ok) claimedBy.push({ intentId, worker: "B" });
      return ok;
    };

    const workerA = workerFor(syncIntentsA);
    const workerB = workerFor(syncIntentsB);

    // A limit comfortably above intentCount so a leftover row the
    // previous test may have left pending/expired-processing (same
    // database, no per-test schema isolation) doesn't crowd this test's
    // own 10 intents out of either worker's listPending() page.
    const listLimit = intentCount + 10;
    await Promise.all([workerA.processPending(listLimit), workerB.processPending(listLimit)]);

    const ownClaims = claimedBy.filter(({ intentId }) => intentIds.includes(intentId));
    const byIntent = ownClaims.reduce((acc, { intentId }) => {
      acc[intentId] = (acc[intentId] ?? 0) + 1;
      return acc;
    }, {});
    const duplicateClaims = Object.values(byIntent).filter((count) => count > 1);
    assert.deepEqual(duplicateClaims, [], "no intent should be successfully claimed by more than one worker");
    assert.equal(ownClaims.length, intentCount, "every intent should be claimed by exactly one worker between the two");

    const finalRows = await dbA.queryAll(`SELECT intent_id, status FROM sync_intents WHERE intent_id IN (${intentIds.join(",")}) ORDER BY intent_id;`);
    assert.ok(finalRows.every((row) => row.status === "succeeded"), "every intent should end up succeeded exactly once");
  } finally {
    await dbA.close();
    await dbB.close();
  }
});

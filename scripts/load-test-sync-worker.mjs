#!/usr/bin/env node
// Stage 12 milestone 12j: capacity/load baseline for the sync worker,
// exercised against a real Postgres backend (VEMS_POSTGRES_URL/
// DATABASE_URL) rather than SQLite -- concurrency correctness here (no
// intent processed twice) depends on real row-level locking that SQLite's
// single-connection lock trivially provides for free but Postgres
// doesn't, so a baseline against SQLite wouldn't actually exercise what
// this is meant to test.
//
// Seeds LOAD_TEST_SYNC_INTENTS pending intents, then drains them with
// LOAD_TEST_SYNC_WORKERS independent SyncWorker instances (each its own
// PostgresClient/pool, the same shape as separate worker processes)
// running concurrently, and reports throughput/latency plus a hard
// duplicate-processing check.

import { createDbClient } from "../services/orchestration/src/db.mjs";
import { SyncIntentRepository } from "../services/orchestration/src/repositories/sync-intent-repository.mjs";
import { SyncWorker } from "../services/orchestration/src/sync-worker.mjs";

const connectionString = process.env.VEMS_POSTGRES_URL ?? process.env.DATABASE_URL;
const intentCount = Number.parseInt(process.env.LOAD_TEST_SYNC_INTENTS ?? "500", 10);
const workerCount = Number.parseInt(process.env.LOAD_TEST_SYNC_WORKERS ?? "4", 10);
const simulatedLatencyMs = Number.parseInt(process.env.LOAD_TEST_SYNC_LATENCY_MS ?? "20", 10);

function toFixedNumber(value) {
  return Number(value.toFixed(2));
}

async function insertPendingIntent(db, index) {
  const createdAt = new Date().toISOString();
  await db.execute(`INSERT INTO sync_intents (target_system, entity_type, intent_type, operation, correlation_id, created_at, status, attempt_count, payload_json)
    VALUES ('vtiger', 'incident', 'createIncident', 'create', 'load-test-${index}', '${createdAt}', 'pending', 0, '{}');`);
}

async function seed(db, count) {
  // Sequential on purpose -- this models how intents actually accumulate
  // (one INSERT per real incident/encounter/etc. as it happens), not a
  // burst write workload this script is trying to measure.
  for (let i = 0; i < count; i += 1) await insertPendingIntent(db, i);
}

function buildWorker(db) {
  const syncIntents = new SyncIntentRepository(db);
  return {
    syncIntents,
    worker: new SyncWorker({
      syncIntents,
      vtiger: {
        createIncident: async () => {
          if (simulatedLatencyMs > 0) await new Promise((resolve) => setTimeout(resolve, simulatedLatencyMs));
          return { ok: true };
        }
      },
      openemr: {},
      expo: {},
      onSuccess: async (intent) => syncIntents.markSucceeded(intent.intent_id, new Date().toISOString())
    })
  };
}

async function run() {
  if (!connectionString) {
    throw new Error("VEMS_POSTGRES_URL or DATABASE_URL is required -- this baseline is meaningless against SQLite's single-connection lock.");
  }
  if (intentCount <= 0 || workerCount <= 0) {
    throw new Error("LOAD_TEST_SYNC_INTENTS and LOAD_TEST_SYNC_WORKERS must be positive integers");
  }

  const seedDb = createDbClient({ driver: "postgres", connectionString });
  await seedDb.execute("SELECT 1;"); // wait for migration bootstrap
  const baselineRow = await seedDb.queryOne("SELECT COALESCE(MAX(intent_id), 0) AS max_id FROM sync_intents;");
  const baselineMaxId = Number(baselineRow.max_id);

  await seed(seedDb, intentCount);

  const workers = [];
  for (let i = 0; i < workerCount; i += 1) {
    const db = createDbClient({ driver: "postgres", connectionString });
    await db.execute("SELECT 1;");
    workers.push(buildWorker(db));
  }

  const claimedBy = [];
  for (const { syncIntents } of workers) {
    const originalClaim = syncIntents.claim.bind(syncIntents);
    syncIntents.claim = async (intentId, token, leaseMs) => {
      const ok = await originalClaim(intentId, token, leaseMs);
      if (ok) claimedBy.push(intentId);
      return ok;
    };
  }

  const startedAtMs = performance.now();
  const startedAtIso = new Date().toISOString();
  await Promise.all(workers.map(({ worker }) => worker.processPending(intentCount + workerCount)));
  const finishedAtMs = performance.now();
  const finishedAtIso = new Date().toISOString();

  const durationMs = finishedAtMs - startedAtMs;
  const throughputPerSec = durationMs > 0 ? (intentCount / durationMs) * 1000 : 0;

  const claimCounts = claimedBy.reduce((acc, intentId) => {
    acc[intentId] = (acc[intentId] ?? 0) + 1;
    return acc;
  }, {});
  const duplicateIntentIds = Object.entries(claimCounts).filter(([, count]) => count > 1).map(([id]) => Number(id));

  const finalRows = await seedDb.queryAll(`SELECT status, COUNT(*) AS count FROM sync_intents WHERE intent_id > ${baselineMaxId} GROUP BY status;`);
  const statusCounts = finalRows.reduce((acc, row) => {
    acc[row.status] = Number(row.count);
    return acc;
  }, {});

  const summary = {
    started_at: startedAtIso,
    finished_at: finishedAtIso,
    intent_count: intentCount,
    worker_count: workerCount,
    simulated_downstream_latency_ms: simulatedLatencyMs,
    duration_ms: toFixedNumber(durationMs),
    throughput_intents_per_sec: toFixedNumber(throughputPerSec),
    status_counts: statusCounts,
    duplicate_claims: duplicateIntentIds.length,
    duplicate_intent_ids: duplicateIntentIds.slice(0, 20)
  };

  console.log(JSON.stringify(summary, null, 2));

  if (duplicateIntentIds.length > 0) {
    console.error(`FAIL: ${duplicateIntentIds.length} intent(s) were claimed by more than one worker.`);
    process.exitCode = 1;
  } else if (statusCounts.succeeded !== intentCount) {
    console.error(`FAIL: expected ${intentCount} succeeded intents, got ${statusCounts.succeeded ?? 0}.`);
    process.exitCode = 1;
  } else {
    console.error(`OK: all ${intentCount} intents processed exactly once, 0 duplicates.`);
  }

  await seedDb.close();
  for (const { syncIntents } of workers) await syncIntents.db.close();
}

run().catch((error) => {
  console.error("sync-worker load test failed", error);
  process.exitCode = 1;
});

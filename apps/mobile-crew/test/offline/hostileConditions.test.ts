import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { migrate } from "../../src/offline/db.ts";
import { createSyncCoordinator } from "../../src/offline/syncCoordinator.ts";
import { enqueueMutation, getMutation, listMutations, markMutationStatus } from "../../src/offline/outboxStore.ts";
import { runSync } from "../../src/offline/syncEngine.ts";
import { createNodeSqliteAdapter } from "./nodeSqliteAdapter.ts";

function fakeCryptoModule() {
  return {
    randomUUID: () => randomUUID(),
    getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count))
  };
}

async function setupDb() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return db;
}

// --- App-kill mid-write ---------------------------------------------------
//
// The outbox is the only durable state a killed app has: nothing in memory
// survives a process death, only what's already committed to SQLite. A
// crew member's device dying (battery, OS kill, crash) between "we marked
// this entry sending" and "we recorded the outcome" is not a hypothetical —
// it's the exact scenario the outbox exists for. On relaunch, the sync
// engine must treat a leftover `sending` row as an interrupted attempt to
// resume, not as something already in flight (nothing really is, the
// process that sent it is gone) and not as something to ignore forever.

test("a `sending` entry left over from a killed app is picked up and retried on the next sync pass", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload: { heart_rate_bpm: 90 } },
    { cryptoModule: fakeCryptoModule() }
  );

  // Simulate the app dying right after runSync marked the entry "sending"
  // but before the network round-trip (and the resulting status update)
  // completed — no code path ever leaves a real request pending, only a
  // killed process does.
  await markMutationStatus(db, entryId, { status: "sending", attemptCount: 0 });

  const fetchImpl = (async () => new Response(JSON.stringify({ observation_event_id: "OBS-1" }), { status: 201 })) as unknown as typeof fetch;
  const result = await runSync(db, key, { authToken: "token" }, { fetchImpl });

  assert.equal(result.attempted, 1, "a relaunch must resume a stranded `sending` entry, not silently skip it forever");
  const entry = await getMutation(db, key, entryId);
  assert.equal(entry?.status, "acknowledged");
});

test("a stranded `sending` entry resumes even across a fresh SyncCoordinator instance (a real app relaunch)", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload: {} },
    { cryptoModule: fakeCryptoModule() }
  );
  await markMutationStatus(db, entryId, { status: "sending", attemptCount: 1 });

  // A brand-new coordinator, exactly as the app constructs one fresh on
  // every cold start — no in-memory state survives from before the kill.
  const fetchImpl = (async () => new Response(JSON.stringify({ observation_event_id: "OBS-2" }), { status: 201 })) as unknown as typeof fetch;
  const coordinator = createSyncCoordinator({ authToken: "token" }, { db, encryptionKey: key, fetchImpl });

  const result = await coordinator.syncNow();
  assert.equal(result.acknowledged, 1);
});

// --- Duplicate delivery ----------------------------------------------------
//
// The scenario the idempotency-key architecture exists for: the mutation
// actually reached the server and was applied (the crew's chart entry is
// real), but the app died before recording that locally, or the response
// was lost in transit. The retry must not create a second record — it must
// reuse the same idempotency key so the backend recognizes the replay.

test("retrying a stranded `sending` entry reuses its original idempotency key, never a fresh one", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload: {} },
    { cryptoModule: fakeCryptoModule() }
  );
  await markMutationStatus(db, entryId, { status: "sending", attemptCount: 0 });

  let sentKey: string | null = null;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sentKey = (init.headers as Record<string, string>)["idempotency-key"];
    // The backend's idempotency-key replay path: same key, same fingerprint,
    // returns the resource that was already created rather than a new one.
    return new Response(JSON.stringify({ observation_event_id: "OBS-1" }), { status: 200 });
  }) as unknown as typeof fetch;

  await runSync(db, key, { authToken: "token" }, { fetchImpl });
  assert.equal(sentKey, entryId, "the retry must replay with the exact key the original attempt used");
});

test("two independently-queued entries never collide on idempotency key even with identical payloads", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();
  const mutation = { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload: { note: "same" } };

  const entryIdA = await enqueueMutation(db, key, mutation, { cryptoModule });
  const entryIdB = await enqueueMutation(db, key, mutation, { cryptoModule });

  assert.notEqual(entryIdA, entryIdB);
});

// --- Out-of-order delivery ---------------------------------------------
//
// Multiple charting events can be enqueued within the same millisecond
// (a rapid double-tap, a burst of vitals) — the sync engine must still send
// them in the order they were actually recorded, per patient case, using
// insertion order as the tiebreaker rather than an unordered timestamp
// compare (see db.ts's `ORDER BY created_at, rowid` fix from milestone
// 10d, which this test exercises from the sync engine's side, not just
// listOutboxEntries's).

test("entries created in the same instant for the same case still sync in creation order", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();
  const originalNow = Date;
  const fixedIso = new Date("2026-01-01T00:00:00.000Z").toISOString();

  // Force every enqueue to record the exact same created_at, as a burst of
  // near-simultaneous writes would under real device clock resolution.
  class FrozenDate extends originalNow {
    toISOString() {
      return fixedIso;
    }
  }
  // @ts-expect-error -- test-only global Date override to freeze created_at
  globalThis.Date = FrozenDate;
  let order: string[];
  try {
    await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/first", payload: {} }, { cryptoModule });
    await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/second", payload: {} }, { cryptoModule });
    await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/third", payload: {} }, { cryptoModule });
  } finally {
    globalThis.Date = originalNow;
  }

  order = [];
  const fetchImpl = (async (url: string) => {
    order.push(url);
    return new Response(JSON.stringify({}), { status: 201 });
  }) as unknown as typeof fetch;

  await runSync(db, key, { authToken: "token" }, { fetchImpl });
  assert.deepEqual(order, ["/first", "/second", "/third"]);
});

// --- Token-expiry-mid-queue ----------------------------------------------
//
// The outbox is keyed by patient_case_id, not by session — a crew member
// signing out and back in (or their token simply expiring and being
// refreshed) must never lose queued work, and a sync pass must use
// whatever session it's given at call time, not one captured when the
// entry was queued.

test("queued entries survive a session change and sync using the new session's token", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload: {} },
    { cryptoModule: fakeCryptoModule() }
  );

  // The queue itself carries no reference to any session — re-authenticating
  // (a fresh token after sign-out/sign-in, or a routine refresh) is exactly
  // the same as constructing a new coordinator with a new session.
  let sentAuth: string | null = null;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sentAuth = (init.headers as Record<string, string>).authorization ?? null;
    return new Response(JSON.stringify({}), { status: 201 });
  }) as unknown as typeof fetch;

  const result = await runSync(db, key, { authToken: "fresh-token-after-reauth" }, { fetchImpl });
  assert.equal(result.acknowledged, 1);
  assert.match(sentAuth ?? "", /fresh-token-after-reauth/);
});

test("queued entries are unaffected by which patient case's session originally queued them — sync is global, not per-session", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();
  await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/a", payload: {} }, { cryptoModule });
  await enqueueMutation(db, key, { scope: "medication", patientCaseId: "case-2", method: "POST", path: "/b", payload: {} }, { cryptoModule });

  const fetchImpl = (async () => new Response(JSON.stringify({}), { status: 201 })) as unknown as typeof fetch;
  const result = await runSync(db, key, { authToken: "any-current-token" }, { fetchImpl });

  assert.equal(result.attempted, 2);
  assert.equal(result.acknowledged, 2);
  assert.equal((await listMutations(db, key, { status: ["acknowledged"] })).length, 2);
});

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { migrate } from "../../src/offline/db.ts";
import { enqueueMutation, getMutation, listMutations } from "../../src/offline/outboxStore.ts";
import { backoffMs, isEntryDueForRetry, runSync, MAX_SYNC_ATTEMPTS } from "../../src/offline/syncEngine.ts";
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

async function seedEntry(db: Awaited<ReturnType<typeof setupDb>>, key: Uint8Array) {
  return enqueueMutation(
    db,
    key,
    {
      scope: "observation",
      patientCaseId: "case-1",
      method: "POST",
      path: "https://api.example.test/api/patient-cases/case-1/observations",
      payload: { vital_signs: { heart_rate_bpm: 88 } }
    },
    { cryptoModule: fakeCryptoModule() }
  );
}

test("runSync sends a queued entry and marks it acknowledged with the server's resource id", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await seedEntry(db, key);

  const fetchImpl = (async () =>
    new Response(JSON.stringify({ observation_event_id: "OBS-500" }), { status: 201 })) as unknown as typeof fetch;

  const result = await runSync(db, key, { authToken: "token" }, { fetchImpl });

  assert.deepEqual(result, { attempted: 1, acknowledged: 1, retrying: 0, failed: 0, conflicted: 0 });
  const entry = await getMutation(db, key, entryId);
  assert.equal(entry?.status, "acknowledged");
  assert.equal(entry?.serverResourceId, "OBS-500");
});

test("runSync sends the entry's own idempotency key, not a fresh one", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await seedEntry(db, key);

  let sentKey: string | null = null;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sentKey = (init.headers as Record<string, string>)["idempotency-key"];
    return new Response(JSON.stringify({ observation_event_id: "OBS-500" }), { status: 201 });
  }) as unknown as typeof fetch;

  await runSync(db, key, { authToken: "token" }, { fetchImpl });
  assert.equal(sentKey, entryId);
});

test("runSync moves a connectivity failure to retrying and increments attempt_count", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await seedEntry(db, key);

  const fetchImpl = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;

  const result = await runSync(db, key, { authToken: "token" }, { fetchImpl });

  assert.deepEqual(result, { attempted: 1, acknowledged: 0, retrying: 1, failed: 0, conflicted: 0 });
  const entry = await getMutation(db, key, entryId);
  assert.equal(entry?.status, "retrying");
  assert.equal(entry?.attemptCount, 1);
  assert.match(entry?.lastError ?? "", /Network request failed/);
});

test("runSync gives up after MAX_SYNC_ATTEMPTS connectivity failures", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await seedEntry(db, key);

  const fetchImpl = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;

  const BASE_BACKOFF_STEP = 10 * 60_000; // always past backoff, so every call is due
  let clock = 0;
  const now = () => (clock += BASE_BACKOFF_STEP);

  for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
    await runSync(db, key, { authToken: "token" }, { fetchImpl, now });
  }

  const entry = await getMutation(db, key, entryId);
  assert.equal(entry?.status, "failed");
  assert.equal(entry?.attemptCount, MAX_SYNC_ATTEMPTS);

  // A failed entry is terminal — a further sync pass does not touch it.
  const before = await getMutation(db, key, entryId);
  await runSync(db, key, { authToken: "token" }, { fetchImpl, now });
  const after = await getMutation(db, key, entryId);
  assert.deepEqual(after, before);
});

test("runSync marks a definite rejection (validation error) as failed on the first attempt, not retrying", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await seedEntry(db, key);

  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "vital_signs is required", code: "INVALID_PAYLOAD" } }), { status: 400 })) as unknown as typeof fetch;

  const result = await runSync(db, key, { authToken: "token" }, { fetchImpl });

  assert.deepEqual(result, { attempted: 1, acknowledged: 0, retrying: 0, failed: 1, conflicted: 0 });
  const entry = await getMutation(db, key, entryId);
  assert.equal(entry?.status, "failed");
  assert.equal(entry?.attemptCount, 1);
});

test("runSync marks a 409 as conflict, distinct from a generic failure", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await seedEntry(db, key);

  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "Idempotency key was reused with a different request" } }), { status: 409 })) as unknown as typeof fetch;

  const result = await runSync(db, key, { authToken: "token" }, { fetchImpl });

  assert.deepEqual(result, { attempted: 1, acknowledged: 0, retrying: 0, failed: 0, conflicted: 1 });
  const entry = await getMutation(db, key, entryId);
  assert.equal(entry?.status, "conflict");
});

test("runSync skips a retrying entry that is still within its backoff window", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  await seedEntry(db, key);

  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;

  const fixedNow = 1_000_000;
  await runSync(db, key, { authToken: "token" }, { fetchImpl, now: () => fixedNow });
  assert.equal(calls, 1);

  // Immediately re-running before any backoff has elapsed should not re-attempt.
  const result = await runSync(db, key, { authToken: "token" }, { fetchImpl, now: () => fixedNow + 1 });
  assert.deepEqual(result, { attempted: 0, acknowledged: 0, retrying: 0, failed: 0, conflicted: 0 });
  assert.equal(calls, 1);
});

test("runSync processes entries in (patient_case_id, created_at) order", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();

  await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-2", method: "POST", path: "/b", payload: {} }, { cryptoModule });
  await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/a2", payload: {} }, { cryptoModule });
  await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/a1", payload: {} }, { cryptoModule });

  const order: string[] = [];
  const fetchImpl = (async (url: string) => {
    order.push(url);
    return new Response(JSON.stringify({}), { status: 201 });
  }) as unknown as typeof fetch;

  await runSync(db, key, { authToken: "token" }, { fetchImpl });
  assert.deepEqual(order, ["/a2", "/a1", "/b"]);
});

test("isEntryDueForRetry: queued is always due; retrying respects exponential backoff", () => {
  assert.equal(isEntryDueForRetry({ status: "queued", attemptCount: 0, lastAttemptedAt: null }, Date.now()), true);
  assert.equal(isEntryDueForRetry({ status: "acknowledged", attemptCount: 0, lastAttemptedAt: null }, Date.now()), false);
  assert.equal(isEntryDueForRetry({ status: "failed", attemptCount: 6, lastAttemptedAt: new Date().toISOString() }, Date.now()), false);

  const now = 1_000_000;
  const entry = { status: "retrying" as const, attemptCount: 2, lastAttemptedAt: new Date(now - backoffMs(2) + 1).toISOString() };
  assert.equal(isEntryDueForRetry(entry, now), false);
  assert.equal(isEntryDueForRetry(entry, now + 2), true);
});

test("no due entries means an empty, no-op sync pass", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const fetchImpl = (async () => {
    throw new Error("should not be called");
  }) as unknown as typeof fetch;

  const result = await runSync(db, key, { authToken: "token" }, { fetchImpl });
  assert.deepEqual(result, { attempted: 0, acknowledged: 0, retrying: 0, failed: 0, conflicted: 0 });
  assert.equal((await listMutations(db, key)).length, 0);
});

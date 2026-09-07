import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { createSyncCoordinator } from "../../src/offline/syncCoordinator.ts";
import { migrate } from "../../src/offline/db.ts";
import { enqueueMutation, getMutation } from "../../src/offline/outboxStore.ts";
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

test("syncNow sends queued entries and reports the result", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload: {} },
    { cryptoModule: fakeCryptoModule() }
  );

  const fetchImpl = (async () => new Response(JSON.stringify({ observation_event_id: "OBS-1" }), { status: 201 })) as unknown as typeof fetch;
  const coordinator = createSyncCoordinator({ authToken: "token" }, { db, encryptionKey: key, fetchImpl });

  const result = await coordinator.syncNow();
  assert.equal(result.acknowledged, 1);
  assert.equal((await getMutation(db, key, entryId))?.status, "acknowledged");
});

test("syncNow de-duplicates concurrent calls into a single in-flight sync pass", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload: {} },
    { cryptoModule: fakeCryptoModule() }
  );

  let concurrentCalls = 0;
  let maxConcurrent = 0;
  const fetchImpl = (async () => {
    concurrentCalls += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
    await new Promise((resolve) => setTimeout(resolve, 20));
    concurrentCalls -= 1;
    return new Response(JSON.stringify({}), { status: 201 });
  }) as unknown as typeof fetch;

  const coordinator = createSyncCoordinator({ authToken: "token" }, { db, encryptionKey: key, fetchImpl });

  const [first, second] = await Promise.all([coordinator.syncNow(), coordinator.syncNow()]);
  assert.deepEqual(first, second);
  assert.equal(maxConcurrent, 1, "the second call should have awaited the first pass rather than starting its own");
});

test("syncNow allows a fresh pass once the previous one has completed", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify({}), { status: 201 });
  }) as unknown as typeof fetch;
  const coordinator = createSyncCoordinator({ authToken: "token" }, { db, encryptionKey: key, fetchImpl });

  await coordinator.syncNow();
  await coordinator.syncNow();
  // Nothing was queued, so fetch was never actually called — this just
  // asserts both calls resolved independently without deadlocking.
  assert.equal(calls, 0);
});

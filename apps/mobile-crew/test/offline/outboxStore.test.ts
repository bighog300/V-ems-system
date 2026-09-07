import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { migrate } from "../../src/offline/db.ts";
import { enqueueMutation, getMutation, listMutations, markMutationStatus } from "../../src/offline/outboxStore.ts";
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

test("enqueueMutation returns an entryId usable as the idempotency key, and getMutation decrypts the payload back", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const payload = { recorded_at: "2026-09-07T10:00:00.000Z", vital_signs: { heart_rate_bpm: 88 } };

  const entryId = await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/api/patient-cases/case-1/observations", payload },
    { cryptoModule: fakeCryptoModule() }
  );

  assert.match(entryId, /^[0-9a-f-]{36}$/);
  const entry = await getMutation(db, key, entryId);
  assert.equal(entry?.status, "queued");
  assert.equal(entry?.scope, "observation");
  assert.equal(entry?.patientCaseId, "case-1");
  assert.deepEqual(entry?.payload, payload);
});

test("getMutation returns null for an unknown entryId", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  assert.equal(await getMutation(db, key, "missing"), null);
});

test("listMutations decrypts every matching entry", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();
  await enqueueMutation(db, key, { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/x", payload: { a: 1 } }, { cryptoModule });
  await enqueueMutation(db, key, { scope: "assessment", patientCaseId: "case-1", method: "POST", path: "/y", payload: { b: 2 } }, { cryptoModule });

  const entries = await listMutations(db, key, { patientCaseId: "case-1" });
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => entry.payload).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    [{ a: 1 }, { b: 2 }]
  );
});

test("markMutationStatus updates status without needing the encryption key", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const entryId = await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/x", payload: { a: 1 } },
    { cryptoModule: fakeCryptoModule() }
  );

  await markMutationStatus(db, entryId, { status: "sending", attemptCount: 1 });
  const sending = await getMutation(db, key, entryId);
  assert.equal(sending?.status, "sending");
  assert.equal(sending?.attemptCount, 1);

  await markMutationStatus(db, entryId, { status: "acknowledged", serverResourceId: "OBS-500" });
  const acknowledged = await getMutation(db, key, entryId);
  assert.equal(acknowledged?.status, "acknowledged");
  assert.equal(acknowledged?.serverResourceId, "OBS-500");
});

test("a payload encrypted under one device key cannot be decrypted with another", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const otherKey = new Uint8Array(randomBytes(32));
  const entryId = await enqueueMutation(
    db,
    key,
    { scope: "observation", patientCaseId: "case-1", method: "POST", path: "/x", payload: { a: 1 } },
    { cryptoModule: fakeCryptoModule() }
  );
  await assert.rejects(async () => getMutation(db, otherKey, entryId));
});

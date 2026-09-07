import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getCachedReadRow,
  getOutboxEntry,
  insertOutboxEntry,
  listOutboxEntries,
  migrate,
  setCachedReadRow,
  updateOutboxEntry
} from "../../src/offline/db.ts";
import { createNodeSqliteAdapter } from "./nodeSqliteAdapter.ts";

async function setupDb() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return db;
}

test("insertOutboxEntry then getOutboxEntry round-trips a queued entry", async () => {
  const db = await setupDb();
  await insertOutboxEntry(db, {
    entryId: "entry-1",
    scope: "observation",
    patientCaseId: "case-1",
    method: "POST",
    path: "/api/patient-cases/case-1/observations",
    encryptedPayload: "nonce:ciphertext",
    createdAt: "2026-09-07T10:00:00.000Z"
  });
  const row = await getOutboxEntry(db, "entry-1");
  assert.equal(row?.status, "queued");
  assert.equal(row?.attempt_count, 0);
  assert.equal(row?.scope, "observation");
});

test("getOutboxEntry returns null for an unknown entry", async () => {
  const db = await setupDb();
  assert.equal(await getOutboxEntry(db, "missing"), null);
});

test("listOutboxEntries filters by status and patient case, ordered by creation", async () => {
  const db = await setupDb();
  await insertOutboxEntry(db, { entryId: "b", scope: "observation", patientCaseId: "case-1", method: "POST", path: "/x", encryptedPayload: "p", createdAt: "2026-09-07T10:01:00.000Z" });
  await insertOutboxEntry(db, { entryId: "a", scope: "observation", patientCaseId: "case-1", method: "POST", path: "/x", encryptedPayload: "p", createdAt: "2026-09-07T10:00:00.000Z" });
  await insertOutboxEntry(db, { entryId: "c", scope: "assessment", patientCaseId: "case-2", method: "POST", path: "/y", encryptedPayload: "p", createdAt: "2026-09-07T10:02:00.000Z" });
  await updateOutboxEntry(db, "c", { status: "failed" });

  const forCase1 = await listOutboxEntries(db, { patientCaseId: "case-1" });
  assert.deepEqual(forCase1.map((row) => row.entry_id), ["a", "b"]);

  const failed = await listOutboxEntries(db, { status: ["failed"] });
  assert.deepEqual(failed.map((row) => row.entry_id), ["c"]);

  const queued = await listOutboxEntries(db, { status: ["queued", "retrying"] });
  assert.deepEqual(queued.map((row) => row.entry_id).sort(), ["a", "b"]);
});

test("updateOutboxEntry patches only the given columns", async () => {
  const db = await setupDb();
  await insertOutboxEntry(db, { entryId: "entry-1", scope: "observation", patientCaseId: "case-1", method: "POST", path: "/x", encryptedPayload: "p", createdAt: "2026-09-07T10:00:00.000Z" });
  await updateOutboxEntry(db, "entry-1", { status: "retrying", attemptCount: 2, lastError: "network timeout" });
  const row = await getOutboxEntry(db, "entry-1");
  assert.equal(row?.status, "retrying");
  assert.equal(row?.attempt_count, 2);
  assert.equal(row?.last_error, "network timeout");
  assert.equal(row?.encrypted_payload, "p");

  await updateOutboxEntry(db, "entry-1", { status: "acknowledged", serverResourceId: "OBS-100" });
  const acknowledged = await getOutboxEntry(db, "entry-1");
  assert.equal(acknowledged?.status, "acknowledged");
  assert.equal(acknowledged?.server_resource_id, "OBS-100");
  assert.equal(acknowledged?.last_error, "network timeout", "prior fields not touched by this patch are preserved");
});

test("setCachedReadRow then getCachedReadRow round-trips, and upserts on repeated writes", async () => {
  const db = await setupDb();
  await setCachedReadRow(db, "/api/assignments/mine", "nonce:v1", "2026-09-07T10:00:00.000Z");
  assert.equal((await getCachedReadRow(db, "/api/assignments/mine"))?.encrypted_payload, "nonce:v1");

  await setCachedReadRow(db, "/api/assignments/mine", "nonce:v2", "2026-09-07T10:05:00.000Z");
  const updated = await getCachedReadRow(db, "/api/assignments/mine");
  assert.equal(updated?.encrypted_payload, "nonce:v2");
  assert.equal(updated?.cached_at, "2026-09-07T10:05:00.000Z");
});

test("getCachedReadRow returns null for an unknown key", async () => {
  const db = await setupDb();
  assert.equal(await getCachedReadRow(db, "/unknown"), null);
});

test("migrate is safe to run more than once", async () => {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  await migrate(db);
  await insertOutboxEntry(db, { entryId: "entry-1", scope: "observation", patientCaseId: "case-1", method: "POST", path: "/x", encryptedPayload: "p", createdAt: "2026-09-07T10:00:00.000Z" });
  assert.equal((await getOutboxEntry(db, "entry-1"))?.entry_id, "entry-1");
});

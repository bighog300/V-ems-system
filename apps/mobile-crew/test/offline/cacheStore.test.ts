import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { migrate } from "../../src/offline/db.ts";
import { cacheRead, readCache } from "../../src/offline/cacheStore.ts";
import { createNodeSqliteAdapter } from "./nodeSqliteAdapter.ts";

function fakeCryptoModule() {
  return { getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count)) };
}

async function setupDb() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return db;
}

test("cacheRead then readCache round-trips a cached GET response", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const jobs = [{ assignment_id: "assignment-1", status: "en_route" }];

  await cacheRead(db, key, "/api/assignments/mine", jobs, { cryptoModule: fakeCryptoModule() });
  const cached = await readCache(db, key, "/api/assignments/mine");

  assert.deepEqual(cached?.value, jobs);
  assert.equal(typeof cached?.cachedAt, "string");
});

test("readCache returns null for a key that was never cached", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  assert.equal(await readCache(db, key, "/never-cached"), null);
});

test("cacheRead overwrites a previous entry for the same key", async () => {
  const db = await setupDb();
  const key = new Uint8Array(randomBytes(32));
  const cryptoModule = fakeCryptoModule();

  await cacheRead(db, key, "/api/patient-cases/case-1", { status: "draft" }, { cryptoModule });
  await cacheRead(db, key, "/api/patient-cases/case-1", { status: "submitted" }, { cryptoModule });

  const cached = await readCache<{ status: string }>(db, key, "/api/patient-cases/case-1");
  assert.equal(cached?.value.status, "submitted");
});

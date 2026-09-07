import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { ApiError, UnauthorizedError } from "../../src/api/apiError.ts";
import { withCache } from "../../src/api/cachedRequest.ts";
import { migrate } from "../../src/offline/db.ts";
import { createNodeSqliteAdapter } from "../offline/nodeSqliteAdapter.ts";

function fakeCryptoModule() {
  return { getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count)) };
}

async function setupDeps() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return { db, encryptionKey: new Uint8Array(randomBytes(32)), cryptoModule: fakeCryptoModule() };
}

test("withCache returns fresh data uncached on a successful fetch", async () => {
  const deps = await setupDeps();
  const result = await withCache("assignments:mine", async () => [{ assignment_id: "assignment-1" }], deps);

  assert.deepEqual(result.value, [{ assignment_id: "assignment-1" }]);
  assert.equal(result.cached, false);
  assert.equal(typeof result.cachedAt, "string");
});

test("withCache caches a successful fetch so a later connectivity failure can fall back to it", async () => {
  const deps = await setupDeps();
  await withCache("patient-case:case-1", async () => ({ patient_case_id: "case-1", status: "active" }), deps);

  const result = await withCache(
    "patient-case:case-1",
    async () => {
      throw new TypeError("Network request failed");
    },
    deps
  );

  assert.deepEqual(result.value, { patient_case_id: "case-1", status: "active" });
  assert.equal(result.cached, true);
  assert.equal(typeof result.cachedAt, "string");
});

test("withCache rethrows a connectivity failure when nothing is cached yet", async () => {
  const deps = await setupDeps();

  await assert.rejects(
    () =>
      withCache(
        "patient-case:never-fetched",
        async () => {
          throw new TypeError("Network request failed");
        },
        deps
      ),
    /Network request failed/
  );
});

test("withCache rethrows a non-connectivity failure without consulting the cache", async () => {
  const deps = await setupDeps();
  await withCache("patient-case:case-1", async () => ({ patient_case_id: "case-1", status: "active" }), deps);

  await assert.rejects(
    () =>
      withCache(
        "patient-case:case-1",
        async () => {
          throw new UnauthorizedError("token expired");
        },
        deps
      ),
    UnauthorizedError
  );
});

test("withCache rethrows a rejected/validation-style ApiError without consulting the cache", async () => {
  const deps = await setupDeps();
  await withCache("patient-case:case-1", async () => ({ patient_case_id: "case-1", status: "active" }), deps);

  await assert.rejects(
    () =>
      withCache(
        "patient-case:case-1",
        async () => {
          throw new ApiError("bad input", { status: 400, code: "INVALID_PAYLOAD" });
        },
        deps
      ),
    ApiError
  );
});

test("withCache overwrites the cached value on each successful fetch", async () => {
  const deps = await setupDeps();
  await withCache("patient-case:case-1", async () => ({ status: "draft" }), deps);
  await withCache("patient-case:case-1", async () => ({ status: "submitted" }), deps);

  const result = await withCache(
    "patient-case:case-1",
    async () => {
      throw new TypeError("Network request failed");
    },
    deps
  );

  assert.deepEqual(result.value, { status: "submitted" });
});

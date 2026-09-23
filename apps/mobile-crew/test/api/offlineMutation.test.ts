import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { ApiError, ForbiddenError, UnauthorizedError } from "../../src/api/apiError.ts";
import { isQueueableFailure, requestOrQueue } from "../../src/api/offlineMutation.ts";
import { migrate } from "../../src/offline/db.ts";
import { listMutations } from "../../src/offline/outboxStore.ts";
import { createNodeSqliteAdapter } from "../offline/nodeSqliteAdapter.ts";

function fakeCryptoModule() {
  return {
    randomUUID: () => randomUUID(),
    getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count))
  };
}

async function setupDeps() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return { db, encryptionKey: new Uint8Array(randomBytes(32)), cryptoModule: fakeCryptoModule() };
}

test("requestOrQueue returns the server response and does not touch the outbox on success", async () => {
  const deps = await setupDeps();
  const fetchImpl = (async () => new Response(JSON.stringify({ assessment_id: "ASM-1" }), { status: 201 })) as unknown as typeof fetch;

  const result = await requestOrQueue(
    {
      fetchImpl,
      url: "https://api.example.test/api/patient-cases/case-1/assessments",
      method: "POST",
      payload: { section_type: "primary_survey" },
      config: { authToken: "token" },
      scope: "assessment",
      patientCaseId: "case-1",
      buildOptimisticResult: () => {
        throw new Error("should not build an optimistic result on success");
      }
    },
    deps
  );

  assert.deepEqual(result, { assessment_id: "ASM-1" });
  assert.equal((await listMutations(deps.db, deps.encryptionKey)).length, 0);
});

test("requestOrQueue enqueues and returns the optimistic result on a network failure", async () => {
  const deps = await setupDeps();
  const fetchImpl = (async () => {
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;

  const result = await requestOrQueue(
    {
      fetchImpl,
      url: "https://api.example.test/api/patient-cases/case-1/assessments",
      method: "POST",
      payload: { section_type: "primary_survey" },
      config: { authToken: "token" },
      scope: "assessment",
      patientCaseId: "case-1",
      buildOptimisticResult: (entryId) => ({ assessment_id: `LOCAL-${entryId}`, section_type: "primary_survey" })
    },
    deps
  );

  assert.match((result as { assessment_id: string }).assessment_id, /^LOCAL-/);

  const queued = await listMutations(deps.db, deps.encryptionKey, { patientCaseId: "case-1" });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].scope, "assessment");
  assert.deepEqual(queued[0].payload, { section_type: "primary_survey" });
  assert.equal(queued[0].status, "queued");
});

test("requestOrQueue reuses the same idempotency key for the live attempt and the queued entry", async () => {
  const deps = await setupDeps();
  let sentIdempotencyKey: string | null = null;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sentIdempotencyKey = (init.headers as Record<string, string>)["idempotency-key"];
    throw new TypeError("Network request failed");
  }) as unknown as typeof fetch;

  await requestOrQueue(
    {
      fetchImpl,
      url: "https://api.example.test/api/patient-cases/case-1/assessments",
      method: "POST",
      payload: {},
      config: { authToken: "token" },
      scope: "assessment",
      patientCaseId: "case-1",
      buildOptimisticResult: (entryId) => ({ entryId })
    },
    deps
  );

  const queued = await listMutations(deps.db, deps.encryptionKey, { patientCaseId: "case-1" });
  assert.equal(queued[0].entryId, sentIdempotencyKey);
});

test("requestOrQueue enqueues on a timeout (REQUEST_ABORTED)", async () => {
  const deps = await setupDeps();
  const fetchImpl = (async () => {
    throw new ApiError("Request timed out or was canceled.", { code: "REQUEST_ABORTED", retryable: true });
  }) as unknown as typeof fetch;

  const result = await requestOrQueue(
    {
      fetchImpl,
      url: "https://api.example.test/api/patient-cases/case-1/observations",
      method: "POST",
      payload: { vital_signs: { heart_rate_bpm: 88 } },
      config: { authToken: "token" },
      scope: "observation",
      patientCaseId: "case-1",
      buildOptimisticResult: (entryId) => ({ observation_event_id: `LOCAL-${entryId}` })
    },
    deps
  );

  assert.match((result as { observation_event_id: string }).observation_event_id, /^LOCAL-/);
  assert.equal((await listMutations(deps.db, deps.encryptionKey)).length, 1);
});

test("requestOrQueue enqueues on a backend error explicitly marked retryable", async () => {
  const deps = await setupDeps();
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "downstream unavailable", retryable: true } }), { status: 502 })) as unknown as typeof fetch;

  const result = await requestOrQueue(
    {
      fetchImpl,
      url: "https://api.example.test/api/patient-cases/case-1/observations",
      method: "POST",
      payload: {},
      config: { authToken: "token" },
      scope: "observation",
      patientCaseId: "case-1",
      buildOptimisticResult: (entryId) => ({ observation_event_id: `LOCAL-${entryId}` })
    },
    deps
  );

  assert.match((result as { observation_event_id: string }).observation_event_id, /^LOCAL-/);
});

test("requestOrQueue rethrows a validation error without touching the outbox", async () => {
  const deps = await setupDeps();
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: { message: "section_type is required", code: "INVALID_PAYLOAD" } }), { status: 400 })) as unknown as typeof fetch;

  await assert.rejects(
    () =>
      requestOrQueue(
        {
          fetchImpl,
          url: "https://api.example.test/api/patient-cases/case-1/assessments",
          method: "POST",
          payload: {},
          config: { authToken: "token" },
          scope: "assessment",
          patientCaseId: "case-1",
          buildOptimisticResult: () => {
            throw new Error("should not queue a validation error");
          }
        },
        deps
      ),
    /section_type is required/
  );

  assert.equal((await listMutations(deps.db, deps.encryptionKey)).length, 0);
});

test("requestOrQueue rethrows a 401 without touching the outbox", async () => {
  const deps = await setupDeps();
  const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: "token expired" } }), { status: 401 })) as unknown as typeof fetch;

  await assert.rejects(
    () =>
      requestOrQueue(
        {
          fetchImpl,
          url: "https://api.example.test/api/patient-cases/case-1/assessments",
          method: "POST",
          payload: {},
          config: { authToken: "token" },
          scope: "assessment",
          patientCaseId: "case-1",
          buildOptimisticResult: () => {
            throw new Error("should not queue an auth failure");
          }
        },
        deps
      ),
    UnauthorizedError
  );

  assert.equal((await listMutations(deps.db, deps.encryptionKey)).length, 0);
});

test("isQueueableFailure classifies raw network errors, timeouts and retryable backend errors as queueable", () => {
  assert.equal(isQueueableFailure(new TypeError("Network request failed")), true);
  assert.equal(isQueueableFailure(new ApiError("timeout", { code: "REQUEST_ABORTED" })), true);
  assert.equal(isQueueableFailure(new ApiError("downstream unavailable", { retryable: true, status: 502 })), true);
});

test("isQueueableFailure classifies validation, conflict and auth errors as not queueable", () => {
  assert.equal(isQueueableFailure(new ApiError("bad input", { status: 400, code: "INVALID_PAYLOAD" })), false);
  assert.equal(isQueueableFailure(new ApiError("conflict", { status: 409, code: "CONFLICT" })), false);
  assert.equal(isQueueableFailure(new UnauthorizedError("token expired")), false);
  assert.equal(isQueueableFailure(new ForbiddenError("not allowed")), false);
});

test("requestOrQueue gives up on a server that does not answer after the live-attempt timeout and queues instead", async () => {
  const deps = await setupDeps();
  // Never answers; only ends when the request is aborted, like a connection to an unreachable host.
  const fetchImpl = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  })) as unknown as typeof fetch;

  const started = Date.now();
  const result = await requestOrQueue(
    {
      fetchImpl,
      url: "https://api.example.test/api/patient-cases/case-1/observations",
      method: "POST",
      payload: { vital_signs: { heart_rate_bpm: 80 } },
      config: { authToken: "token" },
      timeoutMs: 40,
      scope: "observation",
      patientCaseId: "case-1",
      buildOptimisticResult: (entryId) => ({ id: `LOCAL-${entryId}` })
    },
    deps
  );

  assert.match((result as { id: string }).id, /^LOCAL-/);
  assert.ok(Date.now() - started < 2_000, "queued promptly instead of waiting out the default timeout");
  const queued = await listMutations(deps.db, deps.encryptionKey);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].entryId, (result as { id: string }).id.replace("LOCAL-", ""), "the queued entry carries the idempotency key the live attempt used");
});

test("the default live-attempt timeout is short enough to feel instant offline, and still longer than a normal round trip", async () => {
  const { LIVE_ATTEMPT_TIMEOUT_MS } = await import("../../src/api/offlineMutation.ts");
  assert.ok(LIVE_ATTEMPT_TIMEOUT_MS >= 2_000 && LIVE_ATTEMPT_TIMEOUT_MS <= 6_000);
});

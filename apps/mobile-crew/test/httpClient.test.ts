import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, ForbiddenError, UnauthorizedError } from "../src/api/apiError.ts";
import { buildRequestHeaders, requestJson } from "../src/api/httpClient.ts";
import { onSessionRejected, type SessionRejection } from "../src/auth/sessionEvents.ts";

test("buildRequestHeaders rejects a missing token", () => {
  assert.throws(() => buildRequestHeaders({}), UnauthorizedError);
});

test("buildRequestHeaders sets a bearer authorization header", () => {
  const headers = buildRequestHeaders({ authToken: "abc123" });
  assert.equal(headers.authorization, "Bearer abc123");
  assert.equal(headers["content-type"], "application/json");
});

test("buildRequestHeaders attaches x-device-id when a deviceId is configured", () => {
  const headers = buildRequestHeaders({ authToken: "abc123", deviceId: "device-1" });
  assert.equal(headers["x-device-id"], "device-1");
});

test("buildRequestHeaders omits x-device-id when no deviceId is configured", () => {
  const headers = buildRequestHeaders({ authToken: "abc123" });
  assert.equal("x-device-id" in headers, false);
});

test("requestJson resolves parsed JSON on success", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await requestJson(fetchImpl as typeof fetch, "https://example.test/api/support/readiness", {
    config: { authToken: "token" }
  });

  assert.equal(result.notFound, false);
  assert.deepEqual(result.data, { status: "ok" });
});

test("requestJson reports not found on 404 without throwing", async () => {
  const fetchImpl = async () => new Response(null, { status: 404 });

  const result = await requestJson(fetchImpl as typeof fetch, "https://example.test/api/incidents/INC-000001", {
    config: { authToken: "token" }
  });

  assert.equal(result.notFound, true);
  assert.equal(result.data, null);
});

test("requestJson raises UnauthorizedError on 401", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "bad token", code: "UNAUTHENTICATED" } }), { status: 401 });

  await assert.rejects(
    () => requestJson(fetchImpl as typeof fetch, "https://example.test/api/support/readiness", { config: { authToken: "token" } }),
    UnauthorizedError
  );
});

test("requestJson raises ForbiddenError on 403", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "not allowed", code: "FORBIDDEN" } }), { status: 403 });

  await assert.rejects(
    () => requestJson(fetchImpl as typeof fetch, "https://example.test/api/support/readiness", { config: { authToken: "token" } }),
    ForbiddenError
  );
});

test("requestJson raises a generic ApiError on other failures", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 });

  await assert.rejects(
    () => requestJson(fetchImpl as typeof fetch, "https://example.test/api/support/readiness", { config: { authToken: "token" } }),
    ApiError
  );
});

async function rejectionsFor(status: number, code?: string): Promise<SessionRejection[]> {
  const seen: SessionRejection[] = [];
  const off = onSessionRejected((r) => seen.push(r));
  const fetchImpl = (async () => new Response(JSON.stringify({ error: { code, message: "x" } }), { status })) as unknown as typeof fetch;
  await requestJson(fetchImpl, "https://api.example.test/x", { config: { authToken: "t" } }).catch(() => {});
  off();
  return seen;
}

test("requestJson reports a revoked session, and a session the server no longer accepts, exactly once each", async () => {
  assert.deepEqual(await rejectionsFor(401, "SESSION_REVOKED"), ["revoked"]);
  assert.deepEqual(await rejectionsFor(401, "UNAUTHENTICATED"), ["invalid"]);
});

test("requestJson does not report other failures as a rejected session", async () => {
  assert.deepEqual(await rejectionsFor(403, "FORBIDDEN"), []);
  assert.deepEqual(await rejectionsFor(401, "SOMETHING_ELSE"), []);
  assert.deepEqual(await rejectionsFor(500, "SESSION_REVOKED"), []);
  assert.deepEqual(await rejectionsFor(503), []);
});

test("a failing listener cannot break the request that reported the rejection", async () => {
  const off = onSessionRejected(() => { throw new Error("listener bug"); });
  const seen: SessionRejection[] = []; const off2 = onSessionRejected((r) => seen.push(r));
  const fetchImpl = (async () => new Response(JSON.stringify({ error: { code: "SESSION_REVOKED" } }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(() => requestJson(fetchImpl, "https://api.example.test/x", { config: { authToken: "t" } }), UnauthorizedError);
  off(); off2();
  assert.deepEqual(seen, ["revoked"]);
});

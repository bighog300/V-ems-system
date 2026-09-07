import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, ForbiddenError, UnauthorizedError } from "../src/api/apiError.ts";
import { buildRequestHeaders, requestJson } from "../src/api/httpClient.ts";

test("buildRequestHeaders rejects a missing token", () => {
  assert.throws(() => buildRequestHeaders({}), UnauthorizedError);
});

test("buildRequestHeaders sets a bearer authorization header", () => {
  const headers = buildRequestHeaders({ authToken: "abc123" });
  assert.equal(headers.authorization, "Bearer abc123");
  assert.equal(headers["content-type"], "application/json");
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

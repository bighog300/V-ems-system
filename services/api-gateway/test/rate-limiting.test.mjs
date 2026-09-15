import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac } from "node:crypto";
import { createRateLimiter } from "../src/rate-limiter.mjs";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

// --- createRateLimiter unit tests -----------------------------------------

test("createRateLimiter allows up to maxRequests within the window, then denies", () => {
  const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 3 });
  const now = 1_000_000;

  assert.equal(limiter.check("actor-1", now).allowed, true);
  assert.equal(limiter.check("actor-1", now + 1).allowed, true);
  const third = limiter.check("actor-1", now + 2);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  const fourth = limiter.check("actor-1", now + 3);
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.ok(fourth.retryAfterMs > 0);
});

test("createRateLimiter tracks each key independently", () => {
  const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
  const now = 1_000_000;

  assert.equal(limiter.check("actor-a", now).allowed, true);
  assert.equal(limiter.check("actor-a", now).allowed, false);
  // A different key has its own, untouched budget.
  assert.equal(limiter.check("actor-b", now).allowed, true);
});

test("createRateLimiter admits requests again once the window has fully elapsed", () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });
  const now = 1_000_000;

  assert.equal(limiter.check("actor-1", now).allowed, true);
  assert.equal(limiter.check("actor-1", now + 500).allowed, false);
  // Past the window from the first request.
  assert.equal(limiter.check("actor-1", now + 1001).allowed, true);
});

test("createRateLimiter reports a retryAfterMs that matches when the oldest hit ages out", () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1 });
  const now = 1_000_000;

  limiter.check("actor-1", now);
  const denied = limiter.check("actor-1", now + 300);
  assert.equal(denied.retryAfterMs, 700);
});

test("createRateLimiter drops keys with no requests left in the window (memory hygiene)", () => {
  const limiter = createRateLimiter({ windowMs: 100, maxRequests: 5 });
  const now = 1_000_000;

  limiter.check("actor-1", now);
  limiter.check("actor-2", now);
  assert.equal(limiter.size(), 2);

  // Past the window -- both actors' single hit has aged out. The internal
  // sweep runs periodically (every 500 checks) rather than on a timer, so
  // drive it with filler checks against a third key at a later timestamp;
  // that key's own hits are still within ITS window when the sweep runs,
  // so only actor-1/actor-2 should be dropped.
  const later = now + 1000;
  for (let i = 0; i < 500; i += 1) {
    limiter.check("filler", later);
  }

  assert.equal(limiter.size(), 1);
});

// --- server.mjs wiring integration tests -----------------------------------

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function signToken({ role = "dispatcher", actorId = "STAFF-TEST" } = {}) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    sub: actorId,
    role,
    iss: "vems-tests",
    aud: "vems-platform",
    exp: Math.floor(Date.now() / 1000) + 3600
  }));
  const signature = createHmac("sha256", process.env.JWT_HS256_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-rate-limit-test-"));
  return join(dir, "platform.sqlite");
}

async function startServer() {
  process.env.JWT_HS256_SECRET = "k3y-8f2a91c7-9d4b-4e11-b6a2-7c5d0e1f2a3b";
  process.env.JWT_ISSUER = "vems-tests";
  process.env.JWT_AUDIENCE = "vems-platform";
  const orchestration = new OrchestrationService({ dbPath: createDbPath() });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, orchestration, base: `http://127.0.0.1:${port}` };
}

async function jsonFetch(base, path, options = {}) {
  const rawHeaders = { ...(options.headers ?? {}) };
  const role = rawHeaders["x-user-role"] ?? "dispatcher";
  const actorId = rawHeaders["x-actor-id"] ?? "STAFF-TEST";
  delete rawHeaders["x-user-role"];
  delete rawHeaders["x-actor-id"];

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${signToken({ role, actorId })}`,
      ...rawHeaders
    }
  });

  return {
    status: response.status,
    headers: response.headers,
    body: await response.json()
  };
}

test("gateway returns 429 with a retry-after header once an actor exceeds RATE_LIMIT_MAX_REQUESTS", async () => {
  process.env.RATE_LIMIT_MAX_REQUESTS = "2";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  const { server, base } = await startServer();

  try {
    const first = await jsonFetch(base, "/api/incidents", { method: "GET" });
    const second = await jsonFetch(base, "/api/incidents", { method: "GET" });
    const third = await jsonFetch(base, "/api/incidents", { method: "GET" });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(third.body.error.code, "RATE_LIMITED");
    assert.equal(third.body.error.retryable, true);
    assert.ok(third.headers.get("retry-after"));
  } finally {
    server.close();
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  }
});

test("rate limiting is tracked per actor -- a different actor is unaffected by another's limit", async () => {
  process.env.RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  const { server, base } = await startServer();

  try {
    const first = await jsonFetch(base, "/api/incidents", { method: "GET", headers: { "x-actor-id": "STAFF-A" } });
    const throttled = await jsonFetch(base, "/api/incidents", { method: "GET", headers: { "x-actor-id": "STAFF-A" } });
    const otherActor = await jsonFetch(base, "/api/incidents", { method: "GET", headers: { "x-actor-id": "STAFF-B" } });

    assert.equal(first.status, 200);
    assert.equal(throttled.status, 429);
    assert.equal(otherActor.status, 200);
  } finally {
    server.close();
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  }
});

test("RATE_LIMIT_ENABLED=false disables throttling entirely", async () => {
  process.env.RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.RATE_LIMIT_ENABLED = "false";
  const { server, base } = await startServer();

  try {
    const first = await jsonFetch(base, "/api/incidents", { method: "GET" });
    const second = await jsonFetch(base, "/api/incidents", { method: "GET" });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  } finally {
    server.close();
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_ENABLED;
  }
});

test("rate_limit_deny_count metric increments on a throttled request and surfaces in support diagnostics", async () => {
  process.env.RATE_LIMIT_MAX_REQUESTS = "1";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  const { server, base } = await startServer();

  try {
    await jsonFetch(base, "/api/incidents", { method: "GET" });
    await jsonFetch(base, "/api/incidents", { method: "GET" }); // throttled

    // A different actor to read diagnostics with -- rate limiting is
    // per-actor, so STAFF-TEST being throttled must not also block this
    // request (metrics themselves are process-wide, so the deny still
    // shows up in the summary below regardless of which actor reads it).
    const diagnostics = await jsonFetch(base, "/api/support/diagnostics", {
      method: "GET",
      headers: { "x-actor-id": "STAFF-OPS", "x-user-role": "supervisor" }
    });
    assert.equal(diagnostics.status, 200);
    assert.equal(diagnostics.body.metrics_summary.rate_limit_deny_count, 1);
    assert.equal(diagnostics.body.readiness_summary.diagnostics.rate_limiting.enabled, true);
    assert.equal(diagnostics.body.readiness_summary.diagnostics.rate_limiting.max_requests, 1);
  } finally {
    server.close();
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    delete process.env.RATE_LIMIT_WINDOW_MS;
  }
});

// --- RBAC_ENFORCE production default ---------------------------------------

test("RBAC enforcement defaults to on in production even when RBAC_ENFORCE is unset", async () => {
  process.env.APP_ENV = "production";
  process.env.VEMS_OBJECT_STORAGE_KEY = "a".repeat(64);
  delete process.env.RBAC_ENFORCE;
  const { server, base } = await startServer();

  try {
    // dispatcher lacks a role this route requires when RBAC is enforced.
    const denied = await jsonFetch(base, "/api/support/diagnostics", { method: "GET" });
    assert.equal(denied.status, 403);
  } finally {
    server.close();
    delete process.env.APP_ENV;
    delete process.env.VEMS_OBJECT_STORAGE_KEY;
  }
});

test("RBAC_ENFORCE=false is ignored in production -- enforcement stays on", async () => {
  process.env.APP_ENV = "production";
  process.env.VEMS_OBJECT_STORAGE_KEY = "a".repeat(64);
  process.env.RBAC_ENFORCE = "false";
  const { server, base } = await startServer();

  try {
    const denied = await jsonFetch(base, "/api/support/diagnostics", { method: "GET" });
    assert.equal(denied.status, 403);
  } finally {
    server.close();
    delete process.env.APP_ENV;
    delete process.env.VEMS_OBJECT_STORAGE_KEY;
    delete process.env.RBAC_ENFORCE;
  }
});

test("RBAC_ENFORCE remains opt-in outside production", async () => {
  delete process.env.APP_ENV;
  delete process.env.RBAC_ENFORCE;
  const { server, base } = await startServer();

  try {
    // Would be denied under enforcement, but this isn't production and
    // RBAC_ENFORCE wasn't set, so the existing opt-in default applies.
    const allowed = await jsonFetch(base, "/api/support/diagnostics", { method: "GET" });
    assert.equal(allowed.status, 200);
  } finally {
    server.close();
  }
});

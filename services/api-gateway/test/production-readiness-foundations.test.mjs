import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-prf-test-"));
  return join(dir, "platform.sqlite");
}

async function startServer() {
  const orchestration = new OrchestrationService({ dbPath: createDbPath() });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function jsonFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options
  });

  return {
    status: response.status,
    headers: response.headers,
    body: await response.json()
  };
}

test("response includes correlation and request identifiers", async () => {
  const { server, base } = await startServer();

  try {
    const response = await jsonFetch(base, "/api/incidents", { method: "GET" });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("x-correlation-id"));
    assert.ok(response.headers.get("x-request-id"));
  } finally {
    server.close();
  }
});

test("rbac policy is enforced for write endpoints when enabled", async () => {
  process.env.RBAC_ENFORCE = "true";
  const { server, base } = await startServer();

  try {
    const denied = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-333" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
      })
    });

    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "FORBIDDEN");

    const allowed = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-444" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
      })
    });

    assert.equal(allowed.status, 201);
    assert.ok(allowed.body.incident_id);
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
  }
});

test("readiness endpoint provides supportability snapshot", async () => {
  const { server, base } = await startServer();

  try {
    const report = await jsonFetch(base, "/api/support/readiness", { method: "GET" });
    assert.equal(report.status, 200);
    assert.equal(report.body.production_readiness.structured_logging, true);
    assert.equal(report.body.production_readiness.correlation_headers, true);
    assert.ok(report.body.incident_snapshot);
  } finally {
    server.close();
  }
});

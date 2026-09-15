import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../../orchestration/src/index.mjs";
import { createApp } from "../src/server.mjs";

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "vems-reports-api-"));
  const orchestration = new OrchestrationService({ dbPath: join(dir, "platform.sqlite") });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    orchestration,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      rmSync(dir, { recursive: true, force: true });
    },
    async request(path, method = "GET", payload, headers = {}) {
      const response = await fetch(base + path, {
        method,
        headers: { "content-type": "application/json", "x-user-role": "supervisor", "x-actor-id": "STAFF-001", ...headers },
        ...(payload ? { body: JSON.stringify(payload) } : {})
      });
      return { status: response.status, body: await response.json() };
    }
  };
}

test("GET /api/reports/incidents, /stock-usage and /qa-flags return 200 with an empty-report shape when there is no data", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  const incidents = await harness.request("/api/reports/incidents");
  assert.equal(incidents.status, 200);
  assert.equal(incidents.body.total_incidents, 0);
  assert.deepEqual(incidents.body.range, { from: null, to: null });

  const stockUsage = await harness.request("/api/reports/stock-usage");
  assert.equal(stockUsage.status, 200);
  assert.equal(stockUsage.body.total_usage_events, 0);

  const qaFlags = await harness.request("/api/reports/qa-flags");
  assert.equal(qaFlags.status, 200);
  assert.equal(qaFlags.body.total_flags, 0);
});

test("GET /api/reports/incidents passes the from/to query params through as the report's date range", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  const response = await harness.request("/api/reports/incidents?from=2026-01-01T00:00:00Z&to=2026-12-31T00:00:00Z");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.range, { from: "2026-01-01T00:00:00Z", to: "2026-12-31T00:00:00Z" });
});

test("RBAC: only supervisor/operations_manager/sys_admin can read /api/reports/*", async (t) => {
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = "true";
  const harness = await startServer();
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  t.after(() => harness.close());

  const deniedIncidents = await harness.request("/api/reports/incidents", "GET", undefined, { "x-user-role": "field_crew" });
  assert.equal(deniedIncidents.status, 403);

  const deniedStockUsage = await harness.request("/api/reports/stock-usage", "GET", undefined, { "x-user-role": "dispatcher" });
  assert.equal(deniedStockUsage.status, 403);

  const deniedQaFlags = await harness.request("/api/reports/qa-flags", "GET", undefined, { "x-user-role": "clinical_reviewer" });
  assert.equal(deniedQaFlags.status, 403);

  const allowedOperationsManager = await harness.request("/api/reports/incidents", "GET", undefined, { "x-user-role": "operations_manager" });
  assert.equal(allowedOperationsManager.status, 200);

  const allowedSupervisor = await harness.request("/api/reports/qa-flags", "GET", undefined, { "x-user-role": "supervisor" });
  assert.equal(allowedSupervisor.status, 200);
});

test("GET /api/reports/audit surfaces actor, entity and filter query params", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  await harness.request("/api/incidents", "POST", {
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Audit API test", address: "1 Main St", patient_count: 1 }
  }, { "x-user-role": "dispatcher", "x-actor-id": "STAFF-DISPATCH" });

  const empty = await harness.request("/api/reports/audit?entity_type=nonexistent-entity");
  assert.equal(empty.status, 200);
  assert.equal(empty.body.entries.length, 0);
  assert.equal(empty.body.has_more, false);

  const byEntityType = await harness.request("/api/reports/audit?entity_type=incident");
  assert.equal(byEntityType.status, 200);
  assert.equal(byEntityType.body.entries.length, 1);
  assert.equal(byEntityType.body.entries[0].actor_id, "STAFF-DISPATCH");
  assert.equal(byEntityType.body.entries[0].action, "create_incident");
  assert.deepEqual(byEntityType.body.filters.entity_type, "incident");

  const byActor = await harness.request("/api/reports/audit?actor_id=STAFF-DISPATCH");
  assert.equal(byActor.body.entries.length, 1);

  const byOtherActor = await harness.request("/api/reports/audit?actor_id=STAFF-NOBODY");
  assert.equal(byOtherActor.body.entries.length, 0);
});

test("RBAC: /api/reports/audit is narrower than the other report routes -- operations_manager is denied", async (t) => {
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = "true";
  const harness = await startServer();
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  t.after(() => harness.close());

  const deniedOperationsManager = await harness.request("/api/reports/audit", "GET", undefined, { "x-user-role": "operations_manager" });
  assert.equal(deniedOperationsManager.status, 403);

  const deniedFieldCrew = await harness.request("/api/reports/audit", "GET", undefined, { "x-user-role": "field_crew" });
  assert.equal(deniedFieldCrew.status, 403);

  const allowedSupervisor = await harness.request("/api/reports/audit", "GET", undefined, { "x-user-role": "supervisor" });
  assert.equal(allowedSupervisor.status, 200);

  const allowedSysAdmin = await harness.request("/api/reports/audit", "GET", undefined, { "x-user-role": "sys_admin" });
  assert.equal(allowedSysAdmin.status, 200);
});

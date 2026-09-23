import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../../orchestration/src/index.mjs";
import { createApp } from "../src/server.mjs";

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "vems-revocation-api-"));
  const orchestration = new OrchestrationService({ dbPath: join(dir, "platform.sqlite") });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    orchestration,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      orchestration.db.db?.close();
      rmSync(dir, { recursive: true, force: true });
    },
    async request(path, method = "GET", payload, headers = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "content-type": "application/json",
          "x-user-role": "supervisor",
          "x-actor-id": "STAFF-001",
          ...headers
        },
        ...(payload ? { body: JSON.stringify(payload) } : {})
      });
      return { status: response.status, body: await response.json() };
    }
  };
}

test("POST/GET /api/revocations revokes access and lists revocations", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  const revoked = await harness.request("/api/revocations", "POST", { scope: "device", target: "device-abc", reason: "lost phone" });
  assert.equal(revoked.status, 201);
  assert.equal(revoked.body.scope, "device");
  assert.equal(revoked.body.target, "device-abc");
  assert.equal(revoked.body.revoked_by, "STAFF-001");

  const list = await harness.request("/api/revocations");
  assert.equal(list.status, 200);
  assert.equal(list.body.revocations.length, 1);
  assert.equal(list.body.revocations[0].target, "device-abc");
});

test("revocation payload validation surfaces as 400", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const response = await harness.request("/api/revocations", "POST", { scope: "bogus", target: "x" });
  assert.equal(response.status, 400);
});

test("a revoked device is denied on its next request with SESSION_REVOKED, other devices unaffected", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  await harness.request("/api/revocations", "POST", { scope: "device", target: "device-revoked" });

  const denied = await harness.request("/api/assignments/mine", "GET", undefined, { "x-user-role": "field_crew", "x-actor-id": "STAFF-002", "x-device-id": "device-revoked" });
  assert.equal(denied.status, 401);
  assert.equal(denied.body.error.code, "SESSION_REVOKED");

  const allowed = await harness.request("/api/assignments/mine", "GET", undefined, { "x-user-role": "field_crew", "x-actor-id": "STAFF-002", "x-device-id": "device-not-revoked" });
  assert.equal(allowed.status, 200);
});

test("a revoked actor is denied regardless of device id, including requests with no device id at all", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());

  await harness.request("/api/revocations", "POST", { scope: "actor", target: "STAFF-003" });

  const withoutDevice = await harness.request("/api/assignments/mine", "GET", undefined, { "x-user-role": "field_crew", "x-actor-id": "STAFF-003" });
  assert.equal(withoutDevice.status, 401);
  assert.equal(withoutDevice.body.error.code, "SESSION_REVOKED");

  const withDevice = await harness.request("/api/assignments/mine", "GET", undefined, { "x-user-role": "field_crew", "x-actor-id": "STAFF-003", "x-device-id": "some-device" });
  assert.equal(withDevice.status, 401);
});

test("RBAC: only supervisor/sys_admin can revoke or list revocations", async (t) => {
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = "true";
  const harness = await startServer();
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  t.after(() => harness.close());

  const revoke = await harness.request("/api/revocations", "POST", { scope: "device", target: "d1" }, { "x-user-role": "dispatcher" });
  assert.equal(revoke.status, 403);

  const list = await harness.request("/api/revocations", "GET", undefined, { "x-user-role": "field_crew_lead" });
  assert.equal(list.status, 403);

  const allowed = await harness.request("/api/revocations", "POST", { scope: "device", target: "d1" }, { "x-user-role": "sys_admin" });
  assert.equal(allowed.status, 201);
});

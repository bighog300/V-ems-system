import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-push-tokens-test-"));
  return join(dir, "platform.sqlite");
}

async function startServer(dbPath = createDbPath()) {
  const orchestration = new OrchestrationService({ dbPath });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, orchestration, base: `http://127.0.0.1:${port}` };
}

async function jsonFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

test("POST /api/push-tokens registers a device token for the authenticated crew member", async () => {
  const { server, base, orchestration } = await startServer();
  try {
    const response = await jsonFetch(base, "/api/push-tokens", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-001" },
      body: JSON.stringify({ expo_push_token: "ExponentPushToken[device-1]", platform: "ios" })
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.staff_id, "STAFF-001");
    assert.equal(response.body.expo_push_token, "ExponentPushToken[device-1]");
    assert.equal((await orchestration.pushTokens.listByStaffId("STAFF-001")).length, 1);
  } finally {
    server.close();
  }
});

test("POST /api/push-tokens persists device_id when provided", async () => {
  const { server, base, orchestration } = await startServer();
  try {
    const response = await jsonFetch(base, "/api/push-tokens", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-001" },
      body: JSON.stringify({ expo_push_token: "ExponentPushToken[device-1]", platform: "ios", device_id: "device-uuid-1" })
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.device_id, "device-uuid-1");
    assert.equal((await orchestration.pushTokens.listByStaffId("STAFF-001"))[0].device_id, "device-uuid-1");
  } finally {
    server.close();
  }
});

test("POST /api/push-tokens rejects an invalid platform", async () => {
  const { server, base } = await startServer();
  try {
    const response = await jsonFetch(base, "/api/push-tokens", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-001" },
      body: JSON.stringify({ expo_push_token: "ExponentPushToken[device-1]", platform: "windows" })
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

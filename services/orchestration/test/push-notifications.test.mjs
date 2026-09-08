import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";
import { SqliteClient } from "../src/db.mjs";
import { SyncIntentRepository } from "../src/repositories/sync-intent-repository.mjs";
import { DevicePushTokenRepository } from "../src/repositories/device-push-token-repository.mjs";
import { SyncWorker } from "../src/sync-worker.mjs";
import { ExpoPushAdapterClient } from "../src/adapters/expo/expo-push-adapter-client.mjs";
import { createExpoPushTransportFromEnv } from "../src/adapters/transports.mjs";

function createDbPath(label) {
  return join(mkdtempSync(join(tmpdir(), `vems-push-${label}-`)), "platform.sqlite");
}

function service(dbPath = createDbPath("orchestration")) {
  return new OrchestrationService({ dbPath });
}

function incident(o, address = "test") {
  return o.createIncident(
    { call: { call_source: "phone", received_at: "2026-09-08T00:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "test", address, patient_count: 1 } },
    { correlationId: `incident-${address}` }
  );
}

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

// --- DevicePushTokenRepository ---

test("DevicePushTokenRepository upsert reassigns ownership when a token re-registers under a different staff member", () => {
  const db = new SqliteClient(createDbPath("repo"));
  const repo = new DevicePushTokenRepository(db);

  repo.upsert({ staffId: "STAFF-001", expoPushToken: "ExponentPushToken[shared-device]", platform: "ios" });
  assert.equal(repo.listByStaffId("STAFF-001").length, 1);

  repo.upsert({ staffId: "STAFF-002", expoPushToken: "ExponentPushToken[shared-device]", platform: "ios" });
  assert.equal(repo.listByStaffId("STAFF-001").length, 0);
  assert.equal(repo.listByStaffId("STAFF-002").length, 1);
});

test("DevicePushTokenRepository upsert stores and updates device_id", () => {
  const db = new SqliteClient(createDbPath("repo-device-id"));
  const repo = new DevicePushTokenRepository(db);

  const first = repo.upsert({ staffId: "STAFF-001", expoPushToken: "ExponentPushToken[a]", platform: "ios", deviceId: "device-uuid-1" });
  assert.equal(first.device_id, "device-uuid-1");

  const updated = repo.upsert({ staffId: "STAFF-001", expoPushToken: "ExponentPushToken[a]", platform: "ios", deviceId: "device-uuid-2" });
  assert.equal(updated.device_id, "device-uuid-2");
});

test("DevicePushTokenRepository upsert defaults device_id to null when omitted", () => {
  const db = new SqliteClient(createDbPath("repo-device-id-null"));
  const repo = new DevicePushTokenRepository(db);
  const token = repo.upsert({ staffId: "STAFF-001", expoPushToken: "ExponentPushToken[a]", platform: "ios" });
  assert.equal(token.device_id, null);
});

test("DevicePushTokenRepository listByStaffIds fans out across multiple crew members", () => {
  const db = new SqliteClient(createDbPath("repo-fanout"));
  const repo = new DevicePushTokenRepository(db);
  repo.upsert({ staffId: "STAFF-001", expoPushToken: "ExponentPushToken[a]", platform: "ios" });
  repo.upsert({ staffId: "STAFF-002", expoPushToken: "ExponentPushToken[b]", platform: "android" });
  repo.upsert({ staffId: "STAFF-003", expoPushToken: "ExponentPushToken[c]", platform: "android" });

  const tokens = repo.listByStaffIds(["STAFF-001", "STAFF-002"]).map((row) => row.expo_push_token).sort();
  assert.deepEqual(tokens, ["ExponentPushToken[a]", "ExponentPushToken[b]"]);
});

test("DevicePushTokenRepository listByStaffIds returns an empty list for an empty input", () => {
  const db = new SqliteClient(createDbPath("repo-empty"));
  const repo = new DevicePushTokenRepository(db);
  assert.deepEqual(repo.listByStaffIds([]), []);
});

// --- OrchestrationService.registerPushToken ---

test("registerPushToken persists a device token for the authenticated actor", () => {
  const o = service();
  const token = o.registerPushToken({ expo_push_token: "ExponentPushToken[device-1]", platform: "ios" }, { actorId: "STAFF-001" });
  assert.equal(token.staff_id, "STAFF-001");
  assert.equal(token.expo_push_token, "ExponentPushToken[device-1]");
  assert.equal(token.platform, "ios");
  assert.equal(token.device_id, null);
});

test("registerPushToken persists the device_id when provided, as groundwork for future revocation", () => {
  const o = service();
  const token = o.registerPushToken({ expo_push_token: "ExponentPushToken[device-1]", platform: "ios", device_id: "device-uuid-1" }, { actorId: "STAFF-001" });
  assert.equal(token.device_id, "device-uuid-1");
});

test("registerPushToken rejects an invalid platform", () => {
  const o = service();
  assert.throws(() => o.registerPushToken({ expo_push_token: "ExponentPushToken[device-1]", platform: "windows" }, { actorId: "STAFF-001" }), /platform/i);
});

test("registerPushToken rejects a missing token", () => {
  const o = service();
  assert.throws(() => o.registerPushToken({ platform: "ios" }, { actorId: "STAFF-001" }), /expo_push_token/);
});

// --- push intents queued on assignment create/update ---

test("createAssignment queues a push intent addressed to the assigned crew", () => {
  const o = service();
  const inc = incident(o);
  const assignment = o.createAssignment(inc.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-002", "STAFF-001"], reason: "Dispatch" }, { correlationId: "corr-1" });

  const intents = o.syncIntents.listAll().filter((i) => i.target_system === "expo");
  assert.equal(intents.length, 1);
  assert.deepEqual(intents[0].payload.staff_ids, ["STAFF-001", "STAFF-002"]);
  assert.equal(intents[0].payload.data.assignment_id, assignment.assignment_id);
  assert.equal(intents[0].payload.data.incident_id, inc.incident_id);
  assert.equal(intents[0].payload.data.screen, "IncidentDetail");
  assert.match(intents[0].payload.title, /assignment/i);
});

test("updateAssignment queues a push intent on every status transition", () => {
  const o = service();
  const inc = incident(o);
  const assignment = o.createAssignment(inc.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-001"], reason: "Dispatch" }, { correlationId: "corr-2" });
  o.updateAssignment(assignment.assignment_id, { action: "confirm_assignment" }, { correlationId: "confirm" });

  const intents = o.syncIntents.listAll().filter((i) => i.target_system === "expo");
  assert.equal(intents.length, 2);
  assert.deepEqual(intents[1].payload.staff_ids, ["STAFF-001"]);
  assert.match(intents[1].payload.body, /Assigned/);
});

test("updateAssignment reassignment queues a push intent with a reassignment-specific title", () => {
  const o = service();
  const inc = incident(o);
  const assignment = o.createAssignment(inc.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-001"], reason: "Dispatch" }, { correlationId: "corr-3" });
  o.updateAssignment(assignment.assignment_id, { action: "confirm_assignment" }, { correlationId: "confirm" });
  o.updateAssignment(assignment.assignment_id, { action: "accept_assignment" }, { correlationId: "accept" });
  o.updateAssignment(assignment.assignment_id, { action: "mobilise_unit" }, { correlationId: "mobilise" });
  o.updateAssignment(assignment.assignment_id, { action: "activate_assignment" }, { correlationId: "activate" });
  o.updateAssignment(assignment.assignment_id, { action: "reassign_assignment" }, { correlationId: "reassign" });

  const intents = o.syncIntents.listAll().filter((i) => i.target_system === "expo");
  const last = intents.at(-1);
  assert.equal(last.payload.title, "Assignment reassigned");
});

test("createAssignment queues no push intent when no crew is assigned", () => {
  const o = service();
  const inc = incident(o);
  o.createAssignment(inc.incident_id, { vehicle_id: "AMB-901", crew_ids: [], reason: "Dispatch" }, { correlationId: "corr-4" });
  assert.equal(o.syncIntents.listAll().filter((i) => i.target_system === "expo").length, 0);
});

// --- ExpoPushAdapterClient ---

test("ExpoPushAdapterClient.sendPush builds one message per token and reports the ticket response", async () => {
  const calls = [];
  const adapter = new ExpoPushAdapterClient({
    transport: async ({ method, payload }) => {
      calls.push({ method, payload });
      return { data: payload.map(() => ({ status: "ok" })) };
    }
  });

  const result = await adapter.sendPush({ tokens: ["ExponentPushToken[a]", "ExponentPushToken[b]"], title: "Hi", body: "There", data: { screen: "JobsList" } });
  assert.equal(result.sent, 2);
  assert.equal(result.tickets.length, 2);
  assert.equal(calls[0].method, "sendPush");
  assert.deepEqual(calls[0].payload[0], { to: "ExponentPushToken[a]", title: "Hi", body: "There", data: { screen: "JobsList" }, sound: "default" });
});

test("ExpoPushAdapterClient.sendPush is a no-op when there are no tokens", async () => {
  const adapter = new ExpoPushAdapterClient({ transport: async () => { throw new Error("should not be called"); } });
  const result = await adapter.sendPush({ tokens: [], title: "Hi", body: "There" });
  assert.deepEqual(result, { sent: 0, tickets: [] });
});

test("ExpoPushAdapterClient.sendPush wraps a transport failure with a classification", async () => {
  const adapter = new ExpoPushAdapterClient({ transport: async () => { const error = new Error("boom"); error.code = "DOWNSTREAM_UNAVAILABLE"; throw error; } });
  await assert.rejects(
    adapter.sendPush({ tokens: ["ExponentPushToken[a]"], title: "Hi", body: "There" }),
    (error) => error.classification === "DOWNSTREAM_UNAVAILABLE"
  );
});

// --- createExpoPushTransportFromEnv ---

test("createExpoPushTransportFromEnv returns undefined when explicitly disabled", () => {
  assert.equal(createExpoPushTransportFromEnv({ EXPO_PUSH_DISABLED: "true" }), undefined);
});

test("createExpoPushTransportFromEnv posts messages to Expo's push endpoint with an auth header when configured", async () => {
  await withServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      assert.equal(req.headers.authorization, "Bearer expo-token");
      assert.deepEqual(JSON.parse(body), [{ to: "ExponentPushToken[a]", title: "Hi", body: "There" }]);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ status: "ok" }] }));
    });
  }, async (port) => {
    const transport = createExpoPushTransportFromEnv({ EXPO_PUSH_BASE_URL: `http://127.0.0.1:${port}`, EXPO_ACCESS_TOKEN: "expo-token" });
    const result = await transport({ method: "sendPush", payload: [{ to: "ExponentPushToken[a]", title: "Hi", body: "There" }] });
    assert.deepEqual(result, { data: [{ status: "ok" }] });
  });
});

test("createExpoPushTransportFromEnv classifies a downstream failure", async () => {
  await withServer((req, res) => {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unavailable" }));
  }, async (port) => {
    const transport = createExpoPushTransportFromEnv({ EXPO_PUSH_BASE_URL: `http://127.0.0.1:${port}` });
    await assert.rejects(
      transport({ method: "sendPush", payload: [] }),
      (error) => error.classification === "DOWNSTREAM_UNAVAILABLE"
    );
  });
});

// --- end-to-end: orchestration queues, SyncWorker dispatches through a resolved staff -> token lookup ---

test("a queued assignment push intent is dispatched to every registered token for the crew", async () => {
  const dbPath = createDbPath("e2e");
  const orchestration = new OrchestrationService({ dbPath });
  const sharedDb = new SqliteClient(dbPath);
  const syncIntents = new SyncIntentRepository(sharedDb);
  const pushTokens = new DevicePushTokenRepository(sharedDb);

  orchestration.registerPushToken({ expo_push_token: "ExponentPushToken[phone-1]", platform: "ios" }, { actorId: "STAFF-001" });
  orchestration.registerPushToken({ expo_push_token: "ExponentPushToken[tablet-1]", platform: "android" }, { actorId: "STAFF-001" });
  orchestration.registerPushToken({ expo_push_token: "ExponentPushToken[phone-2]", platform: "ios" }, { actorId: "STAFF-002" });

  const inc = incident(orchestration, "Push E2E");
  orchestration.createAssignment(inc.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-001", "STAFF-002"], reason: "Dispatch" }, { correlationId: "corr-e2e" });

  const sentMessages = [];
  const worker = new SyncWorker({
    syncIntents,
    maxAttempts: 3,
    expo: {
      async sendPush(payload) {
        const tokens = pushTokens.listByStaffIds(payload.staff_ids).map((row) => row.expo_push_token);
        sentMessages.push({ tokens, title: payload.title });
      }
    },
    vtiger: {},
    openemr: {}
  });

  const results = await worker.processPending(10);
  const pushResult = results.find((r) => syncIntents.listAll().find((i) => i.intent_id === r.intent_id)?.target_system === "expo");
  assert.equal(pushResult.status, "succeeded");
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].tokens.sort(), ["ExponentPushToken[phone-1]", "ExponentPushToken[phone-2]", "ExponentPushToken[tablet-1]"].sort());
});

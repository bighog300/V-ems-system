import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteClient } from "../src/db.mjs";
import { SyncIntentRepository } from "../src/repositories/sync-intent-repository.mjs";
import { SyncWorker } from "../src/sync-worker.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-sync-worker-test-"));
  return join(dir, "platform.sqlite");
}

function createIntentRepository() {
  const db = new SqliteClient(createDbPath());
  return new SyncIntentRepository(db);
}

function appendIntent(syncIntents, intent) {
  syncIntents.append({
    target_system: intent.target_system,
    intent_type: intent.intent_type,
    entity_type: intent.entity_type ?? "incident",
    operation: intent.operation ?? intent.intent_type,
    correlation_id: intent.correlation_id ?? "corr-1",
    created_at: "2026-04-16T10:00:00.000Z",
    payload: intent.payload ?? { id: "x" }
  });

  return syncIntents.listAll().at(-1);
}

test("pending intent gets processed successfully", async () => {
  const syncIntents = createIntentRepository();
  appendIntent(syncIntents, {
    target_system: "vtiger",
    intent_type: "createIncidentMirror",
    payload: { incident_id: "INC-000001" }
  });

  const calls = [];
  const worker = new SyncWorker({
    syncIntents,
    vtiger: {
      async createIncidentMirror(payload) {
        calls.push(payload);
      }
    },
    openemr: {}
  });

  await worker.processPending();

  const [intent] = syncIntents.listAll();
  assert.equal(calls.length, 1);
  assert.equal(intent.status, "succeeded");
  assert.equal(intent.processed_at !== null, true);
  assert.equal(intent.attempt_count, 0);
});

test("failed intent increments retry count and keeps error classification", async () => {
  const syncIntents = createIntentRepository();
  appendIntent(syncIntents, {
    target_system: "vtiger",
    intent_type: "updateIncidentMirror",
    payload: { incident_id: "INC-000002" }
  });

  const worker = new SyncWorker({
    syncIntents,
    vtiger: {
      async updateIncidentMirror() {
        const error = new Error("temporary upstream outage");
        error.code = "DOWNSTREAM_TIMEOUT";
        throw error;
      }
    },
    openemr: {},
    maxAttempts: 3
  });

  await worker.processPending();

  const [intent] = syncIntents.listAll();
  assert.equal(intent.status, "pending");
  assert.equal(intent.attempt_count, 1);
  assert.equal(intent.last_error, "temporary upstream outage");
  assert.equal(intent.last_error_classification, "DOWNSTREAM_TIMEOUT");
});

test("intent dead-letters after max attempts", async () => {
  const syncIntents = createIntentRepository();
  appendIntent(syncIntents, {
    target_system: "vtiger",
    intent_type: "createAssignmentMirror",
    payload: { assignment_id: "ASN-000001" }
  });

  const worker = new SyncWorker({
    syncIntents,
    vtiger: {
      async createAssignmentMirror() {
        throw new Error("permanent failure");
      }
    },
    openemr: {},
    maxAttempts: 2
  });

  await worker.processPending();
  await worker.processPending();

  const [intent] = syncIntents.listAll();
  assert.equal(intent.status, "dead_lettered");
  assert.equal(intent.attempt_count, 2);
  assert.equal(intent.dead_lettered_at !== null, true);
});

test("worker dispatches to correct adapter method based on target_system and intent_type", async () => {
  const syncIntents = createIntentRepository();
  appendIntent(syncIntents, {
    target_system: "vtiger",
    intent_type: "updateAssignmentMirror",
    payload: { assignment_id: "ASN-100" }
  });
  appendIntent(syncIntents, {
    target_system: "openemr",
    intent_type: "createEncounter",
    entity_type: "encounter",
    operation: "createEncounter",
    payload: { encounter_id: "ENC-100" }
  });
  appendIntent(syncIntents, {
    target_system: "vtiger",
    intent_type: "recordStockUsageMirror",
    entity_type: "stock_usage",
    operation: "recordStockUsageMirror",
    payload: { incident_id: "INC-100", stock_item_id: "ITEM-100" }
  });

  const calls = [];
  const worker = new SyncWorker({
    syncIntents,
    vtiger: {
      async updateAssignmentMirror(payload) {
        calls.push({ target: "vtiger", method: "updateAssignmentMirror", payload });
      },
      async recordStockUsageMirror(payload) {
        calls.push({ target: "vtiger", method: "recordStockUsageMirror", payload });
      }
    },
    openemr: {
      async createEncounter(payload) {
        calls.push({ target: "openemr", method: "createEncounter", payload });
      }
    }
  });

  await worker.processPending();

  assert.deepEqual(calls, [
    { target: "vtiger", method: "updateAssignmentMirror", payload: { assignment_id: "ASN-100" } },
    { target: "openemr", method: "createEncounter", payload: { encounter_id: "ENC-100" } },
    { target: "vtiger", method: "recordStockUsageMirror", payload: { incident_id: "INC-100", stock_item_id: "ITEM-100" } }
  ]);
});

test("failed stock usage sync intent retries and dead-letters at max attempts", async () => {
  const syncIntents = createIntentRepository();
  appendIntent(syncIntents, {
    target_system: "vtiger",
    intent_type: "recordStockUsageMirror",
    entity_type: "stock_usage",
    operation: "recordStockUsageMirror",
    payload: { incident_id: "INC-777", stock_item_id: "ITEM-777" }
  });

  const worker = new SyncWorker({
    syncIntents,
    vtiger: {
      async recordStockUsageMirror() {
        const error = new Error("stock mirror downstream timeout");
        error.code = "DOWNSTREAM_TIMEOUT";
        throw error;
      }
    },
    openemr: {},
    maxAttempts: 2
  });

  await worker.processPending();
  let [intent] = syncIntents.listAll();
  assert.equal(intent.status, "pending");
  assert.equal(intent.attempt_count, 1);
  assert.equal(intent.last_error_classification, "DOWNSTREAM_TIMEOUT");

  await worker.processPending();
  [intent] = syncIntents.listAll();
  assert.equal(intent.status, "dead_lettered");
  assert.equal(intent.attempt_count, 2);
  assert.equal(intent.dead_lettered_at !== null, true);
});

test("worker does not reprocess already completed intents", async () => {
  const syncIntents = createIntentRepository();
  appendIntent(syncIntents, {
    target_system: "vtiger",
    intent_type: "createIncidentMirror",
    payload: { incident_id: "INC-000003" }
  });

  let count = 0;
  const worker = new SyncWorker({
    syncIntents,
    vtiger: {
      async createIncidentMirror() {
        count += 1;
      }
    },
    openemr: {}
  });

  await worker.processPending();
  await worker.processPending();

  assert.equal(count, 1);
  const [intent] = syncIntents.listAll();
  assert.equal(intent.status, "succeeded");
});

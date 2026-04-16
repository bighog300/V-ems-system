import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";
import { SqliteClient } from "../src/db.mjs";
import { SyncIntentRepository } from "../src/repositories/sync-intent-repository.mjs";
import { SyncWorker } from "../src/sync-worker.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-sync-worker-integration-"));
  return join(dir, "platform.sqlite");
}

test("orchestration persisted intent is dispatched once and completed by worker", async () => {
  const dbPath = createDbPath();
  const orchestration = new OrchestrationService({ dbPath });
  const sharedDb = new SqliteClient(dbPath);
  const syncIntents = new SyncIntentRepository(sharedDb);

  const incident = orchestration.createIncident({
    call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
    incident: {
      category: "medical_emergency",
      priority: "critical",
      description: "Chest pain",
      address: "Main St",
      patient_count: 1
    }
  }, { correlationId: "corr-sync-int-1" });

  const [pendingIntent] = syncIntents.listPending();
  assert.equal(pendingIntent.intent_type, "createIncidentMirror");
  assert.equal(pendingIntent.status, "pending");

  const dispatchCalls = [];
  const worker = new SyncWorker({
    syncIntents,
    maxAttempts: 3,
    vtiger: {
      async createIncidentMirror(payload) {
        dispatchCalls.push(payload);
      }
    },
    openemr: {}
  });

  const firstRun = await worker.processPending(10);
  assert.equal(firstRun.length, 1);

  const [processedIntent] = syncIntents.listAll();
  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0].incident_id, incident.incident_id);
  assert.equal(processedIntent.status, "succeeded");
  assert.equal(processedIntent.processed_at !== null, true);

  const secondRun = await worker.processPending(10);
  assert.equal(secondRun.length, 0);
  assert.equal(dispatchCalls.length, 1);
});

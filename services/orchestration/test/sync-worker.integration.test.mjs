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

test("stock usage intent flows from intervention create through worker completion", async () => {
  const dbPath = createDbPath();
  const orchestration = new OrchestrationService({
    dbPath,
    openemr: {
      async createEncounter() {
        return { encounter_id: "ENC-600", status: "Open" };
      },
      async createIntervention(payload) {
        return { intervention_id: "INT-600", encounter_id: payload.encounter_id, status: "recorded" };
      },
      async getInterventions(payload) {
        return [{
          intervention_id: "INT-600",
          encounter_id: payload.encounter_id,
          status: "recorded",
          stock_item_id: "ITEM-600",
          performed_at: "2026-04-16T10:40:00Z",
          type: "medication",
          name: "Aspirin"
        }];
      }
    }
  });
  const sharedDb = new SqliteClient(dbPath);
  const syncIntents = new SyncIntentRepository(sharedDb);

  const incident = orchestration.createIncident({
    call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
    incident: {
      category: "medical_emergency",
      priority: "high",
      description: "Medication administered",
      address: "Stock Path Ave",
      patient_count: 1
    }
  }, { correlationId: "corr-stock-flow-1" });
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-600"
  }, { correlationId: "corr-stock-flow-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-600",
    care_started_at: "2026-04-16T10:30:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-stock-flow-3" });
  await orchestration.createInterventionForEncounter("ENC-600", {
    performed_at: "2026-04-16T10:40:00Z",
    type: "medication",
    name: "Aspirin",
    stock_item_id: "ITEM-600"
  }, { correlationId: "corr-stock-flow-4" });

  const pendingStockIntent = syncIntents.listAll().find((intent) => intent.intent_type === "recordStockUsageMirror");
  assert.ok(pendingStockIntent);
  assert.equal(pendingStockIntent.status, "pending");
  assert.equal(pendingStockIntent.payload.quantity_used, 1);
  assert.equal(pendingStockIntent.payload.usage_source, "clinical_event");

  const dispatched = [];
  const worker = new SyncWorker({
    syncIntents,
    maxAttempts: 2,
    vtiger: {
      async createIncidentMirror() {},
      async recordStockUsageMirror(payload) {
        dispatched.push(payload);
      }
    },
    openemr: {}
  });

  await worker.processPending(10);

  const interventions = await orchestration.getInterventionsForEncounter("ENC-600");
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].stock_item_id, "ITEM-600");
  assert.equal(dispatched[0].quantity_used, 1);
  assert.deepEqual(interventions, [{
    intervention_id: "INT-600",
    encounter_id: "ENC-600",
    status: "recorded",
    stock_item_id: "ITEM-600",
    stock_sync_status: "succeeded",
    stock_sync_attempt_count: 0,
    stock_sync_last_error: null
  }]);
});

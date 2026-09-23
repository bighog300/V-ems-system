import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { ApiError } from "../../src/api/apiError.ts";
import { observationFromRequest, type PatientCaseObservation } from "../../src/api/observations.ts";
import { migrate } from "../../src/offline/db.ts";
import { enqueueMutation, markMutationStatus } from "../../src/offline/outboxStore.ts";
import { isWaitingToSync, listWithQueued } from "../../src/offline/queuedItems.ts";
import { createNodeSqliteAdapter } from "./nodeSqliteAdapter.ts";

const cryptoModule = { randomUUID: () => randomUUID(), getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count)) };

async function setup() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return { db, encryptionKey: new Uint8Array(randomBytes(32)) };
}

const serverItem = (id: string, at: string): PatientCaseObservation => ({
  observation_event_id: id, patient_case_id: "case-1", encounter_id: "ENC-1", performed_at: at, clinician_id: null,
  observations: { heart_rate_bpm: 70 }, notes: null, downstream_status: "created", created_at: at
});

async function queueVitals(deps: Awaited<ReturnType<typeof setup>>, patientCaseId: string, bpm: number, at: string, scope = "observation") {
  return enqueueMutation(deps.db, deps.encryptionKey, { scope, patientCaseId, method: "POST", path: `https://api.example.test/api/patient-cases/${patientCaseId}/observations`, payload: { vital_signs: { heart_rate_bpm: bpm }, recorded_at: at } }, { cryptoModule });
}

const list = (deps: Awaited<ReturnType<typeof setup>>, fetchFresh: () => Promise<PatientCaseObservation[]>, patientCaseId = "case-1") =>
  listWithQueued<PatientCaseObservation>({
    cacheKey: `test-observations:${patientCaseId}`, fetchFresh, scope: "observation", patientCaseId,
    idOf: (item) => item.observation_event_id,
    fromQueued: (entry) => observationFromRequest(entry.entryId, entry.patientCaseId, entry.payload as never)
  }, { db: deps.db, encryptionKey: deps.encryptionKey, ...({ cryptoModule } as object) });

test("earlier charting and charting still waiting to sync are shown together, the waiting entries identifiable", async () => {
  const deps = await setup();
  const id = await queueVitals(deps, "case-1", 88, "2026-09-20T10:05:00.000Z");
  const result = await list(deps, async () => [serverItem("OBS-1", "2026-09-20T10:00:00.000Z")]);
  assert.deepEqual(result.items.map((i) => [i.observation_event_id, isWaitingToSync(i.observation_event_id)]), [["OBS-1", false], [`LOCAL-${id}`, true]]);
  assert.equal(result.items[1].observations.heart_rate_bpm, 88);
  assert.equal(result.items[1].performed_at, "2026-09-20T10:05:00.000Z", "shows the charting time, not the sync time");
  assert.equal(result.cached, false);
});

test("an acknowledged entry is not repeated: the server copy is shown, the outbox one is not", async () => {
  const deps = await setup();
  const id = await queueVitals(deps, "case-1", 88, "2026-09-20T10:05:00.000Z");
  await markMutationStatus(deps.db, id, { status: "acknowledged", serverResourceId: "OBS-2" });
  const result = await list(deps, async () => [serverItem("OBS-2", "2026-09-20T10:05:00.000Z")]);
  assert.deepEqual(result.items.map((i) => i.observation_event_id), ["OBS-2"]);
});

test("entries for another case or another kind of record are not mixed in; failed and retrying ones still show", async () => {
  const deps = await setup();
  await queueVitals(deps, "case-2", 60, "2026-09-20T10:01:00.000Z");
  await queueVitals(deps, "case-1", 61, "2026-09-20T10:02:00.000Z", "medication");
  const retrying = await queueVitals(deps, "case-1", 62, "2026-09-20T10:03:00.000Z");
  const failed = await queueVitals(deps, "case-1", 63, "2026-09-20T10:04:00.000Z");
  await markMutationStatus(deps.db, retrying, { status: "retrying" });
  await markMutationStatus(deps.db, failed, { status: "failed" });
  const result = await list(deps, async () => []);
  assert.deepEqual(result.items.map((i) => i.observations.heart_rate_bpm), [62, 63]);
});

test("offline with no saved copy still shows what is waiting to sync, and says earlier entries are unavailable", async () => {
  const deps = await setup();
  await queueVitals(deps, "case-1", 88, "2026-09-20T10:05:00.000Z");
  const result = await list(deps, async () => { throw new TypeError("Network request failed"); });
  assert.equal(result.unavailable, true);
  assert.equal(result.items.length, 1);
  assert.equal(isWaitingToSync(result.items[0].observation_event_id), true);
});

test("offline after an earlier online visit shows the saved copy plus what is waiting, marked as a saved copy", async () => {
  const deps = await setup();
  await list(deps, async () => [serverItem("OBS-1", "2026-09-20T10:00:00.000Z")]); // online visit fills the cache
  await queueVitals(deps, "case-1", 88, "2026-09-20T10:05:00.000Z");
  const result = await list(deps, async () => { throw new TypeError("Network request failed"); });
  assert.equal(result.cached, true);
  assert.equal(result.unavailable, false);
  assert.deepEqual(result.items.map((i) => isWaitingToSync(i.observation_event_id)), [false, true]);
  assert.ok(result.cachedAt);
});

test("a real rejection such as an authorization failure is not hidden behind the saved copy", async () => {
  const deps = await setup();
  await assert.rejects(() => list(deps, async () => { throw new ApiError("Forbidden", { status: 403, code: "FORBIDDEN" }); }), /Forbidden/);
});

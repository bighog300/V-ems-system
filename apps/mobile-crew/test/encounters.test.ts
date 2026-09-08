import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { createPatientCaseEncounter, getPatientCaseEncounter } from "../src/api/encounters.ts";
import { LOCAL_ID_PREFIX } from "../src/api/offlineMutation.ts";
import { migrate } from "../src/offline/db.ts";
import { createNodeSqliteAdapter } from "./offline/nodeSqliteAdapter.ts";

function fakeCryptoModule() {
  return {
    randomUUID: () => randomUUID(),
    getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count))
  };
}

async function setupOfflineDeps() {
  const db = createNodeSqliteAdapter();
  await migrate(db);
  return { db, encryptionKey: new Uint8Array(randomBytes(32)), cryptoModule: fakeCryptoModule() };
}

test("getPatientCaseEncounter returns null when no encounter exists yet", async () => {
  const fetchImpl = async () => new Response(null, { status: 404 });

  const encounter = await getPatientCaseEncounter({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(encounter, null);
});

test("getPatientCaseEncounter returns the encounter when it exists", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        patient_case_id: "PCR-000001",
        incident_id: "INC-000001",
        linked_incident_id: "INC-000001",
        openemr_patient_id: "OE-100",
        openemr_encounter_id: "ENC-100",
        encounter_id: "ENC-100",
        encounter_status: "Open",
        status: "Open",
        care_started_at: "2026-09-07T10:00:00.000Z",
        created_at: "2026-09-07T10:00:00.000Z",
        updated_at: "2026-09-07T10:00:00.000Z"
      }),
      { status: 200 }
    );

  const encounter = await getPatientCaseEncounter({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(encounter?.encounter_id, "ENC-100");
});

test("createPatientCaseEncounter posts care_started_at and presenting_complaint", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        patient_case_id: "PCR-000001",
        incident_id: "INC-000001",
        linked_incident_id: "INC-000001",
        openemr_patient_id: "OE-100",
        openemr_encounter_id: "ENC-101",
        encounter_id: "ENC-101",
        encounter_status: "Open",
        status: "Open",
        care_started_at: "2026-09-07T10:05:00.000Z",
        created_at: "2026-09-07T10:05:00.000Z",
        updated_at: "2026-09-07T10:05:00.000Z"
      }),
      { status: 201 }
    );
  };

  const created = await createPatientCaseEncounter({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: { care_started_at: "2026-09-07T10:05:00.000Z", presenting_complaint: "Chest pain" },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/encounters");
  assert.deepEqual(capturedBody, { care_started_at: "2026-09-07T10:05:00.000Z", presenting_complaint: "Chest pain" });
  assert.equal(created.encounter_id, "ENC-101");
});

test("createPatientCaseEncounter forwards optional location fields, and omits them when not captured", async () => {
  let capturedBody: unknown;
  const fetchImpl = async (_url: string, options: any) => {
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ encounter_id: "ENC-102" }), { status: 201 });
  };

  await createPatientCaseEncounter({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: {
      care_started_at: "2026-09-07T10:05:00.000Z",
      presenting_complaint: "Chest pain",
      location_lat: 51.5074,
      location_lng: -0.1278,
      location_accuracy_m: 12.5
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.deepEqual(capturedBody, {
    care_started_at: "2026-09-07T10:05:00.000Z",
    presenting_complaint: "Chest pain",
    location_lat: 51.5074,
    location_lng: -0.1278,
    location_accuracy_m: 12.5
  });

  await createPatientCaseEncounter({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: { care_started_at: "2026-09-07T10:05:00.000Z", presenting_complaint: "Chest pain" },
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.deepEqual(capturedBody, { care_started_at: "2026-09-07T10:05:00.000Z", presenting_complaint: "Chest pain" });
});

test("createPatientCaseEncounter queues offline and returns a LOCAL- placeholder encounter id", async () => {
  const deps = await setupOfflineDeps();
  const fetchImpl = async () => {
    throw new TypeError("Network request failed");
  };

  const created = await createPatientCaseEncounter(
    {
      apiBaseUrl: "https://api.example.test",
      authToken: "token",
      patientCaseId: "PCR-000001",
      payload: { care_started_at: "2026-09-07T10:05:00.000Z", presenting_complaint: "Chest pain" },
      fetchImpl: fetchImpl as typeof fetch
    },
    deps
  );

  assert.ok(created.encounter_id.startsWith(LOCAL_ID_PREFIX));
  assert.equal(created.patient_case_id, "PCR-000001");
  assert.equal(created.care_started_at, "2026-09-07T10:05:00.000Z");
});

test("createPatientCaseEncounter queues against a still-local (not yet synced) patient case", async () => {
  const deps = await setupOfflineDeps();
  const fetchImpl = async () => {
    throw new TypeError("Network request failed");
  };
  const localCaseId = `${LOCAL_ID_PREFIX}some-entry-id`;

  const created = await createPatientCaseEncounter(
    {
      apiBaseUrl: "https://api.example.test",
      authToken: "token",
      patientCaseId: localCaseId,
      payload: { care_started_at: "2026-09-07T10:05:00.000Z", presenting_complaint: "Chest pain" },
      fetchImpl: fetchImpl as typeof fetch
    },
    deps
  );

  assert.equal(created.patient_case_id, localCaseId);
});

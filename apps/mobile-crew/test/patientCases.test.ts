import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { test } from "node:test";

import { LOCAL_ID_PREFIX } from "../src/api/offlineMutation.ts";
import {
  createPatientCase,
  getPatientCaseDemographics,
  listPatientCases,
  savePatientCaseDemographics
} from "../src/api/patientCases.ts";
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

const SAMPLE_CASE = {
  patient_case_id: "PCR-000001",
  incident_id: "INC-000001",
  patient_sequence: 1,
  status: "Created",
  temporary_label: null,
  assignment_id: "ASN-000001",
  vehicle_id: "AMB-901",
  lead_clinician_id: null,
  verification_status: "unknown",
  openemr_patient_id: null,
  closure_ready: false,
  created_at: "2026-09-07T10:00:00.000Z",
  updated_at: "2026-09-07T10:00:00.000Z"
};

test("listPatientCases returns the patient_cases array from the response", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ patient_cases: [SAMPLE_CASE] }), { status: 200 });

  const cases = await listPatientCases({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    incidentId: "INC-000001",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(cases.length, 1);
  assert.equal(cases[0].patient_case_id, "PCR-000001");
});

test("createPatientCase posts to the incident's patient-cases endpoint and returns the created case", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify(SAMPLE_CASE), { status: 201 });
  };

  const created = await createPatientCase({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    incidentId: "INC-000001",
    payload: { temporary_label: "driver" },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/incidents/INC-000001/patient-cases");
  assert.deepEqual(capturedBody, { temporary_label: "driver" });
  assert.equal(created.patient_case_id, "PCR-000001");
});

test("createPatientCase queues offline and returns a LOCAL- placeholder id the crew can keep charting against", async () => {
  const deps = await setupOfflineDeps();
  const fetchImpl = async () => {
    throw new TypeError("Network request failed");
  };

  const created = await createPatientCase(
    {
      apiBaseUrl: "https://api.example.test",
      authToken: "token",
      incidentId: "INC-000001",
      payload: { temporary_label: "driver" },
      fetchImpl: fetchImpl as typeof fetch
    },
    deps
  );

  assert.ok(created.patient_case_id.startsWith(LOCAL_ID_PREFIX));
  assert.equal(created.incident_id, "INC-000001");
  assert.equal(created.temporary_label, "driver");
  assert.equal(created.status, "Patient Identification Pending");
  assert.equal(created.patient_sequence, 0);
});

test("createPatientCase without a temporary label queues with status Created", async () => {
  const deps = await setupOfflineDeps();
  const fetchImpl = async () => {
    throw new TypeError("Network request failed");
  };

  const created = await createPatientCase(
    {
      apiBaseUrl: "https://api.example.test",
      authToken: "token",
      incidentId: "INC-000001",
      payload: {},
      fetchImpl: fetchImpl as typeof fetch
    },
    deps
  );

  assert.equal(created.status, "Created");
});

test("getPatientCaseDemographics returns null when none exist yet", async () => {
  const fetchImpl = async () => new Response("null", { status: 200 });

  const demographics = await getPatientCaseDemographics({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(demographics, null);
});

test("savePatientCaseDemographics PUTs the payload and returns the saved record", async () => {
  let capturedMethod = "";
  const fetchImpl = async (_url: string, options: any) => {
    capturedMethod = options.method;
    return new Response(JSON.stringify({ patient_case_id: "PCR-000001", first_name: "Jane", last_name: "Doe" }), { status: 200 });
  };

  const saved = await savePatientCaseDemographics({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: { first_name: "Jane", last_name: "Doe" },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedMethod, "PUT");
  assert.equal(saved.first_name, "Jane");
});

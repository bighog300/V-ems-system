import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPatientCase,
  getPatientCaseDemographics,
  listPatientCases,
  savePatientCaseDemographics
} from "../src/api/patientCases.ts";

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

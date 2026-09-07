import assert from "node:assert/strict";
import { test } from "node:test";

import { getPatientCaseDisposition, setPatientCaseDisposition } from "../src/api/disposition.ts";

const SAMPLE_DISPOSITION = {
  disposition_id: "DISP-000001",
  patient_case_id: "PCR-000001",
  encounter_id: "ENC-100",
  outcome: "transported",
  destination_facility: "General Hospital",
  receiving_provider: "Dr. Smith",
  decision_at: "2026-09-07T11:00:00.000Z",
  reason: null,
  notes: null,
  created_at: "2026-09-07T11:00:00.000Z",
  updated_at: "2026-09-07T11:00:00.000Z"
};

test("getPatientCaseDisposition returns null when none exists yet", async () => {
  const fetchImpl = async () => new Response(null, { status: 404 });
  const disposition = await getPatientCaseDisposition({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(disposition, null);
});

test("getPatientCaseDisposition returns the disposition when set", async () => {
  const fetchImpl = async () => new Response(JSON.stringify(SAMPLE_DISPOSITION), { status: 200 });
  const disposition = await getPatientCaseDisposition({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(disposition?.outcome, "transported");
});

test("setPatientCaseDisposition posts the outcome and optional fields", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify(SAMPLE_DISPOSITION), { status: 200 });
  };

  const saved = await setPatientCaseDisposition({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: { outcome: "transported", destination_facility: "General Hospital", receiving_provider: "Dr. Smith" },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/disposition");
  assert.deepEqual(capturedBody, { outcome: "transported", destination_facility: "General Hospital", receiving_provider: "Dr. Smith" });
  assert.equal(saved.disposition_id, "DISP-000001");
});

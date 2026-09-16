import assert from "node:assert/strict";
import { test } from "node:test";

import { getPatientCaseHistory } from "../src/api/patientHistory.ts";

test("getPatientCaseHistory GETs the history endpoint and returns the parsed result", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedMethod = options?.method ?? "GET";
    return new Response(
      JSON.stringify({
        patient_case_id: "PCR-000001",
        openemr_patient_id: "OE-101",
        as_of: "2026-09-16T00:00:00.000Z",
        medications: [{ medication_name: "Metformin", dose: "500mg", frequency: "BID", status: "active" }],
        encounters: [{ encounter_date: "2026-08-01", reason: "Follow-up", facility: "Riverside Clinic" }]
      }),
      { status: 200 }
    );
  };

  const result = await getPatientCaseHistory({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/history");
  assert.equal(capturedMethod, "GET");
  assert.equal(result.openemr_patient_id, "OE-101");
  assert.equal(result.medications.length, 1);
  assert.equal(result.encounters.length, 1);
});

test("getPatientCaseHistory throws when the response has no body", async () => {
  const fetchImpl = async () => new Response(null, { status: 404 });

  await assert.rejects(
    () =>
      getPatientCaseHistory({
        apiBaseUrl: "https://api.example.test",
        authToken: "token",
        patientCaseId: "PCR-000001",
        fetchImpl: fetchImpl as typeof fetch
      }),
    /returned no data/
  );
});

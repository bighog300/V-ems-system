import assert from "node:assert/strict";
import { test } from "node:test";

import { createPatientCaseEncounter, getPatientCaseEncounter } from "../src/api/encounters.ts";

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

import assert from "node:assert/strict";
import { test } from "node:test";

import { createPatientCaseObservation, listPatientCaseObservations } from "../src/api/observations.ts";

test("listPatientCaseObservations returns the observations array", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        observations: [
          {
            observation_event_id: "OBS-000001",
            patient_case_id: "PCR-000001",
            encounter_id: "ENC-100",
            performed_at: "2026-09-07T10:00:00.000Z",
            clinician_id: "STAFF-001",
            observations: { heart_rate_bpm: 92 },
            notes: null,
            downstream_status: "created",
            created_at: "2026-09-07T10:00:00.000Z"
          }
        ]
      }),
      { status: 200 }
    );

  const observations = await listPatientCaseObservations({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(observations.length, 1);
  assert.equal(observations[0].observations.heart_rate_bpm, 92);
});

test("createPatientCaseObservation posts vital_signs and notes", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        observation_event_id: "OBS-000002",
        patient_case_id: "PCR-000001",
        encounter_id: "ENC-100",
        performed_at: "2026-09-07T10:05:00.000Z",
        clinician_id: "STAFF-001",
        observations: { heart_rate_bpm: 88, spo2_pct: 97 },
        notes: "Improving",
        downstream_status: "created",
        created_at: "2026-09-07T10:05:00.000Z"
      }),
      { status: 201 }
    );
  };

  const created = await createPatientCaseObservation({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    vitalSigns: { heart_rate_bpm: 88, spo2_pct: 97 },
    notes: "Improving",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/observations");
  assert.deepEqual(capturedBody, { vital_signs: { heart_rate_bpm: 88, spo2_pct: 97 }, notes: "Improving" });
  assert.equal(created.observation_event_id, "OBS-000002");
});

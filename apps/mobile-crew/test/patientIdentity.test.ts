import assert from "node:assert/strict";
import { test } from "node:test";

import { createPatient, createProvisionalPatient, linkPatientToPatientCase, searchPatients } from "../src/api/patientIdentity.ts";

test("searchPatients posts criteria and returns the match result", async () => {
  let capturedBody: unknown;
  const fetchImpl = async (_url: string, options: any) => {
    capturedBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        match_status: "ambiguous",
        match_confidence: 0.65,
        patient_id: null,
        candidates: [
          { patient_id: "OE-101", display_name: "Alex Doe" },
          { patient_id: "OE-102", display_name: "Alex D." }
        ]
      }),
      { status: 200 }
    );
  };

  const result = await searchPatients({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    criteria: { first_name: "Alex", last_name: "Doe" },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.deepEqual(capturedBody, { first_name: "Alex", last_name: "Doe" });
  assert.equal(result.match_status, "ambiguous");
  assert.equal(result.candidates.length, 2);
});

test("createPatient posts to /api/patients and returns the created patient", async () => {
  let capturedUrl = "";
  const fetchImpl = async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ patient_id: "OE-200", display_name: "Jane Doe" }), { status: 201 });
  };

  const created = await createPatient({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patient: { first_name: "Jane", last_name: "Doe", dob: "1990-01-01" },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patients");
  assert.equal(created.patient_id, "OE-200");
});

test("linkPatientToPatientCase posts verification_status and openemr_patient_id", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ patient_case_id: "PCR-000001", verification_status: "matched_existing", openemr_patient_id: "OE-101" }), {
      status: 200
    });
  };

  const linked = await linkPatientToPatientCase({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    verificationStatus: "matched_existing",
    openemrPatientId: "OE-101",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/patient-link");
  assert.deepEqual(capturedBody, { verification_status: "matched_existing", openemr_patient_id: "OE-101" });
  assert.equal(linked.openemr_patient_id, "OE-101");
});

test("createProvisionalPatient posts to the provisional-patient endpoint", async () => {
  let capturedUrl = "";
  const fetchImpl = async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ patient_case_id: "PCR-000001", openemr_patient_id: "OE-300", verification_status: "provisional" }), {
      status: 201
    });
  };

  const updated = await createProvisionalPatient({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/provisional-patient");
  assert.equal(updated.verification_status, "provisional");
});

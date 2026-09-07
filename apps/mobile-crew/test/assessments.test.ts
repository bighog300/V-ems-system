import assert from "node:assert/strict";
import { test } from "node:test";

import { createPatientCaseAssessment, listPatientCaseAssessments } from "../src/api/assessments.ts";

const SAMPLE_ASSESSMENT = {
  assessment_id: "ASM-000001",
  patient_case_id: "PCR-000001",
  encounter_id: "ENC-100",
  section_type: "primary_survey",
  payload: { notes: "Airway patent, breathing normal" },
  performed_at: "2026-09-07T10:00:00.000Z",
  clinician_id: "STAFF-001",
  created_at: "2026-09-07T10:00:00.000Z"
};

test("listPatientCaseAssessments returns the assessments array", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ assessments: [SAMPLE_ASSESSMENT] }), { status: 200 });
  const assessments = await listPatientCaseAssessments({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(assessments.length, 1);
  assert.equal(assessments[0].section_type, "primary_survey");
});

test("createPatientCaseAssessment posts section_type and wraps notes in payload", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify(SAMPLE_ASSESSMENT), { status: 201 });
  };

  const created = await createPatientCaseAssessment({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    sectionType: "primary_survey",
    notes: "Airway patent, breathing normal",
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/assessments");
  assert.deepEqual(capturedBody, { section_type: "primary_survey", payload: { notes: "Airway patent, breathing normal" } });
  assert.equal(created.assessment_id, "ASM-000001");
});

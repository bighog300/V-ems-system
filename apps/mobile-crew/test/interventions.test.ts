import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPatientCaseMedication,
  createPatientCaseProcedure,
  listPatientCaseMedications,
  listPatientCaseProcedures
} from "../src/api/interventions.ts";

const SAMPLE_MEDICATION = {
  medication_administration_id: "MED-000001",
  patient_case_id: "PCR-000001",
  encounter_id: "ENC-100",
  medication_name: "Aspirin",
  formulation: null,
  dose: "300",
  dose_unit: "mg",
  route: "oral",
  indication: null,
  performed_at: "2026-09-07T10:00:00.000Z",
  clinician_id: "STAFF-001",
  response: null,
  adverse_reaction: null,
  downstream_status: "created",
  created_at: "2026-09-07T10:00:00.000Z"
};

const SAMPLE_PROCEDURE = {
  procedure_id: "PROC-000001",
  patient_case_id: "PCR-000001",
  encounter_id: "ENC-100",
  procedure_type: "airway",
  procedure_name: "OPA insertion",
  performed_at: "2026-09-07T10:00:00.000Z",
  clinician_id: "STAFF-001",
  attempts: 1,
  success: true,
  complications: null,
  response: null,
  downstream_status: "created",
  created_at: "2026-09-07T10:00:00.000Z"
};

test("listPatientCaseMedications returns the medications array", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ medications: [SAMPLE_MEDICATION] }), { status: 200 });
  const medications = await listPatientCaseMedications({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(medications.length, 1);
  assert.equal(medications[0].medication_name, "Aspirin");
});

test("createPatientCaseMedication posts the medication payload", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify(SAMPLE_MEDICATION), { status: 201 });
  };
  const created = await createPatientCaseMedication({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: { medication_name: "Aspirin", dose: "300", dose_unit: "mg", route: "oral" },
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/medications");
  assert.deepEqual(capturedBody, { medication_name: "Aspirin", dose: "300", dose_unit: "mg", route: "oral" });
  assert.equal(created.medication_administration_id, "MED-000001");
});

test("listPatientCaseProcedures returns the procedures array", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ procedures: [SAMPLE_PROCEDURE] }), { status: 200 });
  const procedures = await listPatientCaseProcedures({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(procedures.length, 1);
  assert.equal(procedures[0].procedure_name, "OPA insertion");
});

test("createPatientCaseProcedure posts the procedure payload", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(JSON.stringify(SAMPLE_PROCEDURE), { status: 201 });
  };
  const created = await createPatientCaseProcedure({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: { procedure_type: "airway", procedure_name: "OPA insertion", success: true },
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/procedures");
  assert.deepEqual(capturedBody, { procedure_type: "airway", procedure_name: "OPA insertion", success: true });
  assert.equal(created.procedure_id, "PROC-000001");
});

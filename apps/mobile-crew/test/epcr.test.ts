import assert from "node:assert/strict";
import { test } from "node:test";

import { completeEpcr, getEpcrLifecycle, getEpcrReadiness, listEpcrSignatures, signEpcr, submitEpcr } from "../src/api/epcr.ts";

test("getEpcrReadiness returns the readiness object", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ ready: false, missing: [{ id: "assessment", message: "At least one assessment is required" }], warnings: [], requirements: [] }), {
      status: 200
    });
  const readiness = await getEpcrReadiness({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.missing[0].id, "assessment");
});

test("getEpcrLifecycle returns the current state", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ current_state: "draft", events: [] }), { status: 200 });
  const lifecycle = await getEpcrLifecycle({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(lifecycle.current_state, "draft");
});

test("completeEpcr posts to the complete endpoint", async () => {
  let capturedUrl = "";
  const fetchImpl = async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ lifecycle: { current_state: "crew_complete", events: [] } }), { status: 200 });
  };
  const result = await completeEpcr({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/complete");
  assert.equal(result.lifecycle.current_state, "crew_complete");
});

test("signEpcr posts signer_role and signer_identity", async () => {
  let capturedUrl = "";
  let capturedBody: unknown;
  const fetchImpl = async (url: string, options: any) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify([
        {
          signature_id: "SIG-000001",
          patient_case_id: "PCR-000001",
          version_id: "EPV-1",
          record_hash: "abc123",
          signer_role: "crew_member",
          signer_identity: "STAFF-001",
          signer_display_name: null,
          signed_at: "2026-09-07T12:00:00.000Z",
          acknowledgement: "I attest that this ePCR is accurate to the best of my knowledge."
        }
      ]),
      { status: 201 }
    );
  };

  const signatures = await signEpcr({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    payload: { signer_role: "crew_member", signer_identity: "STAFF-001" },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/signatures");
  assert.deepEqual(capturedBody, { signer_role: "crew_member", signer_identity: "STAFF-001" });
  assert.equal(signatures.length, 1);
  assert.equal(signatures[0].signer_identity, "STAFF-001");
});

test("listEpcrSignatures returns the signatures array", async () => {
  const fetchImpl = async () => new Response(JSON.stringify([]), { status: 200 });
  const signatures = await listEpcrSignatures({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.deepEqual(signatures, []);
});

test("submitEpcr posts to the submit endpoint", async () => {
  let capturedUrl = "";
  const fetchImpl = async (url: string) => {
    capturedUrl = url;
    return new Response(JSON.stringify({ current_state: "submitted", events: [] }), { status: 200 });
  };
  const lifecycle = await submitEpcr({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    patientCaseId: "PCR-000001",
    fetchImpl: fetchImpl as typeof fetch
  });
  assert.equal(capturedUrl, "https://api.example.test/api/patient-cases/PCR-000001/submit");
  assert.equal(lifecycle.current_state, "submitted");
});

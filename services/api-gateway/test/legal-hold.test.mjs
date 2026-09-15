import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../../orchestration/src/index.mjs";
import { createApp } from "../src/server.mjs";

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "vems-legal-hold-api-"));
  const orchestration = new OrchestrationService({ dbPath: join(dir, "platform.sqlite"), objectStorageOptions: { rootDir: join(dir, "object-storage") } });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    orchestration,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      rmSync(dir, { recursive: true, force: true });
    },
    async request(path, method = "GET", payload, headers = {}) {
      const response = await fetch(base + path, {
        method,
        headers: { "content-type": "application/json", "x-user-role": "supervisor", "x-actor-id": "STAFF-001", ...headers },
        ...(payload ? { body: JSON.stringify(payload) } : {})
      });
      return { status: response.status, body: await response.json() };
    }
  };
}

async function createPatientCase(harness) {
  const incident = await harness.request("/api/incidents", "POST", {
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Legal hold test", address: "1 Main St", patient_count: 1 }
  }, { "x-user-role": "dispatcher" });
  const patientCase = await harness.request(`/api/incidents/${incident.body.incident_id}/patient-cases`, "POST", {}, { "x-user-role": "dispatcher" });
  return patientCase.body.patient_case_id;
}

test("PATCH /api/patient-cases/{id}/legal-hold toggles legal hold", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const patientCaseId = await createPatientCase(harness);

  const applied = await harness.request(`/api/patient-cases/${patientCaseId}/legal-hold`, "PATCH", { legal_hold: true, reason: "Litigation hold" });
  assert.equal(applied.status, 200);
  assert.equal(applied.body.legal_hold, 1);

  const released = await harness.request(`/api/patient-cases/${patientCaseId}/legal-hold`, "PATCH", { legal_hold: false });
  assert.equal(released.status, 200);
  assert.equal(released.body.legal_hold, 0);
});

test("PATCH /api/patient-cases/{id}/legal-hold rejects a non-boolean legal_hold as 400", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const patientCaseId = await createPatientCase(harness);

  const response = await harness.request(`/api/patient-cases/${patientCaseId}/legal-hold`, "PATCH", { legal_hold: "yes" });
  assert.equal(response.status, 400);
});

test("RBAC: /api/patient-cases/{id}/legal-hold is narrower than assignment/status -- field_crew_lead is denied", async (t) => {
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = "true";
  const harness = await startServer();
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  t.after(() => harness.close());
  const patientCaseId = await createPatientCase(harness);

  const deniedFieldCrewLead = await harness.request(`/api/patient-cases/${patientCaseId}/legal-hold`, "PATCH", { legal_hold: true }, { "x-user-role": "field_crew_lead" });
  assert.equal(deniedFieldCrewLead.status, 403);

  const deniedClinicalReviewer = await harness.request(`/api/patient-cases/${patientCaseId}/legal-hold`, "PATCH", { legal_hold: true }, { "x-user-role": "clinical_reviewer" });
  assert.equal(deniedClinicalReviewer.status, 403);

  const allowedSupervisor = await harness.request(`/api/patient-cases/${patientCaseId}/legal-hold`, "PATCH", { legal_hold: true }, { "x-user-role": "supervisor" });
  assert.equal(allowedSupervisor.status, 200);

  const allowedSysAdmin = await harness.request(`/api/patient-cases/${patientCaseId}/legal-hold`, "PATCH", { legal_hold: false }, { "x-user-role": "sys_admin" });
  assert.equal(allowedSysAdmin.status, 200);
});

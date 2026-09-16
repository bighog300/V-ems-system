import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../../orchestration/src/index.mjs";
import { createApp } from "../src/server.mjs";

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "vems-patient-history-api-"));
  const orchestration = new OrchestrationService({
    dbPath: join(dir, "platform.sqlite"),
    openemr: {
      createPatient: async () => ({ patient_id: "patient" }),
      getPatientHistory: async () => ({
        as_of: "2026-08-30T00:00:00Z",
        medications: [{ medication_name: "Metformin", dose: "500mg", frequency: "BID", status: "active" }],
        encounters: [{ encounter_date: "2026-07-12", reason: "Chest pain", facility: "General Hospital" }]
      })
    }
  });
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

async function createLinkedPatientCase(harness, { assignCrew } = {}) {
  const incident = await harness.request("/api/incidents", "POST", {
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "History API test", address: "1 Main St", patient_count: 1 }
  }, { "x-user-role": "dispatcher" });
  const incidentId = incident.body.incident_id;

  let assignmentId;
  if (assignCrew) {
    await harness.request("/api/personnel", "POST", { staff_id: "STAFF-900", display_name: "Crew", role: "Paramedic", operational_status: "Available", home_station: "Test" });
    await harness.request("/api/vehicles", "POST", { vehicle_id: "AMB-900", callsign: "Crew 900", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Test" });
    const assignment = await harness.request(`/api/incidents/${incidentId}/assignments`, "POST", { vehicle_id: "AMB-900", crew_ids: ["STAFF-900"], reason: "dispatch" }, { "x-user-role": "dispatcher" });
    assignmentId = assignment.body.assignment_id;
    await harness.request(`/api/assignments/${assignmentId}`, "PATCH", { action: "confirm_assignment" }, { "x-user-role": "dispatcher" });
  }

  const patientCase = await harness.request(`/api/incidents/${incidentId}/patient-cases`, "POST", assignmentId ? { assignment_id: assignmentId } : {}, { "x-user-role": "dispatcher" });
  const patientCaseId = patientCase.body.patient_case_id;
  await harness.request(`/api/patient-cases/${patientCaseId}/patient-link`, "POST", { verification_status: "verified", openemr_patient_id: "OE-9001" });
  return patientCaseId;
}

test("GET /api/patient-cases/{id}/history returns the linked patient's prior medications and encounters", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const patientCaseId = await createLinkedPatientCase(harness);

  const response = await harness.request(`/api/patient-cases/${patientCaseId}/history`);
  assert.equal(response.status, 200);
  assert.equal(response.body.openemr_patient_id, "OE-9001");
  assert.equal(response.body.medications[0].medication_name, "Metformin");
  assert.equal(response.body.encounters[0].facility, "General Hospital");
});

test("GET /api/patient-cases/{id}/history returns 409 when the case has no linked patient", async (t) => {
  const harness = await startServer();
  t.after(() => harness.close());
  const incident = await harness.request("/api/incidents", "POST", {
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "History API test", address: "1 Main St", patient_count: 1 }
  }, { "x-user-role": "dispatcher" });
  const patientCase = await harness.request(`/api/incidents/${incident.body.incident_id}/patient-cases`, "POST", {}, { "x-user-role": "dispatcher" });

  const response = await harness.request(`/api/patient-cases/${patientCase.body.patient_case_id}/history`);
  assert.equal(response.status, 409);
});

test("RBAC: /api/patient-cases/{id}/history is readable by field crew, same as demographics/vitals", async (t) => {
  const priorRbac = process.env.RBAC_ENFORCE;
  process.env.RBAC_ENFORCE = "true";
  const harness = await startServer();
  if (priorRbac === undefined) delete process.env.RBAC_ENFORCE; else process.env.RBAC_ENFORCE = priorRbac;
  t.after(() => harness.close());
  const patientCaseId = await createLinkedPatientCase(harness, { assignCrew: true });

  const allowedFieldCrew = await harness.request(`/api/patient-cases/${patientCaseId}/history`, "GET", undefined, { "x-user-role": "field_crew", "x-actor-id": "STAFF-900" });
  assert.equal(allowedFieldCrew.status, 200);

  const deniedDispatcher = await harness.request(`/api/patient-cases/${patientCaseId}/history`, "GET", undefined, { "x-user-role": "dispatcher" });
  assert.equal(deniedDispatcher.status, 403);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-golden-path-test-"));
  return join(dir, "platform.sqlite");
}

async function startServerWithOpenemrTransport(transport, dbPath = createDbPath()) {
  const orchestration = new OrchestrationService({
    dbPath,
    openemr: {
      searchPatient: (payload) => transport({ method: "searchPatient", payload }),
      createPatient: (payload) => transport({ method: "createPatient", payload }),
      createEncounter: (payload) => transport({ method: "createEncounter", payload }),
      createObservation: (payload) => transport({ method: "createObservation", payload }),
      createIntervention: (payload) => transport({ method: "createIntervention", payload }),
      createHandover: (payload) => transport({ method: "createHandover", payload })
    }
  });

  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function jsonFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

async function createDefaultIncident(base) {
  return jsonFetch(base, "/api/incidents", {
    method: "POST",
    body: JSON.stringify({
      call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
      incident: {
        category: "medical_emergency",
        priority: "critical",
        description: "Severe chest pain",
        address: "Main St",
        patient_count: 1
      }
    })
  });
}

async function transitionIncidentToHandoverComplete(base, incidentId) {
  const actions = [
    "queue_for_dispatch",
    "assign_resource",
    "acknowledge_assignment",
    "depart_to_scene",
    "arrive_scene",
    "begin_treatment",
    "complete_non_transport_handover"
  ];

  for (const action of actions) {
    const response = await jsonFetch(base, `/api/incidents/${incidentId}`, {
      method: "PATCH",
      body: JSON.stringify({ action })
    });
    assert.equal(response.status, 200, `incident action ${action} should succeed`);
  }
}

test("golden path end-to-end: incident can close when assignment is inactive and encounter closure metadata is persisted", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "createEncounter") return { encounter_id: "ENC-GP-001", status: "Open" };
    if (request.method === "createObservation") return { observation_id: "OBS-GP-001", encounter_id: "ENC-GP-001", status: "recorded" };
    if (request.method === "createIntervention") return { intervention_id: "INT-GP-001", encounter_id: "ENC-GP-001", status: "recorded" };
    if (request.method === "createHandover") {
      return {
        handover_id: "HND-GP-001",
        encounter_id: "ENC-GP-001",
        handover_time: request.payload.handover_time,
        disposition: request.payload.disposition,
        handover_status: "Handover Completed"
      };
    }
    return { ok: true };
  });

  try {
    const createdIncident = await createDefaultIncident(base);
    assert.equal(createdIncident.status, 201);
    const incidentId = createdIncident.body.incident_id;

    const createdAssignment = await jsonFetch(base, `/api/incidents/${incidentId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ vehicle_id: "AMB-301", crew_ids: ["STAFF-001", "STAFF-002"], reason: "Critical response" })
    });
    assert.equal(createdAssignment.status, 201);
    const assignmentId = createdAssignment.body.assignment_id;

    for (const action of ["confirm_assignment", "accept_assignment", "mobilise_unit", "activate_assignment", "complete_assignment"]) {
      const response = await jsonFetch(base, `/api/assignments/${assignmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });
      assert.equal(response.status, 200, `assignment action ${action} should succeed`);
    }

    await transitionIncidentToHandoverComplete(base, incidentId);

    const patientLink = await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-GP-001" })
    });
    assert.equal(patientLink.status, 200);

    const encounter = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-GP-001",
        care_started_at: "2026-04-16T10:20:00Z",
        crew_ids: ["STAFF-001", "STAFF-002"],
        presenting_complaint: "Severe chest pain"
      })
    });
    assert.equal(encounter.status, 201);
    assert.equal(encounter.body.encounter_id, "ENC-GP-001");

    const observation = await jsonFetch(base, "/api/encounters/ENC-GP-001/observations", {
      method: "POST",
      body: JSON.stringify({
        recorded_at: "2026-04-16T10:25:00Z",
        source: "manual",
        notes: "Initial assessment",
        vital_signs: { heart_rate_bpm: 110, spo2_pct: 95 }
      })
    });
    assert.equal(observation.status, 201);
    assert.equal(observation.body.observation_id, "OBS-GP-001");

    const intervention = await jsonFetch(base, "/api/encounters/ENC-GP-001/interventions", {
      method: "POST",
      body: JSON.stringify({
        performed_at: "2026-04-16T10:30:00Z",
        type: "medication",
        name: "Aspirin",
        dose: "300mg",
        route: "oral",
        response: "Pain improving"
      })
    });
    assert.equal(intervention.status, 201);
    assert.equal(intervention.body.intervention_id, "INT-GP-001");

    const handover = await jsonFetch(base, "/api/encounters/ENC-GP-001/handover", {
      method: "POST",
      body: JSON.stringify({
        handover_time: "2026-04-16T10:45:00Z",
        destination_facility: "City General",
        receiving_clinician: "Dr. Doe",
        disposition: "transport_to_facility",
        handover_status: "Handover Completed",
        notes: "Transferred with verbal and written handover"
      })
    });
    assert.equal(handover.status, 201);
    assert.equal(handover.body.closure_ready, true);

    const closed = await jsonFetch(base, `/api/incidents/${incidentId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "close_incident" })
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.status, "Closed");
    assert.equal(closed.body.closure_ready, true);
  } finally {
    server.close();
  }
});

test("failure path: incident close rejected when encounter closure metadata has not been persisted", async () => {
  const { server, base } = await startServerWithOpenemrTransport(async (request) => {
    if (request.method === "createEncounter") return { encounter_id: "ENC-FP-001", status: "Open" };
    return { ok: true };
  });

  try {
    const createdIncident = await createDefaultIncident(base);
    assert.equal(createdIncident.status, 201);
    const incidentId = createdIncident.body.incident_id;

    await transitionIncidentToHandoverComplete(base, incidentId);

    const patientLink = await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "verified", openemr_patient_id: "OE-FP-001" })
    });
    assert.equal(patientLink.status, 200);

    const encounter = await jsonFetch(base, `/api/incidents/${incidentId}/encounters`, {
      method: "POST",
      body: JSON.stringify({
        patient_id: "OE-FP-001",
        care_started_at: "2026-04-16T10:20:00Z",
        crew_ids: ["STAFF-010"],
        presenting_complaint: "Shortness of breath"
      })
    });
    assert.equal(encounter.status, 201);

    const closingAttempt = await jsonFetch(base, `/api/incidents/${incidentId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "close_incident" })
    });
    assert.equal(closingAttempt.status, 409);
    assert.equal(closingAttempt.body.error.code, "INVALID_STATUS_TRANSITION");
    assert.equal(
      closingAttempt.body.error.message,
      "Incident cannot close without persisted encounter handover/disposition closure metadata"
    );
  } finally {
    server.close();
  }
});

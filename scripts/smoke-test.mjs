import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:8080";
const enforceRbac = process.env.RBAC_ENFORCE === "true";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

async function run() {
  const health = await request("/health", { method: "GET" });
  assert.equal(health.response.status, 200, "GET /health should return 200");
  assert.equal(health.body.status, "ok", "health payload should include status=ok");

  const incidentPayload = {
    call: {
      call_source: "phone",
      received_at: new Date().toISOString()
    },
    incident: {
      category: "trauma",
      priority: "high",
      description: "Smoke test incident",
      address: "100 Validation Ave",
      patient_count: 1
    }
  };

  const assignmentPayload = {
    vehicle_id: "AMB-321",
    crew_ids: ["STAFF-123"],
    reason: "Smoke test dispatch"
  };

  const patientLinkPayload = {
    verification_status: "provisional",
    match_confidence: 0.45
  };

  if (!enforceRbac) {
    const createdIncident = await request("/api/incidents", {
      method: "POST",
      body: JSON.stringify(incidentPayload),
      headers: {
        "x-correlation-id": "smoke-test-correlation-id",
        "idempotency-key": `smoke-incident-${Date.now()}`
      }
    });
    assert.equal(createdIncident.response.status, 201, "POST /api/incidents should return 201");
    assert.match(createdIncident.body.incident_id, /^INC-\d{6}$/);

    const createAssignment = await request(`/api/incidents/${createdIncident.body.incident_id}/assignments`, {
      method: "POST",
      body: JSON.stringify(assignmentPayload),
      headers: {
        "x-correlation-id": "smoke-test-assignment-correlation-id",
        "idempotency-key": `smoke-assignment-${Date.now()}`
      }
    });
    assert.equal(createAssignment.response.status, 201, "POST assignment should return 201");

    const listIncidents = await request("/api/incidents", { method: "GET" });
    assert.equal(listIncidents.response.status, 200, "GET /api/incidents should return 200");
    assert.ok(Array.isArray(listIncidents.body.incidents), "incidents should be an array");

    console.log("Smoke tests passed (RBAC enforcement disabled).");
    return;
  }

  const roleHeaders = (role, action) => ({
    "x-user-role": role,
    "x-actor-id": `STAFF-${role}-${action}`.replaceAll("_", "-"),
    "x-correlation-id": `smoke-${role}-${action}-${Date.now()}`,
    "idempotency-key": `smoke-${role}-${action}-${Date.now()}`
  });

  const assertStatus = (actual, expected, description, body) => {
    assert.equal(actual, expected, `${description}: expected ${expected}, received ${actual}. body=${JSON.stringify(body)}`);
  };

  const dispatcherIncident = await request("/api/incidents", {
    method: "POST",
    body: JSON.stringify(incidentPayload),
    headers: roleHeaders("dispatcher", "create-incident")
  });
  assertStatus(dispatcherIncident.response.status, 201, "dispatcher should create incident", dispatcherIncident.body);
  assert.match(dispatcherIncident.body.incident_id, /^INC-\d{6}$/);
  const incidentId = dispatcherIncident.body.incident_id;

  const fieldCrewDeniedIncident = await request("/api/incidents", {
    method: "POST",
    body: JSON.stringify(incidentPayload),
    headers: roleHeaders("field_crew", "deny-incident")
  });
  assertStatus(fieldCrewDeniedIncident.response.status, 403, "field_crew should be denied incident create", fieldCrewDeniedIncident.body);
  assert.equal(fieldCrewDeniedIncident.body.error.code, "FORBIDDEN");

  const supervisorIncident = await request("/api/incidents", {
    method: "POST",
    body: JSON.stringify(incidentPayload),
    headers: roleHeaders("supervisor", "create-incident")
  });
  assertStatus(supervisorIncident.response.status, 201, "supervisor should create incident", supervisorIncident.body);

  const dispatcherAssignment = await request(`/api/incidents/${incidentId}/assignments`, {
    method: "POST",
    body: JSON.stringify(assignmentPayload),
    headers: roleHeaders("dispatcher", "create-assignment")
  });
  assertStatus(dispatcherAssignment.response.status, 201, "dispatcher should create assignment", dispatcherAssignment.body);

  const fieldCrewDeniedAssignment = await request(`/api/incidents/${incidentId}/assignments`, {
    method: "POST",
    body: JSON.stringify(assignmentPayload),
    headers: roleHeaders("field_crew", "deny-assignment")
  });
  assertStatus(fieldCrewDeniedAssignment.response.status, 403, "field_crew should be denied assignment create", fieldCrewDeniedAssignment.body);
  assert.equal(fieldCrewDeniedAssignment.body.error.code, "FORBIDDEN");

  const supervisorAssignment = await request(`/api/incidents/${incidentId}/assignments`, {
    method: "POST",
    body: JSON.stringify(assignmentPayload),
    headers: roleHeaders("supervisor", "create-assignment")
  });
  assertStatus(supervisorAssignment.response.status, 201, "supervisor should create assignment", supervisorAssignment.body);

  const fieldCrewPatientLink = await request(`/api/incidents/${incidentId}/patient-link`, {
    method: "POST",
    body: JSON.stringify(patientLinkPayload),
    headers: roleHeaders("field_crew", "link-patient")
  });
  assertStatus(fieldCrewPatientLink.response.status, 200, "field_crew should link patient context", fieldCrewPatientLink.body);

  const supervisorPatientLink = await request(`/api/incidents/${incidentId}/patient-link`, {
    method: "POST",
    body: JSON.stringify(patientLinkPayload),
    headers: roleHeaders("supervisor", "link-patient")
  });
  assertStatus(supervisorPatientLink.response.status, 200, "supervisor should link patient context", supervisorPatientLink.body);

  const listIncidents = await request("/api/incidents", { method: "GET" });
  assert.equal(listIncidents.response.status, 200, "GET /api/incidents should return 200");
  assert.ok(Array.isArray(listIncidents.body.incidents), "incidents should be an array");

  console.log("Smoke tests passed (RBAC enforcement enabled with role-aware checks).");
}

run().catch((error) => {
  console.error("Smoke tests failed:", error);
  process.exitCode = 1;
});

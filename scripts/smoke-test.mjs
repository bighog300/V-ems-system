import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:8080";

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

  const listIncidents = await request("/api/incidents", { method: "GET" });
  assert.equal(listIncidents.response.status, 200, "GET /api/incidents should return 200");
  assert.ok(Array.isArray(listIncidents.body.incidents), "incidents should be an array");

  const assignmentPayload = {
    vehicle_id: "AMB-321",
    crew_ids: ["STAFF-123"],
    reason: "Smoke test dispatch"
  };
  const createAssignment = await request(`/api/incidents/${createdIncident.body.incident_id}/assignments`, {
    method: "POST",
    body: JSON.stringify(assignmentPayload),
    headers: {
      "x-correlation-id": "smoke-test-assignment-correlation-id",
      "idempotency-key": `smoke-assignment-${Date.now()}`
    }
  });
  assert.equal(createAssignment.response.status, 201, "POST assignment should return 201");

  console.log("Smoke tests passed.");
}

run().catch((error) => {
  console.error("Smoke tests failed:", error);
  process.exitCode = 1;
});

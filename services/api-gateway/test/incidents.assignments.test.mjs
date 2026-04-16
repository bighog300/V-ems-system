import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.mjs";

async function startServer() {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

async function jsonFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options
  });
  return { status: response.status, body: await response.json() };
}

test("valid incident transitions", async () => {
  const { server, base } = await startServer();
  try {
    const created = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
      })
    });
    assert.equal(created.status, 201);
    const id = created.body.incident_id;

    const queued = await jsonFetch(base, `/api/incidents/${id}`, { method: "PATCH", body: JSON.stringify({ action: "queue_for_dispatch" }) });
    assert.equal(queued.status, 200);
    assert.equal(queued.body.status, "Awaiting Dispatch");

    const assigned = await jsonFetch(base, `/api/incidents/${id}`, { method: "PATCH", body: JSON.stringify({ action: "assign_resource" }) });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.status, "Assigned");
  } finally {
    server.close();
  }
});

test("invalid incident transition is rejected", async () => {
  const { server, base } = await startServer();
  try {
    const created = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
      })
    });

    const invalid = await jsonFetch(base, `/api/incidents/${created.body.incident_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "close_incident" })
    });

    assert.equal(invalid.status, 409);
    assert.equal(invalid.body.error.code, "INVALID_STATUS_TRANSITION");
  } finally {
    server.close();
  }
});

test("assignment transition valid and invalid", async () => {
  const { server, base } = await startServer();
  try {
    const created = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "trauma", priority: "high", description: "Fall injury", address: "Hill Rd", patient_count: 1 }
      })
    });

    const assignment = await jsonFetch(base, `/api/incidents/${created.body.incident_id}/assignments`, {
      method: "POST",
      body: JSON.stringify({ vehicle_id: "AMB-301", crew_ids: ["STAFF-001", "STAFF-002"], reason: "Dispatch" })
    });
    assert.equal(assignment.status, 201);
    assert.equal(assignment.body.status, "Proposed");

    const confirmed = await jsonFetch(base, `/api/assignments/${assignment.body.assignment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm_assignment" })
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.status, "Assigned");

    const invalid = await jsonFetch(base, `/api/assignments/${assignment.body.assignment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "complete_assignment" })
    });
    assert.equal(invalid.status, 409);
    assert.equal(invalid.body.error.code, "INVALID_STATUS_TRANSITION");
  } finally {
    server.close();
  }
});

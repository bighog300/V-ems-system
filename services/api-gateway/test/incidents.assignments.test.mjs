import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-test-"));
  return join(dir, "platform.sqlite");
}

async function startServer(dbPath = createDbPath()) {
  const orchestration = new OrchestrationService({ dbPath });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, orchestration, dbPath, base: `http://127.0.0.1:${port}` };
}

async function jsonFetch(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    ...options
  });
  return { status: response.status, body: await response.json() };
}

async function createDefaultIncident(base, headers = {}) {
  return jsonFetch(base, "/api/incidents", {
    method: "POST",
    headers,
    body: JSON.stringify({
      call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
      incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
    })
  });
}

test("persistence-backed incident lifecycle", async () => {
  const dbPath = createDbPath();
  const first = await startServer(dbPath);
  let incidentId;
  try {
    const created = await createDefaultIncident(first.base);
    assert.equal(created.status, 201);
    incidentId = created.body.incident_id;

    const queued = await jsonFetch(first.base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "queue_for_dispatch" }) });
    assert.equal(queued.status, 200);
    assert.equal(queued.body.status, "Awaiting Dispatch");
  } finally {
    first.server.close();
  }

  const second = await startServer(dbPath);
  try {
    const loaded = await jsonFetch(second.base, `/api/incidents/${incidentId}`, { method: "GET" });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.status, "Awaiting Dispatch");
  } finally {
    second.server.close();
  }
});

test("persistence-backed assignment lifecycle", async () => {
  const { server, base } = await startServer();
  try {
    const created = await createDefaultIncident(base);
    const assignment = await jsonFetch(base, `/api/incidents/${created.body.incident_id}/assignments`, {
      method: "POST",
      body: JSON.stringify({ vehicle_id: "AMB-301", crew_ids: ["STAFF-001", "STAFF-002"], reason: "Dispatch" })
    });
    assert.equal(assignment.status, 201);

    const confirmed = await jsonFetch(base, `/api/assignments/${assignment.body.assignment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm_assignment" })
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.status, "Assigned");

    const accepted = await jsonFetch(base, `/api/assignments/${assignment.body.assignment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "accept_assignment" })
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, "Accepted");
  } finally {
    server.close();
  }
});

test("idempotency on create endpoints", async () => {
  const { server, base } = await startServer();
  try {
    const incidentA = await createDefaultIncident(base, { "idempotency-key": "incident-1" });
    const incidentB = await createDefaultIncident(base, { "idempotency-key": "incident-1" });
    assert.equal(incidentA.status, 201);
    assert.equal(incidentB.status, 201);
    assert.equal(incidentA.body.incident_id, incidentB.body.incident_id);

    const assignmentA = await jsonFetch(base, `/api/incidents/${incidentA.body.incident_id}/assignments`, {
      method: "POST",
      headers: { "idempotency-key": "assignment-1" },
      body: JSON.stringify({ vehicle_id: "AMB-301", crew_ids: ["STAFF-001"], reason: "Dispatch" })
    });
    const assignmentB = await jsonFetch(base, `/api/incidents/${incidentA.body.incident_id}/assignments`, {
      method: "POST",
      headers: { "idempotency-key": "assignment-1" },
      body: JSON.stringify({ vehicle_id: "AMB-301", crew_ids: ["STAFF-001"], reason: "Dispatch" })
    });
    assert.equal(assignmentA.status, 201);
    assert.equal(assignmentB.status, 201);
    assert.equal(assignmentA.body.assignment_id, assignmentB.body.assignment_id);
  } finally {
    server.close();
  }
});

test("incident close rejection with active assignments", async () => {
  const { server, base } = await startServer();
  try {
    const created = await createDefaultIncident(base);
    const incidentId = created.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "queue_for_dispatch" }) });
    await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "assign_resource" }) });

    const assignment = await jsonFetch(base, `/api/incidents/${incidentId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ vehicle_id: "AMB-302", crew_ids: ["STAFF-010"], reason: "Dispatch" })
    });
    await jsonFetch(base, `/api/assignments/${assignment.body.assignment_id}`, { method: "PATCH", body: JSON.stringify({ action: "confirm_assignment" }) });

    await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "acknowledge_assignment" }) });
    await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "depart_to_scene" }) });
    await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "arrive_scene" }) });
    await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "begin_treatment" }) });
    await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "complete_non_transport_handover" }) });

    const closing = await jsonFetch(base, `/api/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify({ action: "close_incident" }) });
    assert.equal(closing.status, 409);
    assert.equal(closing.body.error.code, "INVALID_STATUS_TRANSITION");
  } finally {
    server.close();
  }
});

test("outbox event creation", async () => {
  const { server, base, orchestration } = await startServer();
  try {
    const incident = await createDefaultIncident(base, { "idempotency-key": "outbox-incident" });
    await jsonFetch(base, `/api/incidents/${incident.body.incident_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "queue_for_dispatch" })
    });

    const assignment = await jsonFetch(base, `/api/incidents/${incident.body.incident_id}/assignments`, {
      method: "POST",
      headers: { "idempotency-key": "outbox-assignment" },
      body: JSON.stringify({ vehicle_id: "AMB-399", crew_ids: ["STAFF-101"], reason: "Dispatch" })
    });
    await jsonFetch(base, `/api/assignments/${assignment.body.assignment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm_assignment" })
    });

    const events = orchestration.listOutboxEvents();
    assert.ok(events.length >= 4);
    assert.ok(events.some((e) => e.event_type === "IncidentCreated"));
    assert.ok(events.some((e) => e.event_type === "IncidentUpdated"));
    assert.ok(events.some((e) => e.event_type === "AssignmentCreated"));
  } finally {
    server.close();
  }
});

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
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

async function createDefaultIncident(base) {
  return jsonFetch(base, "/api/incidents", {
    method: "POST",
    body: JSON.stringify({
      call: { call_source: "phone", received_at: "2026-09-07T10:00:00Z" },
      incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
    })
  });
}

test("GET /api/assignments/mine returns only the caller's active assignments", async () => {
  const { server, base } = await startServer();
  try {
    const incidentA = await createDefaultIncident(base);
    const assignmentA = await jsonFetch(base, `/api/incidents/${incidentA.body.incident_id}/assignments`, {
      method: "POST",
      body: JSON.stringify({ vehicle_id: "AMB-901", crew_ids: ["STAFF-001", "STAFF-002"], reason: "Dispatch" })
    });
    await jsonFetch(base, `/api/assignments/${assignmentA.body.assignment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm_assignment" })
    });

    const incidentB = await createDefaultIncident(base);
    const assignmentB = await jsonFetch(base, `/api/incidents/${incidentB.body.incident_id}/assignments`, {
      method: "POST",
      body: JSON.stringify({ vehicle_id: "AMB-902", crew_ids: ["STAFF-003"], reason: "Dispatch" })
    });
    await jsonFetch(base, `/api/assignments/${assignmentB.body.assignment_id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "confirm_assignment" })
    });

    const mine = await jsonFetch(base, "/api/assignments/mine", {
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-001" }
    });

    assert.equal(mine.status, 200);
    assert.equal(mine.body.assignments.length, 1);
    assert.equal(mine.body.assignments[0].assignment_id, assignmentA.body.assignment_id);
    assert.equal(mine.body.assignments[0].incident.incident_id, incidentA.body.incident_id);
  } finally {
    server.close();
  }
});

test("GET /api/assignments/mine returns an empty list for a crew member with no assignments", async () => {
  const { server, base } = await startServer();
  try {
    const mine = await jsonFetch(base, "/api/assignments/mine", {
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-404" }
    });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.assignments, []);
  } finally {
    server.close();
  }
});

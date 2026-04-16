import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-contract-test-"));
  return join(dir, "platform.sqlite");
}

async function startServer() {
  const orchestration = new OrchestrationService({ dbPath: createDbPath() });
  const server = createApp(orchestration);
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

async function createDefaultIncident(base) {
  return jsonFetch(base, "/api/incidents", {
    method: "POST",
    body: JSON.stringify({
      call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
      incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
    })
  });
}

function assertStructuredErrorEnvelope(response, expectedCode) {
  assert.equal(typeof response.body, "object");
  assert.equal(typeof response.body.error, "object");
  assert.equal(response.body.error.code, expectedCode);
  assert.equal(typeof response.body.error.message, "string");
  assert.equal(typeof response.body.error.retryable, "boolean");
  assert.match(response.body.error.correlation_id, /^[0-9a-f-]{36}$/i);
}

test("contract: GET /api/incidents/{incidentId}/assignments returns AssignmentListResponse shape on 200", async () => {
  const { server, base } = await startServer();
  try {
    const created = await createDefaultIncident(base);
    const incidentId = created.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ vehicle_id: "AMB-901", crew_ids: ["STAFF-111", "STAFF-222"], reason: "Primary dispatch" })
    });

    const readResponse = await jsonFetch(base, `/api/incidents/${incidentId}/assignments`);
    assert.equal(readResponse.status, 200);
    assert.match(readResponse.body.incident_id, /^INC-[0-9]{6}$/);
    assert.ok(Array.isArray(readResponse.body.assignments));
    assert.equal(readResponse.body.assignments.length, 1);

    const [assignment] = readResponse.body.assignments;
    assert.match(assignment.assignment_id, /^ASN-[0-9]{6}$/);
    assert.equal(typeof assignment.status, "string");
    assert.equal(typeof assignment.vehicle_status, "string");
    assert.match(assignment.vehicle_id, /^AMB-[0-9]{3,}$/);
    assert.ok(Array.isArray(assignment.crew_ids));
    assert.ok(assignment.crew_ids.every((id) => /^STAFF-[0-9]{3,}$/.test(id)));
    assert.equal(typeof assignment.reason, "string");
    assert.equal(Number.isNaN(Date.parse(assignment.updated_at)), false);
  } finally {
    server.close();
  }
});

test("contract: GET /api/incidents/{incidentId}/assignments returns structured 404 envelope", async () => {
  const { server, base } = await startServer();
  try {
    const created = await createDefaultIncident(base);
    const readResponse = await jsonFetch(base, `/api/incidents/${created.body.incident_id}/assignments`);

    assert.equal(readResponse.status, 404);
    assertStructuredErrorEnvelope(readResponse, "NOT_FOUND");
  } finally {
    server.close();
  }
});

test("contract: GET /api/incidents/{incidentId}/patient-link returns PatientLinkReadResponse shape on 200", async () => {
  const { server, base } = await startServer();
  try {
    const created = await createDefaultIncident(base);
    const incidentId = created.body.incident_id;

    await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`, {
      method: "POST",
      body: JSON.stringify({ verification_status: "provisional", temporary_label: "Unknown Male" })
    });

    const readResponse = await jsonFetch(base, `/api/incidents/${incidentId}/patient-link`);
    assert.equal(readResponse.status, 200);
    assert.match(readResponse.body.incident_id, /^INC-[0-9]{6}$/);
    assert.equal(typeof readResponse.body.verification_status, "string");
    assert.equal(Number.isNaN(Date.parse(readResponse.body.updated_at)), false);
    assert.equal(readResponse.body.openemr_patient_id, null);
    assert.equal(typeof readResponse.body.temporary_label, "string");
  } finally {
    server.close();
  }
});

test("contract: GET /api/incidents/{incidentId}/patient-link returns structured 404 envelope", async () => {
  const { server, base } = await startServer();
  try {
    const created = await createDefaultIncident(base);
    const readResponse = await jsonFetch(base, `/api/incidents/${created.body.incident_id}/patient-link`);

    assert.equal(readResponse.status, 404);
    assertStructuredErrorEnvelope(readResponse, "NOT_FOUND");
  } finally {
    server.close();
  }
});

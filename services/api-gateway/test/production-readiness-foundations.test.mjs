import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-prf-test-"));
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

  return {
    status: response.status,
    headers: response.headers,
    body: await response.json()
  };
}

test("response includes correlation and request identifiers", async () => {
  const { server, base } = await startServer();

  try {
    const response = await jsonFetch(base, "/api/incidents", { method: "GET" });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("x-correlation-id"));
    assert.ok(response.headers.get("x-request-id"));
  } finally {
    server.close();
  }
});

test("rbac policy is enforced for write endpoints when enabled", async () => {
  process.env.RBAC_ENFORCE = "true";
  const { server, base } = await startServer();

  try {
    const denied = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-333" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
      })
    });

    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "FORBIDDEN");

    const allowed = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-444" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
      })
    });

    assert.equal(allowed.status, 201);
    assert.ok(allowed.body.incident_id);
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
  }
});

test("rbac policy extends to clinical write routes using adapter-safe deterministic outcomes", async () => {
  process.env.RBAC_ENFORCE = "true";
  const { server, base } = await startServer();

  try {
    const incident = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-445" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Stroke signs", address: "Main St", patient_count: 1 }
      })
    });
    assert.equal(incident.status, 201);

    const deniedEncounter = await jsonFetch(base, `/api/incidents/${incident.body.incident_id}/encounters`, {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-445" },
      body: JSON.stringify({
        patient_id: "PAT-RBAC-001",
        care_started_at: "2026-04-16T10:05:00Z",
        crew_ids: ["STAFF-123"],
        presenting_complaint: "Stroke signs"
      })
    });
    assert.equal(deniedEncounter.status, 403);
    assert.equal(deniedEncounter.body.error.code, "FORBIDDEN");

    const allowedEncounter = await jsonFetch(base, `/api/incidents/${incident.body.incident_id}/encounters`, {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-123" },
      body: JSON.stringify({
        patient_id: "PAT-RBAC-001",
        care_started_at: "2026-04-16T10:05:00Z",
        crew_ids: ["STAFF-123"],
        presenting_complaint: "Stroke signs"
      })
    });
    assert.equal(allowedEncounter.status, 409);
    assert.equal(allowedEncounter.body.error.code, "CONFLICT");

    const deniedObservation = await jsonFetch(base, "/api/encounters/ENC-RBAC-001/observations", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-445" },
      body: JSON.stringify({
        recorded_at: "2026-04-16T10:10:00Z",
        source: "manual",
        vital_signs: { heart_rate_bpm: 88 }
      })
    });
    assert.equal(deniedObservation.status, 403);
    assert.equal(deniedObservation.body.error.code, "FORBIDDEN");

    const allowedObservation = await jsonFetch(base, "/api/encounters/ENC-RBAC-001/observations", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-123" },
      body: JSON.stringify({
        recorded_at: "2026-04-16T10:10:00Z",
        source: "manual",
        vital_signs: { heart_rate_bpm: 88 }
      })
    });
    assert.equal(allowedObservation.status, 404);
    assert.equal(allowedObservation.body.error.code, "NOT_FOUND");

    const deniedIntervention = await jsonFetch(base, "/api/encounters/ENC-RBAC-001/interventions", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-445" },
      body: JSON.stringify({
        performed_at: "2026-04-16T10:12:00Z",
        type: "procedure",
        name: "Airway positioning",
        response: "Improved respiratory effort"
      })
    });
    assert.equal(deniedIntervention.status, 403);
    assert.equal(deniedIntervention.body.error.code, "FORBIDDEN");

    const allowedIntervention = await jsonFetch(base, "/api/encounters/ENC-RBAC-001/interventions", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-123" },
      body: JSON.stringify({
        performed_at: "2026-04-16T10:12:00Z",
        type: "procedure",
        name: "Airway positioning",
        response: "Improved respiratory effort"
      })
    });
    assert.equal(allowedIntervention.status, 404);
    assert.equal(allowedIntervention.body.error.code, "NOT_FOUND");

    const deniedHandover = await jsonFetch(base, "/api/encounters/ENC-RBAC-001/handover", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-445" },
      body: JSON.stringify({
        handover_time: "2026-04-16T10:20:00Z",
        disposition: "transferred_to_ed",
        handover_status: "Handover Completed",
        destination_facility: "General Hospital",
        receiving_clinician: "Dr Rivera",
        notes: "Neurology review requested"
      })
    });
    assert.equal(deniedHandover.status, 403);
    assert.equal(deniedHandover.body.error.code, "FORBIDDEN");

    const allowedHandover = await jsonFetch(base, "/api/encounters/ENC-RBAC-001/handover", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-123" },
      body: JSON.stringify({
        handover_time: "2026-04-16T10:20:00Z",
        disposition: "transferred_to_ed",
        handover_status: "Handover Completed",
        destination_facility: "General Hospital",
        receiving_clinician: "Dr Rivera",
        notes: "Neurology review requested"
      })
    });
    assert.equal(allowedHandover.status, 404);
    assert.equal(allowedHandover.body.error.code, "NOT_FOUND");
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
  }
});

test("rbac enforcement can be disabled for local development safety", async () => {
  process.env.RBAC_ENFORCE = "false";
  const { server, base } = await startServer();

  try {
    const response = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-333" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Chest pain", address: "Main St", patient_count: 1 }
      })
    });

    assert.equal(response.status, 201);
    assert.ok(response.body.incident_id);
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
  }
});

test("readiness endpoint provides supportability snapshot", async () => {
  const { server, base } = await startServer();

  try {
    const report = await jsonFetch(base, "/api/support/readiness", { method: "GET" });
    assert.equal(report.status, 200);
    assert.equal(report.body.production_readiness.structured_logging, true);
    assert.equal(report.body.production_readiness.correlation_headers, true);
    assert.ok(report.body.incident_snapshot);
  } finally {
    server.close();
  }
});

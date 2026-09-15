import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHmac } from "node:crypto";
import { createApp } from "../src/server.mjs";
import { OrchestrationService } from "../../orchestration/src/index.mjs";

function newOrchestration() {
  return new OrchestrationService({ dbPath: createDbPath() });
}



function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64url");
}

function signToken({ role = "dispatcher", actorId = "STAFF-TEST" } = {}) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    sub: actorId,
    role,
    iss: "vems-tests",
    aud: "vems-platform",
    exp: Math.floor(Date.now() / 1000) + 3600
  }));
  const signature = createHmac("sha256", process.env.JWT_HS256_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-prf-test-"));
  return join(dir, "platform.sqlite");
}

async function startServer() {
  // Not "test-secret" -- milestone 12f's production-secrets checks treat
  // that as an insecure placeholder, and some tests below run under
  // APP_ENV=production.
  process.env.JWT_HS256_SECRET = "k3y-8f2a91c7-9d4b-4e11-b6a2-7c5d0e1f2a3b";
  process.env.JWT_ISSUER = "vems-tests";
  process.env.JWT_AUDIENCE = "vems-platform";
  const orchestration = new OrchestrationService({ dbPath: createDbPath() });
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { server, orchestration, base: `http://127.0.0.1:${port}` };
}

async function jsonFetch(base, path, options = {}) {
  const rawHeaders = { ...(options.headers ?? {}) };
  const role = rawHeaders["x-user-role"] ?? "dispatcher";
  const actorId = rawHeaders["x-actor-id"] ?? "STAFF-TEST";
  delete rawHeaders["x-user-role"];
  delete rawHeaders["x-actor-id"];

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${signToken({ role, actorId })}`,
      ...rawHeaders
    }
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

test("rbac policy is enforced for sensitive read endpoints when enabled", async () => {
  process.env.RBAC_ENFORCE = "true";
  const { server, base } = await startServer();

  try {
    const created = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-901" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "RBAC read", address: "Main St", patient_count: 1 }
      })
    });
    assert.equal(created.status, 201);

    const deniedIncidents = await jsonFetch(base, "/api/incidents", {
      method: "GET",
      headers: { "x-user-role": "field_crew", "x-actor-id": "STAFF-902" }
    });
    assert.equal(deniedIncidents.status, 403);

    const allowedIncidents = await jsonFetch(base, "/api/incidents", {
      method: "GET",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-901" }
    });
    assert.equal(allowedIncidents.status, 200);

    const deniedPatientLinkRead = await jsonFetch(base, `/api/incidents/${created.body.incident_id}/patient-link`, {
      method: "GET",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-901" }
    });
    assert.equal(deniedPatientLinkRead.status, 403);

    const allowedPatientLinkRead = await jsonFetch(base, `/api/incidents/${created.body.incident_id}/patient-link`, {
      method: "GET",
      headers: { "x-user-role": "supervisor", "x-actor-id": "STAFF-903" }
    });
    assert.equal(allowedPatientLinkRead.status, 404);
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
  }
});

test("json endpoints reject unsupported content types with 415", async () => {
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/api/incidents`, {
      method: "POST",
      headers: { "content-type": "text/plain", authorization: `Bearer ${signToken({ role: "dispatcher", actorId: "STAFF-904" })}` },
      body: "not-json"
    });
    const body = await response.json();
    assert.equal(response.status, 415);
    assert.equal(body.error.code, "UNSUPPORTED_MEDIA_TYPE");
  } finally {
    server.close();
  }
});

test("json endpoints reject oversized payloads with 413", async () => {
  process.env.JSON_BODY_MAX_BYTES = "64";
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/api/incidents`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${signToken({ role: "dispatcher", actorId: "STAFF-905" })}` },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "x".repeat(200), address: "Main St", patient_count: 1 }
      })
    });
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.equal(body.error.code, "PAYLOAD_TOO_LARGE");
  } finally {
    server.close();
    delete process.env.JSON_BODY_MAX_BYTES;
  }
});

test("json endpoints preserve malformed JSON behavior with 400", async () => {
  const { server, base } = await startServer();
  try {
    const response = await fetch(`${base}/api/incidents`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${signToken({ role: "dispatcher", actorId: "STAFF-906" })}` },
      body: "{\"call\":"
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_PAYLOAD");
  } finally {
    server.close();
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
  process.env.APP_ENV = "staging";
  process.env.APP_PROFILE = "ops";
  process.env.RBAC_ENFORCE = "true";
  process.env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED = "true";
  process.env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY = "false";
  process.env.READINESS_MODE = "smoke";
  process.env.UPSTREAM_CONNECTIVITY_LAST_VALIDATED_AT = "2026-04-16T10:30:00Z";
  process.env.UPSTREAM_CONNECTIVITY_LAST_RESULT = "ok";
  const { server, base } = await startServer();

  try {
    const report = await jsonFetch(base, "/api/support/readiness", { method: "GET" });
    assert.equal(report.status, 200);
    assert.equal(report.body.production_readiness.structured_logging, true);
    assert.equal(report.body.production_readiness.correlation_headers, true);
    assert.equal(report.body.production_readiness.rbac_enforced, true);
    assert.deepEqual(report.body.diagnostics.environment, { app_env: "staging", profile: "ops" });
    assert.deepEqual(report.body.diagnostics.controls, {
      rbac_enforced: true,
      upstream_connectivity_validation_enabled: true
    });
    assert.deepEqual(report.body.diagnostics.modes, {
      smoke_include_upstream_connectivity: false,
      readiness_mode: "smoke"
    });
    assert.deepEqual(report.body.diagnostics.last_validation, {
      at: "2026-04-16T10:30:00Z",
      result: "ok"
    });
    assert.ok(report.body.incident_snapshot);
    // Stage 12 milestone 12h: live dependency health, not just static config.
    // UPSTREAM_CONNECTIVITY_CHECKS_ENABLED is true here but no
    // VTIGER_BASE_URL/OPENEMR_BASE_URL is configured, so those two stay
    // unchecked -- only database/object storage (always checked, both
    // local) count toward healthy.
    assert.equal(report.body.healthy, true);
    assert.equal(report.body.dependencies.database.ok, true);
    assert.equal(report.body.dependencies.database.dialect, "sqlite");
    assert.equal(report.body.dependencies.object_storage.ok, true);
    assert.equal(report.body.dependencies.vtiger.checked, false);
    assert.equal(report.body.dependencies.openemr.checked, false);
  } finally {
    server.close();
    delete process.env.APP_ENV;
    delete process.env.APP_PROFILE;
    delete process.env.RBAC_ENFORCE;
    delete process.env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED;
    delete process.env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY;
    delete process.env.READINESS_MODE;
    delete process.env.UPSTREAM_CONNECTIVITY_LAST_VALIDATED_AT;
    delete process.env.UPSTREAM_CONNECTIVITY_LAST_RESULT;
  }
});

test("readiness endpoint returns 503 and reports which dependency is unhealthy", async () => {
  const { server, orchestration, base } = await startServer();

  try {
    // Simulate the database becoming unreachable without depending on
    // node:sqlite's own close/error behavior -- the same live "SELECT 1;"
    // probe path a real outage would hit. Every other queryOne caller on
    // this request path (e.g. the access-revocation check) must keep
    // working, so only the readiness probe's own query is made to fail.
    const originalQueryOne = orchestration.db.queryOne.bind(orchestration.db);
    orchestration.db.queryOne = async (sql) => {
      if (sql === "SELECT 1;") throw new Error("simulated db failure");
      return originalQueryOne(sql);
    };

    const report = await jsonFetch(base, "/api/support/readiness", { method: "GET" });
    assert.equal(report.status, 503);
    assert.equal(report.body.healthy, false);
    assert.equal(report.body.dependencies.healthy, false);
    assert.equal(report.body.dependencies.database.ok, false);
    assert.ok(report.body.dependencies.database.error);
  } finally {
    server.close();
  }
});

test("readiness diagnostics use safe defaults when optional env values are unset", async () => {
  process.env.RBAC_ENFORCE = "false";
  process.env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY = "false";
  delete process.env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED;
  delete process.env.UPSTREAM_CONNECTIVITY_LAST_VALIDATED_AT;
  delete process.env.UPSTREAM_CONNECTIVITY_LAST_RESULT;
  delete process.env.READINESS_MODE;
  delete process.env.APP_ENV;
  delete process.env.APP_PROFILE;

  const { server, base } = await startServer();

  try {
    const report = await jsonFetch(base, "/api/support/readiness", { method: "GET" });
    assert.equal(report.status, 200);
    assert.deepEqual(report.body.diagnostics.environment, { app_env: "development", profile: "default" });
    assert.deepEqual(report.body.diagnostics.controls, {
      rbac_enforced: false,
      upstream_connectivity_validation_enabled: false
    });
    assert.deepEqual(report.body.diagnostics.modes, {
      smoke_include_upstream_connectivity: false,
      readiness_mode: null
    });
    assert.equal(report.body.diagnostics.last_validation, null);
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
    delete process.env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY;
  }
});

test("internal metrics endpoint exposes request counters and latency summary in development", async () => {
  delete process.env.APP_ENV;
  delete process.env.INTERNAL_METRICS_ENABLED;
  const { server, base } = await startServer();

  try {
    await jsonFetch(base, "/api/incidents", { method: "GET" });
    await jsonFetch(base, "/api/does-not-exist", { method: "GET" });

    const report = await jsonFetch(base, "/api/support/metrics", { method: "GET" });
    assert.equal(report.status, 200);
    assert.equal(report.body.api_gateway.request_count, 2);
    assert.equal(report.body.api_gateway.request_failures, 1);
    assert.equal(report.body.api_gateway.latency_ms.count, 2);
    assert.equal(typeof report.body.api_gateway.latency_ms.avg, "number");
    assert.equal(report.body.api_gateway.by_route["GET /api/incidents"].request_count, 1);
    assert.equal(report.body.api_gateway.by_route["GET /api/does-not-exist"].request_failures, 1);
  } finally {
    server.close();
  }
});

test("metrics endpoint remains disabled by default in production", async () => {
  process.env.APP_ENV = "production";
  delete process.env.INTERNAL_METRICS_ENABLED;
  // Milestone 12f's production-secrets checks also reject a missing/default
  // object-storage key once APP_ENV=production, so this test needs a
  // real-looking one to get past startup and exercise the actual thing
  // it's testing (the metrics endpoint's own default-off gate).
  process.env.VEMS_OBJECT_STORAGE_KEY = "a".repeat(64);
  const { server, base } = await startServer();

  try {
    const response = await jsonFetch(base, "/api/support/metrics", { method: "GET" });
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "NOT_FOUND");
  } finally {
    server.close();
    delete process.env.APP_ENV;
    delete process.env.VEMS_OBJECT_STORAGE_KEY;
  }
});

test("support diagnostics endpoint requires admin/operator role when rbac is enabled", async () => {
  process.env.RBAC_ENFORCE = "true";
  const { server, base } = await startServer();

  try {
    const denied = await jsonFetch(base, "/api/support/diagnostics", { method: "GET" });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "FORBIDDEN");

    const allowed = await jsonFetch(base, "/api/support/diagnostics", {
      method: "GET",
      headers: { "x-user-role": "supervisor", "x-actor-id": "STAFF-OPS-1" }
    });
    assert.equal(allowed.status, 200);
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
  }
});

test("support diagnostics exposes readiness, metrics, and failed sync intent visibility", async () => {
  process.env.RBAC_ENFORCE = "true";
  process.env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED = "true";
  process.env.UPSTREAM_CONNECTIVITY_LAST_VALIDATED_AT = "2026-04-16T11:45:00Z";
  process.env.UPSTREAM_CONNECTIVITY_LAST_RESULT = "degraded";

  const { server, base, orchestration } = await startServer();

  try {
    const created = await jsonFetch(base, "/api/incidents", {
      method: "POST",
      headers: { "x-user-role": "dispatcher", "x-actor-id": "STAFF-DISP-1" },
      body: JSON.stringify({
        call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
        incident: { category: "medical_emergency", priority: "critical", description: "Breathing difficulty", address: "Main St", patient_count: 1 }
      })
    });
    assert.equal(created.status, 201);

    const queuedIntent = (await orchestration.syncIntents.listAll())[0];
    await orchestration.syncIntents.markFailed(queuedIntent.intent_id, {
      status: "pending",
      attempt_count: 2,
      last_error: "Vtiger endpoint timeout",
      last_error_classification: "DOWNSTREAM_TIMEOUT",
      dead_lettered_at: null
    });

    await orchestration.syncIntents.markFailed(queuedIntent.intent_id, {
      status: "dead_lettered",
      attempt_count: 3,
      last_error: "Vtiger endpoint unavailable after retry limit",
      last_error_classification: "DOWNSTREAM_UNAVAILABLE",
      dead_lettered_at: "2026-04-16T11:40:00Z"
    });

    const diagnostics = await jsonFetch(base, "/api/support/diagnostics", {
      method: "GET",
      headers: { "x-user-role": "operations_manager", "x-actor-id": "STAFF-OPS-2" }
    });
    assert.equal(diagnostics.status, 200);
    assert.equal(diagnostics.body.readiness_summary.production_readiness.rbac_enforced, true);
    assert.equal(diagnostics.body.metrics_summary.request_count >= 1, true);
    assert.equal(diagnostics.body.sync_intent_summary.totals.dead_lettered, 1);
    assert.equal(diagnostics.body.sync_intent_summary.failed_intents.length, 1);
    assert.equal(diagnostics.body.sync_intent_summary.failed_intents[0].status, "dead_lettered");
    assert.equal(diagnostics.body.sync_intent_summary.failed_intents[0].last_error_classification, "DOWNSTREAM_UNAVAILABLE");
    assert.equal(diagnostics.body.sync_intent_summary.failed_intents[0].reference_id, created.body.incident_id);
    assert.deepEqual(diagnostics.body.upstream_validation_status, {
      enabled: true,
      last_validation: {
        at: "2026-04-16T11:45:00Z",
        result: "degraded"
      }
    });
  } finally {
    server.close();
    delete process.env.RBAC_ENFORCE;
    delete process.env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED;
    delete process.env.UPSTREAM_CONNECTIVITY_LAST_VALIDATED_AT;
    delete process.env.UPSTREAM_CONNECTIVITY_LAST_RESULT;
  }
});

test("createApp refuses to start in production with AUTH_TRUST_HEADERS enabled", () => {
  process.env.APP_ENV = "production";
  process.env.AUTH_TRUST_HEADERS = "true";
  process.env.JWT_HS256_SECRET = "k3y-8f2a91c7-9d4b-4e11-b6a2-7c5d0e1f2a3b";
  process.env.VEMS_OBJECT_STORAGE_KEY = "a".repeat(64);
  try {
    assert.throws(() => createApp(newOrchestration()), /AUTH_TRUST_HEADERS must not be enabled in production/);
  } finally {
    delete process.env.APP_ENV;
    delete process.env.AUTH_TRUST_HEADERS;
    delete process.env.VEMS_OBJECT_STORAGE_KEY;
  }
});

test("createApp refuses to start in production without a real JWT secret or JWKS URI", () => {
  process.env.APP_ENV = "production";
  delete process.env.JWT_HS256_SECRET;
  delete process.env.JWT_JWKS_URI;
  process.env.VEMS_OBJECT_STORAGE_KEY = "a".repeat(64);
  try {
    assert.throws(() => createApp(newOrchestration()), /A real JWT_HS256_SECRET .* is required in production/);
  } finally {
    delete process.env.APP_ENV;
    delete process.env.VEMS_OBJECT_STORAGE_KEY;
  }
});

test("createApp starts in production with a real JWT secret and no trust-headers", () => {
  process.env.APP_ENV = "production";
  process.env.JWT_HS256_SECRET = "k3y-8f2a91c7-9d4b-4e11-b6a2-7c5d0e1f2a3b";
  process.env.VEMS_OBJECT_STORAGE_KEY = "a".repeat(64);
  let server;
  try {
    server = createApp(newOrchestration());
    assert.ok(server);
  } finally {
    server?.close();
    delete process.env.APP_ENV;
    delete process.env.VEMS_OBJECT_STORAGE_KEY;
  }
});

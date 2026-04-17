import test from "node:test";
import assert from "node:assert/strict";
import {
  loadDiagnosticsData,
  buildDiagnosticsSections,
  renderReadinessSummaryHtml,
  renderMetricsSummaryHtml,

  renderSyncIntentSummaryHtml,
  renderUpstreamValidationHtml,
  renderDiagnosticsHtml
} from "../src/diagnostics.mjs";

// ── fixture helpers ──────────────────────────────────────────────────────────

function makeDiagnosticsPayload(overrides = {}) {
  return {
    generated_at: "2026-04-17T10:00:00Z",
    readiness_summary: {
      production_readiness: {
        structured_logging: true,
        correlation_headers: true,
        rbac_enforced: true
      },
      diagnostics: {
        environment: { app_env: "staging", profile: "ops" },
        controls: { rbac_enforced: true, upstream_connectivity_validation_enabled: true }
      },
      incident_snapshot: { total: 3, by_status: { New: 2, Closed: 1 } }
    },
    metrics_summary: {
      started_at: "2026-04-17T09:00:00Z",
      request_count: 42,
      request_failures: 2,

      failure_rate_pct: 4.76,
      latency_ms: { avg: 12.5, min: 5, max: 38 }
    },
    sync_intent_summary: {
      totals: { dead_lettered: 2 },

      failed_intents: [
        {
          intent_id: 7,
          target_system: "vtiger",
          intent_type: "createIncidentMirror",
          entity_type: "incident",
          status: "dead_lettered",
          attempt_count: 3,
          last_error_classification: "DOWNSTREAM_UNAVAILABLE",
          last_error: "Vtiger endpoint unavailable",
          dead_lettered_at: "2026-04-17T09:45:00Z",
          created_at: "2026-04-17T09:00:00Z",
          correlation_id: "corr-abc",
          reference_id: "INC-000042"
        }
      ]
    },
    upstream_validation_status: {
      enabled: true,
      last_validation: { at: "2026-04-17T09:50:00Z", result: "ok" }
    },

    ...overrides
  };
}

function makeFetchOk(payload) {
  return async () => ({
    ok: true,
    status: 200,
    async json() { return payload; }
  });
}

function makeFetchError(status, errorBody) {
  return async () => ({
    ok: false,
    status,
    async json() { return errorBody; }
  });
}

// ── loadDiagnosticsData ──────────────────────────────────────────────────────

test("loadDiagnosticsData fetches /api/support/diagnostics with role headers", async () => {
  const calls = [];
  const payload = makeDiagnosticsPayload();
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts?.headers });
    return { ok: true, status: 200, async json() { return payload; } };
  };

  const result = await loadDiagnosticsData({
    apiBaseUrl: "http://127.0.0.1:8080",
    fetchImpl,
    actorId: "STAFF-OPS-1",
    actorRole: "supervisor"
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/api/support/diagnostics");
  assert.equal(calls[0].headers["x-actor-id"], "STAFF-OPS-1");
  assert.equal(calls[0].headers["x-user-role"], "supervisor");
  assert.equal(result.generated_at, "2026-04-17T10:00:00Z");
});

test("loadDiagnosticsData omits identity headers when not supplied", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(opts?.headers ?? {});
    return { ok: true, status: 200, async json() { return makeDiagnosticsPayload(); } };
  };

  await loadDiagnosticsData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl });

  assert.equal(calls.length, 1);
  assert.equal("x-actor-id" in calls[0], false);
  assert.equal("x-user-role" in calls[0], false);
});

test("loadDiagnosticsData throws FORBIDDEN error on 403 response", async () => {
  const fetchImpl = makeFetchError(403, { error: { code: "FORBIDDEN", message: "Role is not authorized" } });

  await assert.rejects(
    () => loadDiagnosticsData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl }),
    (err) => {
      assert.equal(err.code, "FORBIDDEN");
      assert.equal(err.status, 403);
      assert.match(err.message, /Role is not authorized/);
      return true;
    }
  );
});

test("loadDiagnosticsData throws generic error on non-ok response", async () => {
  const fetchImpl = makeFetchError(500, { error: { code: "SERVER_ERROR", message: "Internal error" } });

  await assert.rejects(
    () => loadDiagnosticsData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl }),
    (err) => {
      assert.equal(err.status, 500);
      assert.equal(err.code, "SERVER_ERROR");
      return true;
    }
  );
});

test("loadDiagnosticsData handles unparseable error body gracefully", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    async json() { throw new SyntaxError("bad json"); }
  });

  await assert.rejects(
    () => loadDiagnosticsData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl }),
    (err) => {
      assert.equal(err.status, 503);
      assert.match(err.message, /Diagnostics request failed: 503/);
      return true;
    }
  );
});

// ── buildDiagnosticsSections ─────────────────────────────────────────────────

test("buildDiagnosticsSections maps all sections from a full payload", () => {
  const payload = makeDiagnosticsPayload();
  const sections = buildDiagnosticsSections(payload);

  assert.equal(sections.generatedAt, "2026-04-17T10:00:00Z");
  assert.equal(sections.readiness.productionReadiness.rbac_enforced, true);
  assert.equal(sections.readiness.environment.app_env, "staging");
  assert.equal(sections.readiness.incidentSnapshot.total, 3);
  assert.equal(sections.metrics.requestCount, 42);
  assert.equal(sections.metrics.requestFailures, 2);
  assert.equal(sections.metrics.failureRatePct, 4.76);
  assert.equal(sections.metrics.latency.avg, 12.5);
  assert.equal(sections.sync.totals.dead_lettered, 2);
  assert.equal(sections.sync.failedIntents.length, 1);
  assert.equal(sections.sync.failedIntents[0].reference_id, "INC-000042");
  assert.equal(sections.upstream.enabled, true);
  assert.equal(sections.upstream.lastValidation.result, "ok");
});

test("buildDiagnosticsSections handles null/missing payload gracefully", () => {
  const sections = buildDiagnosticsSections(null);

  assert.equal(sections.generatedAt, null);
  assert.equal(sections.readiness, null);
  assert.equal(sections.metrics, null);
  assert.equal(sections.sync, null);
  assert.equal(sections.upstream, null);
});

test("buildDiagnosticsSections handles partially missing sections", () => {
  const sections = buildDiagnosticsSections({
    generated_at: "2026-04-17T10:00:00Z",
    readiness_summary: null,
    metrics_summary: { started_at: "2026-04-17T09:00:00Z", request_count: 0, request_failures: 0, failure_rate_pct: 0, latency_ms: {} }
  });

  assert.equal(sections.readiness, null);
  assert.equal(sections.metrics.requestCount, 0);
  assert.equal(sections.sync, null);
  assert.equal(sections.upstream, null);
});

// ── renderReadinessSummaryHtml ───────────────────────────────────────────────

test("renderReadinessSummaryHtml renders all key readiness fields", () => {
  const payload = makeDiagnosticsPayload();
  const sections = buildDiagnosticsSections(payload);
  const html = renderReadinessSummaryHtml(sections.readiness);

  assert.match(html, /Structured logging/);
  assert.match(html, /RBAC enforced/);
  assert.match(html, /App environment/);
  assert.match(html, /staging/);
  assert.match(html, /ops/);
  assert.match(html, /Total incidents/);
  assert.match(html, /3/);
});

test("renderReadinessSummaryHtml shows empty state when readiness is null", () => {
  const html = renderReadinessSummaryHtml(null);
  assert.match(html, /Readiness summary unavailable/);
});

test("renderReadinessSummaryHtml renders incident by_status entries", () => {
  const payload = makeDiagnosticsPayload();
  const sections = buildDiagnosticsSections(payload);
  const html = renderReadinessSummaryHtml(sections.readiness);

  assert.match(html, /Incidents: New/);
  assert.match(html, /Incidents: Closed/);
});

// ── renderMetricsSummaryHtml ─────────────────────────────────────────────────

test("renderMetricsSummaryHtml renders all metric fields", () => {
  const payload = makeDiagnosticsPayload();
  const sections = buildDiagnosticsSections(payload);
  const html = renderMetricsSummaryHtml(sections.metrics);

  assert.match(html, /Request count/);
  assert.match(html, /42/);
  assert.match(html, /Failure rate/);
  assert.match(html, /4\.76/);
  assert.match(html, /Avg latency/);
  assert.match(html, /12\.5/);
});

test("renderMetricsSummaryHtml shows empty state when metrics is null", () => {
  const html = renderMetricsSummaryHtml(null);
  assert.match(html, /Metrics summary unavailable/);
});

// ── renderSyncIntentSummaryHtml ──────────────────────────────────────────────

test("renderSyncIntentSummaryHtml renders totals and failed intents table", () => {
  const payload = makeDiagnosticsPayload();
  const sections = buildDiagnosticsSections(payload);
  const html = renderSyncIntentSummaryHtml(sections.sync);

  assert.match(html, /Dead-lettered/);
  assert.match(html, /INC-000042/);
  assert.match(html, /vtiger/);
  assert.match(html, /createIncidentMirror/);
  assert.match(html, /DOWNSTREAM_UNAVAILABLE/);
  assert.match(html, /Vtiger endpoint unavailable/);
});

test("renderSyncIntentSummaryHtml shows ok-note when no failed intents", () => {
  const html = renderSyncIntentSummaryHtml({
    totals: { total: 3, by_status: { queued: 3 }, pending_retries: 0, dead_lettered: 0 },
    failedIntents: []
  });

  assert.match(html, /No failed or dead-lettered intents/);
});

test("renderSyncIntentSummaryHtml shows empty state when sync is null", () => {
  const html = renderSyncIntentSummaryHtml(null);
  assert.match(html, /Sync intent summary unavailable/);
});

// ── renderUpstreamValidationHtml ─────────────────────────────────────────────

test("renderUpstreamValidationHtml renders enabled + last validation", () => {
  const payload = makeDiagnosticsPayload();
  const sections = buildDiagnosticsSections(payload);
  const html = renderUpstreamValidationHtml(sections.upstream);

  assert.match(html, /Validation enabled/);
  assert.match(html, /Last validated at/);
  assert.match(html, /2026-04-17T09:50:00Z/);
  assert.match(html, /ok/);
});

test("renderUpstreamValidationHtml shows Not yet run when last_validation is null", () => {
  const html = renderUpstreamValidationHtml({ enabled: false, lastValidation: null });
  assert.match(html, /Not yet run/);
});

test("renderUpstreamValidationHtml shows degraded badge correctly", () => {
  const html = renderUpstreamValidationHtml({
    enabled: true,
    lastValidation: { at: "2026-04-17T10:00:00Z", result: "degraded" }
  });
  assert.match(html, /degraded/);
  assert.match(html, /diag-badge-warn/);
});

test("renderUpstreamValidationHtml shows empty state when upstream is null", () => {
  const html = renderUpstreamValidationHtml(null);
  assert.match(html, /Upstream validation status unavailable/);
});

// ── renderDiagnosticsHtml ────────────────────────────────────────────────────

test("renderDiagnosticsHtml includes all four sections", () => {
  const payload = makeDiagnosticsPayload();
  const sections = buildDiagnosticsSections(payload);
  const html = renderDiagnosticsHtml(sections);

  assert.match(html, /Readiness Summary/);
  assert.match(html, /Metrics Summary/);
  assert.match(html, /Sync Intent Summary/);
  assert.match(html, /Upstream Validation Status/);
  assert.match(html, /Generated at:/);
});

test("renderDiagnosticsHtml renders safely with all-null sections", () => {
  const sections = buildDiagnosticsSections(null);
  const html = renderDiagnosticsHtml(sections);

  assert.match(html, /Readiness summary unavailable/);
  assert.match(html, /Metrics summary unavailable/);
  assert.match(html, /Sync intent summary unavailable/);
  assert.match(html, /Upstream validation status unavailable/);
});

test("renderDiagnosticsHtml escapes potential XSS in error strings", () => {
  const payload = makeDiagnosticsPayload();
  payload.sync_intent_summary.failed_intents[0].last_error = '<script>alert("xss")</script>';
  const sections = buildDiagnosticsSections(payload);
  const html = renderDiagnosticsHtml(sections);

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

// ── role-based access behavior ───────────────────────────────────────────────

test("loadDiagnosticsData 403 error has FORBIDDEN code regardless of body content", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    async json() { return {}; }
  });

  await assert.rejects(
    () => loadDiagnosticsData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl }),
    (err) => {
      assert.equal(err.code, "FORBIDDEN");
      assert.equal(err.status, 403);
      assert.match(err.message, /Access denied/);
      return true;
    }
  );
});

test("loadDiagnosticsData succeeds with supervisor role", async () => {
  const payload = makeDiagnosticsPayload();
  const fetchImpl = makeFetchOk(payload);

  const result = await loadDiagnosticsData({
    apiBaseUrl: "http://127.0.0.1:8080",
    fetchImpl,
    actorRole: "supervisor"
  });

  assert.ok(result.generated_at);
});

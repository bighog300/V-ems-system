import test from "node:test";
import assert from "node:assert/strict";
import {
  loadSupervisorData,
  buildSupervisorSections,
  renderAgingIncidentsHtml,
  renderClosureBlockedHtml,
  renderWorkflowCountsHtml,
  renderSyncFailureIndicatorsHtml,
  renderSupervisorDashboardHtml
} from "../src/supervisor.mjs";

// ── fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date("2026-04-17T12:00:00Z").getTime();
const FRESH_AT = new Date("2026-04-17T11:30:00Z").toISOString();   // 30 min ago
const AGING_AT = new Date("2026-04-17T09:00:00Z").toISOString();   // 3 h ago
const OLD_AT   = new Date("2026-04-17T06:00:00Z").toISOString();   // 6 h ago

function makeIncidents(overrides = []) {
  return [
    { incident_id: "INC-000001", status: "Awaiting Dispatch", priority: "critical",  location_summary: "Main St",   created_at: AGING_AT, closure_ready: undefined },
    { incident_id: "INC-000002", status: "En Route",          priority: "high",      location_summary: "Park Ave",  created_at: FRESH_AT, closure_ready: undefined },
    { incident_id: "INC-000003", status: "Handover Complete", priority: "medium",    location_summary: "Oak Rd",    created_at: OLD_AT,   closure_ready: false },
    { incident_id: "INC-000004", status: "Closed",            priority: "low",       location_summary: "Elm Dr",    created_at: AGING_AT, closure_ready: undefined },
    ...overrides
  ];
}

function makeDiagnostics(overrides = {}) {
  return {
    sync_intent_summary: {
      totals: { dead_lettered: 2, pending_retries: 1, failures_by_target: { vtiger: 2 } },
      failed_intents: [
        {
          intent_id: 5,
          target_system: "vtiger",
          entity_type: "incident",
          status: "dead_lettered",
          last_error_classification: "DOWNSTREAM_UNAVAILABLE",
          reference_id: "INC-000001"
        }
      ]
    },
    ...overrides
  };
}

function makeFetch(incidentsPayload, diagnosticsPayload) {
  return async (url) => {
    if (url.includes("/api/incidents")) {
      return { ok: true, status: 200, async json() { return incidentsPayload; } };
    }
    if (url.includes("/api/support/diagnostics")) {
      return { ok: true, status: 200, async json() { return diagnosticsPayload; } };
    }
    return { ok: false, status: 404, async json() { return {}; } };
  };
}

// ── loadSupervisorData ────────────────────────────────────────────────────────

test("loadSupervisorData fetches incidents and diagnostics in parallel", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, role: opts?.headers?.["x-user-role"] });
    if (url.includes("/api/incidents")) return { ok: true, status: 200, async json() { return { incidents: [] }; } };
    return { ok: true, status: 200, async json() { return {}; } };
  };

  const result = await loadSupervisorData({
    apiBaseUrl: "http://127.0.0.1:8080",
    fetchImpl,
    actorId: "STAFF-SUP-1",
    actorRole: "supervisor",
    authMode: "dev",
    allowLegacyAuthHeaders: true
  });

  assert.ok(calls.some((c) => c.url.includes("/api/incidents")));
  assert.ok(calls.some((c) => c.url.includes("/api/support/diagnostics")));
  assert.ok(calls.every((c) => c.role === "supervisor"));
  assert.deepEqual(result.incidents, []);
});

test("loadSupervisorData still returns incidents when diagnostics 403s", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/api/incidents")) {
      return { ok: true, status: 200, async json() { return { incidents: [{ incident_id: "INC-000001" }] }; } };
    }
    return { ok: false, status: 403, async json() { return { error: { code: "FORBIDDEN" } }; } };
  };

  const result = await loadSupervisorData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl });
  assert.equal(result.incidents.length, 1);
  assert.equal(result.diagnostics, null);
});

test("loadSupervisorData throws when incidents endpoint fails", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    async json() { return { error: { message: "Internal error" } }; }
  });

  await assert.rejects(
    () => loadSupervisorData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl }),
    (err) => { assert.equal(err.status, 500); return true; }
  );
});

// ── buildSupervisorSections ───────────────────────────────────────────────────

test("buildSupervisorSections identifies aging incidents correctly", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);

  const agingIds = sections.agingIncidents.map((i) => i.incidentId);
  assert.ok(agingIds.includes("INC-000001"), "AGING_AT incident should be aging");
  assert.ok(!agingIds.includes("INC-000002"), "FRESH_AT incident should not be aging");
  assert.ok(!agingIds.includes("INC-000004"), "Closed incident should not be aging");
});

test("buildSupervisorSections sorts aging incidents by age descending", () => {
  const incidents = [
    { incident_id: "INC-A", status: "En Route", priority: "high", location_summary: "A", created_at: AGING_AT },
    { incident_id: "INC-B", status: "En Route", priority: "high", location_summary: "B", created_at: OLD_AT }
  ];
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);
  assert.equal(sections.agingIncidents[0].incidentId, "INC-B");
  assert.equal(sections.agingIncidents[1].incidentId, "INC-A");
});

test("buildSupervisorSections identifies closure-blocked incidents", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);

  assert.equal(sections.closureBlocked.length, 1);
  assert.equal(sections.closureBlocked[0].incidentId, "INC-000003");
});

test("buildSupervisorSections does not flag closure-blocked when closure_ready is not false", () => {
  const incidents = [
    { incident_id: "INC-X", status: "Handover Complete", priority: "high", location_summary: "X", created_at: FRESH_AT, closure_ready: true },
    { incident_id: "INC-Y", status: "Handover Complete", priority: "low",  location_summary: "Y", created_at: FRESH_AT }
  ];
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);
  assert.equal(sections.closureBlocked.length, 0);
});

test("buildSupervisorSections computes workflow counts by status", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);

  assert.equal(sections.workflowCounts["Awaiting Dispatch"], 1);
  assert.equal(sections.workflowCounts["Handover Complete"], 1);
  assert.equal(sections.workflowCounts["Closed"], 1);
  assert.equal(sections.totalIncidents, 4);
});

test("buildSupervisorSections extracts sync failure indicators from diagnostics", () => {
  const incidents = makeIncidents();
  const diagnostics = makeDiagnostics();
  const sections = buildSupervisorSections({ incidents, diagnostics }, NOW);

  assert.equal(sections.syncFailures.deadLettered, 2);
  assert.equal(sections.syncFailures.pendingRetries, 1);
  assert.equal(sections.syncFailures.failuresByTarget.vtiger, 2);
  assert.equal(sections.syncFailures.recentFailed.length, 1);
});

test("buildSupervisorSections handles null diagnostics gracefully", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);
  assert.equal(sections.syncFailures, null);
});

test("buildSupervisorSections handles empty incidents array", () => {
  const sections = buildSupervisorSections({ incidents: [], diagnostics: null }, NOW);
  assert.equal(sections.totalIncidents, 0);
  assert.equal(sections.agingIncidents.length, 0);
  assert.equal(sections.closureBlocked.length, 0);
  assert.deepEqual(sections.workflowCounts, {});
});

// ── renderAgingIncidentsHtml ──────────────────────────────────────────────────

test("renderAgingIncidentsHtml shows empty state when no aging incidents", () => {
  const html = renderAgingIncidentsHtml([]);
  assert.match(html, /No aging incidents/);
  assert.match(html, /2-hour threshold/);
});

test("renderAgingIncidentsHtml renders table with drill-down links", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);
  const html = renderAgingIncidentsHtml(sections.agingIncidents);

  assert.match(html, /INC-000001/);
  assert.match(html, /\?incidentId=INC-000001/);
  assert.match(html, /Awaiting Dispatch/);
  assert.match(html, /critical/);
  assert.match(html, /min/);
});

test("renderAgingIncidentsHtml escapes XSS in location summary", () => {
  const aging = [{
    incidentId: "INC-X", status: "En Route", priority: "high",
    locationSummary: '<script>alert(1)</script>', createdAt: AGING_AT, ageMinutes: 180, priorityClass: ""
  }];
  const html = renderAgingIncidentsHtml(aging);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

// ── renderClosureBlockedHtml ──────────────────────────────────────────────────

test("renderClosureBlockedHtml shows empty state when no blocked incidents", () => {
  const html = renderClosureBlockedHtml([]);
  assert.match(html, /No closure-blocked incidents/);
});

test("renderClosureBlockedHtml renders blocked incidents with links", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);
  const html = renderClosureBlockedHtml(sections.closureBlocked);

  assert.match(html, /INC-000003/);
  assert.match(html, /\?incidentId=INC-000003/);
  assert.match(html, /Handover Complete/);
});

// ── renderWorkflowCountsHtml ──────────────────────────────────────────────────

test("renderWorkflowCountsHtml shows empty state when no incidents", () => {
  const html = renderWorkflowCountsHtml({}, 0);
  assert.match(html, /No incidents in system/);
});

test("renderWorkflowCountsHtml shows total and status breakdown", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);
  const html = renderWorkflowCountsHtml(sections.workflowCounts, sections.totalIncidents);

  assert.match(html, /Total/);
  assert.match(html, /4/);
  assert.match(html, /Awaiting Dispatch/);
  assert.match(html, /Closed/);
});

// ── renderSyncFailureIndicatorsHtml ──────────────────────────────────────────

test("renderSyncFailureIndicatorsHtml shows unavailable state when syncFailures is null", () => {
  const html = renderSyncFailureIndicatorsHtml(null);
  assert.match(html, /unavailable/);
});

test("renderSyncFailureIndicatorsHtml shows ok badge when no failures", () => {
  const html = renderSyncFailureIndicatorsHtml({
    deadLettered: 0, pendingRetries: 0, failuresByTarget: {}, recentFailed: []
  });
  assert.match(html, /No sync failures detected/);
  assert.match(html, /sup-badge-ok/);
});

test("renderSyncFailureIndicatorsHtml shows warn badge and table when failures exist", () => {
  const diagnostics = makeDiagnostics();
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics }, NOW);
  const html = renderSyncFailureIndicatorsHtml(sections.syncFailures);

  assert.match(html, /dead-lettered/);
  assert.match(html, /vtiger/);
  assert.match(html, /DOWNSTREAM_UNAVAILABLE/);
  assert.match(html, /INC-000001/);
  assert.match(html, /sup-badge-warn/);
});

// ── renderSupervisorDashboardHtml ─────────────────────────────────────────────

test("renderSupervisorDashboardHtml includes all four sections", () => {
  const incidents = makeIncidents();
  const diagnostics = makeDiagnostics();
  const sections = buildSupervisorSections({ incidents, diagnostics }, NOW);
  const html = renderSupervisorDashboardHtml(sections);

  assert.match(html, /Aging \/ Delayed Incidents/);
  assert.match(html, /Closure-blocked Incidents/);
  assert.match(html, /Workflow Health/);
  assert.match(html, /Sync Failure Indicators/);
  assert.match(html, /Total Incidents/);
});

test("renderSupervisorDashboardHtml shows KPI counts correctly", () => {
  const incidents = makeIncidents();
  const sections = buildSupervisorSections({ incidents, diagnostics: null }, NOW);
  const html = renderSupervisorDashboardHtml(sections);

  assert.match(html, /sup-badge-warn/);
});

test("renderSupervisorDashboardHtml renders cleanly with empty data", () => {
  const sections = buildSupervisorSections({ incidents: [], diagnostics: null }, NOW);
  const html = renderSupervisorDashboardHtml(sections);

  assert.match(html, /No aging incidents/);
  assert.match(html, /No closure-blocked incidents/);
  assert.match(html, /No incidents in system/);
});

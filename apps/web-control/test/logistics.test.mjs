import test from "node:test";
import assert from "node:assert/strict";
import {
  loadLogisticsData,
  buildLogisticsSections,
  renderStockLinkedSummaryHtml,
  renderStockSyncHealthHtml,
  renderStockFailuresHtml,
  renderReplenishmentSignalsHtml,
  renderLogisticsDashboardHtml
} from "../src/logistics.mjs";

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeDiagnosticsPayload({ stockTotal = 4, stockFailed = 2 } = {}) {
  const failed = Array.from({ length: stockFailed }, (_, i) => ({
    intent_id: 100 + i,
    target_system: "vtiger",
    intent_type: "recordStockUsageMirror",
    entity_type: "stock_usage",
    status: "dead_lettered",
    attempt_count: 3,
    last_error_classification: "DOWNSTREAM_UNAVAILABLE",
    last_error: "Vtiger endpoint unavailable",
    dead_lettered_at: "2026-04-17T10:00:00Z",
    created_at: "2026-04-17T09:00:00Z",
    reference_id: `INC-00000${i + 1}`
  }));

  return {
    generated_at: "2026-04-17T12:00:00Z",
    sync_intent_summary: {
      totals: {
        total: stockTotal + 2,
        by_status: { queued: stockTotal - stockFailed, dead_lettered: stockFailed },
        by_entity_type: { stock_usage: stockTotal, incident: 2 },
        failures_by_target: stockFailed > 0 ? { vtiger: stockFailed } : {},
        dead_lettered: stockFailed,
        pending_retries: 0
      },
      failed_intents: failed
    }
  };
}

// ── loadLogisticsData ─────────────────────────────────────────────────────────

test("loadLogisticsData fetches /api/support/diagnostics with role headers", async () => {
  const calls = [];
  const payload = makeDiagnosticsPayload();
  const fetchImpl = async (url, opts) => {
    calls.push({ url, headers: opts?.headers });
    return { ok: true, status: 200, async json() { return payload; } };
  };

  const result = await loadLogisticsData({
    apiBaseUrl: "http://127.0.0.1:8080",
    fetchImpl,
    actorId: "STAFF-LOG-1",
    actorRole: "supervisor",
    authMode: "dev",
    allowLegacyAuthHeaders: true
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/support\/diagnostics/);
  assert.equal(calls[0].headers["x-user-role"], "supervisor");
  assert.ok(result.sync_intent_summary);
});

test("loadLogisticsData throws FORBIDDEN on 403", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    async json() { return { error: { message: "Role is not authorized" } }; }
  });

  await assert.rejects(
    () => loadLogisticsData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl }),
    (err) => { assert.equal(err.status, 403); return true; }
  );
});

test("loadLogisticsData throws generic error on non-ok response", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    async json() { return {}; }
  });

  await assert.rejects(
    () => loadLogisticsData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl }),
    (err) => { assert.equal(err.status, 503); return true; }
  );
});

// ── buildLogisticsSections ────────────────────────────────────────────────────

test("buildLogisticsSections extracts stock-linked total from by_entity_type", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 4, stockFailed: 2 });
  const sections = buildLogisticsSections(diag);

  assert.equal(sections.stockLinkedTotal, 4);
  assert.equal(sections.stockFailures.length, 2);
  assert.equal(sections.stockSyncHealth.failedCount, 2);
  assert.equal(sections.stockSyncHealth.successCount, 2);
});

test("buildLogisticsSections filters stock failures by entity_type stock_usage", () => {
  const diag = makeDiagnosticsPayload();
  diag.sync_intent_summary.failed_intents.push({
    intent_id: 999,
    target_system: "vtiger",
    entity_type: "incident",
    status: "dead_lettered",
    attempt_count: 2,
    last_error_classification: "DOWNSTREAM_UNAVAILABLE",
    last_error: "non-stock error",
    reference_id: "INC-000099"
  });

  const sections = buildLogisticsSections(diag);
  assert.equal(sections.stockFailures.every((i) => i.entity_type === "stock_usage"), true);
});

test("buildLogisticsSections populates replenishment signals for dead-lettered stock", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 4, stockFailed: 2 });
  const sections = buildLogisticsSections(diag);

  assert.equal(sections.replenishmentSignals.length, 2);
  assert.equal(sections.replenishmentSignals[0].errorClass, "DOWNSTREAM_UNAVAILABLE");
  assert.ok(sections.replenishmentSignals[0].referenceId.startsWith("INC-"));
});

test("buildLogisticsSections handles zero stock-linked interventions", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 0, stockFailed: 0 });
  diag.sync_intent_summary.totals.by_entity_type = {};
  diag.sync_intent_summary.failed_intents = [];

  const sections = buildLogisticsSections(diag);
  assert.equal(sections.stockLinkedTotal, 0);
  assert.equal(sections.stockFailures.length, 0);
  assert.equal(sections.replenishmentSignals.length, 0);
});

test("buildLogisticsSections handles null diagnostics gracefully", () => {
  const sections = buildLogisticsSections(null);
  assert.equal(sections.stockLinkedTotal, 0);
  assert.equal(sections.stockSyncHealth, null);
  assert.deepEqual(sections.stockFailures, []);
});

test("buildLogisticsSections groups failures by target system", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 3, stockFailed: 3 });
  diag.sync_intent_summary.failed_intents[2].target_system = "openemr";
  const sections = buildLogisticsSections(diag);

  assert.ok(sections.stockSyncHealth.failuresByTarget.vtiger > 0);
  assert.ok(sections.stockSyncHealth.failuresByTarget.openemr > 0);
});

// ── renderStockLinkedSummaryHtml ──────────────────────────────────────────────

test("renderStockLinkedSummaryHtml shows empty state for zero", () => {
  const html = renderStockLinkedSummaryHtml(0);
  assert.match(html, /No stock-linked interventions recorded yet/);
});

test("renderStockLinkedSummaryHtml shows count when greater than zero", () => {
  const html = renderStockLinkedSummaryHtml(7);
  assert.match(html, /7/);
  assert.match(html, /Stock-linked interventions/);
});

// ── renderStockSyncHealthHtml ─────────────────────────────────────────────────

test("renderStockSyncHealthHtml shows unavailable when health is null", () => {
  const html = renderStockSyncHealthHtml(null);
  assert.match(html, /unavailable/);
});

test("renderStockSyncHealthHtml shows ok badge when no failures", () => {
  const html = renderStockSyncHealthHtml({ failedCount: 0, successCount: 5, failuresByTarget: {} });
  assert.match(html, /All synced/);
  assert.match(html, /log-badge-ok/);
});

test("renderStockSyncHealthHtml shows warn badge and target breakdown when failures exist", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 4, stockFailed: 2 });
  const sections = buildLogisticsSections(diag);
  const html = renderStockSyncHealthHtml(sections.stockSyncHealth);

  assert.match(html, /2 failed/);
  assert.match(html, /log-badge-warn/);
  assert.match(html, /vtiger/);
});

// ── renderStockFailuresHtml ───────────────────────────────────────────────────

test("renderStockFailuresHtml shows ok note when no failures", () => {
  const html = renderStockFailuresHtml([]);
  assert.match(html, /No recent stock sync failures/);
});

test("renderStockFailuresHtml renders failure table with all fields", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 2, stockFailed: 2 });
  const sections = buildLogisticsSections(diag);
  const html = renderStockFailuresHtml(sections.stockFailures);

  assert.match(html, /dead_lettered/);
  assert.match(html, /vtiger/);
  assert.match(html, /DOWNSTREAM_UNAVAILABLE/);
  assert.match(html, /INC-000001/);
});

test("renderStockFailuresHtml escapes XSS in error messages", () => {
  const failures = [{
    intent_id: 1,
    status: "dead_lettered",
    target_system: "vtiger",
    attempt_count: 1,
    last_error_classification: "ERR",
    last_error: '<script>alert("xss")</script>',
    reference_id: "INC-X"
  }];
  const html = renderStockFailuresHtml(failures);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

// ── renderReplenishmentSignalsHtml ────────────────────────────────────────────

test("renderReplenishmentSignalsHtml shows empty state when no signals", () => {
  const html = renderReplenishmentSignalsHtml([]);
  assert.match(html, /No dead-lettered stock intents/);
});

test("renderReplenishmentSignalsHtml renders signal table with advisory note", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 2, stockFailed: 2 });
  const sections = buildLogisticsSections(diag);
  const html = renderReplenishmentSignalsHtml(sections.replenishmentSignals);

  assert.match(html, /Manual review recommended/);
  assert.match(html, /INC-000001/);
  assert.match(html, /DOWNSTREAM_UNAVAILABLE/);
});

// ── renderLogisticsDashboardHtml ──────────────────────────────────────────────

test("renderLogisticsDashboardHtml includes all four sections", () => {
  const diag = makeDiagnosticsPayload({ stockTotal: 4, stockFailed: 2 });
  const sections = buildLogisticsSections(diag);
  const html = renderLogisticsDashboardHtml(sections);

  assert.match(html, /Stock-linked Intervention Summary/);
  assert.match(html, /Stock Sync Health/);
  assert.match(html, /Recent Stock Sync Failures/);
  assert.match(html, /Candidate Replenishment Signals/);
  assert.match(html, /Stock-linked Interventions/);
});

test("renderLogisticsDashboardHtml renders cleanly with all-zero state", () => {
  const sections = buildLogisticsSections(null);
  const html = renderLogisticsDashboardHtml(sections);

  assert.match(html, /No stock-linked interventions recorded yet/);
  assert.match(html, /No recent stock sync failures/);
  assert.match(html, /No dead-lettered stock intents/);
});

test("renderLogisticsDashboardHtml shows health KPI badge correctly", () => {
  const healthy = buildLogisticsSections(makeDiagnosticsPayload({ stockTotal: 3, stockFailed: 0 }));
  const unhealthy = buildLogisticsSections(makeDiagnosticsPayload({ stockTotal: 3, stockFailed: 2 }));

  assert.match(renderLogisticsDashboardHtml(healthy), /log-badge-ok/);
  assert.match(renderLogisticsDashboardHtml(unhealthy), /log-badge-warn/);
});

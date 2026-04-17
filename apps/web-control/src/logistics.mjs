import { requestJson } from "./http.mjs";
import { escapeHtml as escHtml } from "./security.mjs";

function asText(value, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export async function loadLogisticsData({ apiBaseUrl, fetchImpl = fetch, ...config }) {
  const response = await requestJson(fetchImpl, `${apiBaseUrl}/api/support/diagnostics`, { config });
  return response.data;
}

export function buildLogisticsSections(diagnostics) {
  const syncSummary = diagnostics?.sync_intent_summary ?? null;

  if (!syncSummary) {
    return {
      stockLinkedTotal: 0,
      stockSyncHealth: null,
      stockFailures: [],
      replenishmentSignals: []
    };
  }

  const byEntityType = syncSummary.totals?.by_entity_type ?? {};
  const stockLinkedTotal = byEntityType.stock_usage ?? 0;

  const allFailed = syncSummary.failed_intents ?? [];
  const stockFailures = allFailed.filter((i) => i.entity_type === "stock_usage");

  const failuresByTarget = stockFailures.reduce((acc, intent) => {
    const key = intent.target_system ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const successCount = Math.max(0, stockLinkedTotal - stockFailures.length);

  const replenishmentSignals = stockFailures
    .filter((i) => i.status === "dead_lettered")
    .map((i) => ({
      intentId: i.intent_id,
      referenceId: i.reference_id,
      targetSystem: i.target_system,
      errorClass: i.last_error_classification,
      lastError: i.last_error,
      deadLetteredAt: i.dead_lettered_at
    }));

  return {
    stockLinkedTotal,
    stockSyncHealth: {
      failedCount: stockFailures.length,
      successCount,
      failuresByTarget
    },
    stockFailures,
    replenishmentSignals
  };
}

export function renderStockLinkedSummaryHtml(stockLinkedTotal) {
  if (stockLinkedTotal === 0) {
    return `<p class="log-empty">No stock-linked interventions recorded yet.</p>`;
  }

  return `
    <dl class="log-dl">
      <dt>Stock-linked interventions (total)</dt>
      <dd>${escHtml(stockLinkedTotal)}</dd>
    </dl>
  `.trim();
}

export function renderStockSyncHealthHtml(stockSyncHealth) {
  if (!stockSyncHealth) {
    return `<p class="log-empty">Stock sync health data unavailable.</p>`;
  }

  const { failedCount, successCount, failuresByTarget } = stockSyncHealth;
  const hasFailures = failedCount > 0;
  const healthBadge = hasFailures
    ? `<span class="log-badge-warn">${escHtml(failedCount)} failed</span>`
    : `<span class="log-badge-ok">All synced</span>`;

  const byTargetRows = Object.entries(failuresByTarget)
    .map(([target, count]) => `<tr><td>${escHtml(target)}</td><td>${escHtml(count)}</td></tr>`)
    .join("");

  return `
    <dl class="log-dl">
      <dt>Sync status</dt><dd>${healthBadge}</dd>
      <dt>Successful syncs (est.)</dt><dd>${escHtml(successCount)}</dd>
      <dt>Failed syncs</dt><dd>${escHtml(failedCount)}</dd>
    </dl>
    ${byTargetRows ? `
      <h4>Failures by target system</h4>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead><tr><th>Target</th><th>Failures</th></tr></thead>
          <tbody>${byTargetRows}</tbody>
        </table>
      </div>` : ""}
  `.trim();
}

export function renderStockFailuresHtml(stockFailures) {
  if (!stockFailures || stockFailures.length === 0) {
    return `<p class="log-empty log-ok-note">No recent stock sync failures.</p>`;
  }

  const rows = stockFailures.map((intent) => `
    <tr>
      <td>${escHtml(asText(intent.intent_id))}</td>
      <td>${escHtml(asText(intent.status))}</td>
      <td>${escHtml(asText(intent.target_system))}</td>
      <td>${escHtml(asText(intent.attempt_count))}</td>
      <td>${escHtml(asText(intent.last_error_classification))}</td>
      <td class="log-error-cell">${escHtml(asText(intent.last_error))}</td>
      <td>${escHtml(asText(intent.reference_id))}</td>
    </tr>
  `).join("");

  return `
    <div class="log-table-wrap">
      <table class="log-table">
        <thead>
          <tr>
            <th>Intent ID</th>
            <th>Status</th>
            <th>Target</th>
            <th>Attempts</th>
            <th>Error Class</th>
            <th>Last Error</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();
}

export function renderReplenishmentSignalsHtml(signals) {
  if (!signals || signals.length === 0) {
    return `<p class="log-empty">No dead-lettered stock intents requiring attention.</p>`;
  }

  const rows = signals.map((s) => `
    <tr>
      <td>${escHtml(asText(s.intentId))}</td>
      <td>${escHtml(asText(s.referenceId))}</td>
      <td>${escHtml(asText(s.targetSystem))}</td>
      <td>${escHtml(asText(s.errorClass))}</td>
      <td>${escHtml(asText(s.deadLetteredAt))}</td>
    </tr>
  `).join("");

  return `
    <p class="log-note">These dead-lettered stock intents may indicate usage that was not mirrored to the upstream system. Manual review recommended.</p>
    <div class="log-table-wrap">
      <table class="log-table">
        <thead>
          <tr><th>Intent ID</th><th>Incident Ref</th><th>Target</th><th>Error Class</th><th>Dead-lettered At</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();
}

export function renderLogisticsDashboardHtml(sections) {
  const failedCount = sections.stockSyncHealth?.failedCount ?? 0;
  const healthBadge = failedCount > 0
    ? `<span class="log-badge-warn">${escHtml(failedCount)} failed</span>`
    : `<span class="log-badge-ok">Healthy</span>`;

  return `
    <div class="log-kpi-row">
      <div class="log-kpi-card">
        <div class="log-kpi-label">Stock-linked Interventions</div>
        <div class="log-kpi-value">${escHtml(sections.stockLinkedTotal)}</div>
      </div>
      <div class="log-kpi-card">
        <div class="log-kpi-label">Stock Sync Health</div>
        <div class="log-kpi-value">${healthBadge}</div>
      </div>
      <div class="log-kpi-card">
        <div class="log-kpi-label">Replenishment Signals</div>
        <div class="log-kpi-value">${escHtml(sections.replenishmentSignals.length)}</div>
      </div>
    </div>

    <section class="panel log-section">
      <h2>Stock-linked Intervention Summary</h2>
      <p class="hint">Total stock-usage sync intents created by the platform.</p>
      ${renderStockLinkedSummaryHtml(sections.stockLinkedTotal)}
    </section>

    <section class="panel log-section">
      <h2>Stock Sync Health</h2>
      <p class="hint">Distribution of stock sync outcomes across all recorded interventions.</p>
      ${renderStockSyncHealthHtml(sections.stockSyncHealth)}
    </section>

    <section class="panel log-section">
      <h2>Recent Stock Sync Failures</h2>
      <p class="hint">Failed or dead-lettered stock sync intents.</p>
      ${renderStockFailuresHtml(sections.stockFailures)}
    </section>

    <section class="panel log-section">
      <h2>Candidate Replenishment Signals</h2>
      <p class="hint">Dead-lettered stock intents — may represent unmirrored stock usage. Review recommended.</p>
      ${renderReplenishmentSignalsHtml(sections.replenishmentSignals)}
    </section>
  `.trim();
}

import { requestJson } from "./http.mjs";
import { escapeHtml } from "./security.mjs";

function asText(value, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function boolBadge(value) {
  const label = value ? "Yes" : "No";
  const cls = value ? "diag-badge-ok" : "diag-badge-warn";
  return `<span class="${cls}">${label}</span>`;
}

function statusBadge(status) {
  const s = String(status ?? "unknown").toLowerCase();
  if (s === "ok") return `<span class="diag-badge-ok">ok</span>`;
  if (s === "degraded") return `<span class="diag-badge-warn">degraded</span>`;
  if (s === "dead_lettered") return `<span class="diag-badge-error">dead_lettered</span>`;
  if (s === "pending") return `<span class="diag-badge-warn">pending</span>`;
  return `<span class="diag-badge-neutral">${escapeHtml(status)}</span>`;
}

export async function loadDiagnosticsData({ apiBaseUrl, fetchImpl = fetch, ...config }) {
  const response = await requestJson(fetchImpl, `${apiBaseUrl}/api/support/diagnostics`, { config });
  return response.data;
}

export function buildDiagnosticsSections(data) {
  const readiness = data?.readiness_summary ?? null;
  const metrics = data?.metrics_summary ?? null;
  const sync = data?.sync_intent_summary ?? null;
  const upstream = data?.upstream_validation_status ?? null;

  return {
    generatedAt: data?.generated_at ?? null,
    readiness: readiness
      ? {
          environment: readiness.readiness_summary?.diagnostics?.environment ?? readiness.diagnostics?.environment ?? null,
          controls: readiness.readiness_summary?.diagnostics?.controls ?? readiness.diagnostics?.controls ?? null,
          productionReadiness: readiness.production_readiness ?? null,
          incidentSnapshot: readiness.incident_snapshot ?? null
        }
      : null,
    metrics: metrics
      ? {
          startedAt: metrics.started_at ?? null,
          requestCount: metrics.request_count ?? 0,
          requestFailures: metrics.request_failures ?? 0,

          failureRatePct: metrics.failure_rate_pct ?? 0,
          latency: metrics.latency_ms ?? null
        }
      : null,
    sync: sync
      ? {
          totals: sync.totals ?? {},
          failedIntents: sync.failed_intents ?? []
        }
      : null,
    upstream: upstream
      ? {
          enabled: upstream.enabled ?? false,
          lastValidation: upstream.last_validation ?? null
        }
      : null

  };
}

export function renderReadinessSummaryHtml(readiness) {
  if (!readiness) {
    return `<p class="diag-empty">Readiness summary unavailable.</p>`;
  }

  const pr = readiness.productionReadiness;
  const env = readiness.environment;
  const controls = readiness.controls;
  const snapshot = readiness.incidentSnapshot;

  return `
    <dl class="diag-dl">
      <dt>Structured logging</dt><dd>${boolBadge(pr?.structured_logging)}</dd>
      <dt>Correlation headers</dt><dd>${boolBadge(pr?.correlation_headers)}</dd>
      <dt>RBAC enforced</dt><dd>${boolBadge(pr?.rbac_enforced)}</dd>
      <dt>App environment</dt><dd>${escapeHtml(asText(env?.app_env))}</dd>
      <dt>Profile</dt><dd>${escapeHtml(asText(env?.profile))}</dd>
      <dt>Upstream validation enabled</dt><dd>${boolBadge(controls?.upstream_connectivity_validation_enabled)}</dd>
      <dt>Total incidents</dt><dd>${escapeHtml(asText(snapshot?.total))}</dd>
      ${snapshot?.by_status
        ? Object.entries(snapshot.by_status)
            .map(([status, count]) => `<dt>Incidents: ${escapeHtml(status)}</dt><dd>${escapeHtml(count)}</dd>`)
            .join("")
        : ""}
    </dl>
  `.trim();
}

export function renderMetricsSummaryHtml(metrics) {
  if (!metrics) {
    return `<p class="diag-empty">Metrics summary unavailable.</p>`;
  }

  const latency = metrics.latency ?? {};

  return `
    <dl class="diag-dl">
      <dt>Metrics started at</dt><dd>${escapeHtml(asText(metrics.startedAt))}</dd>
      <dt>Request count</dt><dd>${escapeHtml(metrics.requestCount)}</dd>
      <dt>Request failures</dt><dd>${escapeHtml(metrics.requestFailures)}</dd>

      <dt>Failure rate</dt><dd>${escapeHtml(metrics.failureRatePct)}%</dd>
      <dt>Avg latency (ms)</dt><dd>${escapeHtml(asText(latency.avg))}</dd>
      <dt>Min latency (ms)</dt><dd>${escapeHtml(asText(latency.min))}</dd>
      <dt>Max latency (ms)</dt><dd>${escapeHtml(asText(latency.max))}</dd>
    </dl>
  `.trim();
}


export function renderSyncIntentSummaryHtml(sync) {
  if (!sync) {
    return `<p class="diag-empty">Sync intent summary unavailable.</p>`;
  }

  const totals = sync.totals ?? {};
  const byStatus = totals.by_status ?? {};

  const totalsHtml = `
    <dl class="diag-dl">
      <dt>Total intents</dt><dd>${escapeHtml(asText(totals.total))}</dd>
      <dt>Pending retries</dt><dd>${escapeHtml(asText(totals.pending_retries))}</dd>
      <dt>Dead-lettered</dt><dd>${escapeHtml(asText(totals.dead_lettered))}</dd>
      ${Object.entries(byStatus)
        .map(([status, count]) => `<dt>By status: ${escapeHtml(status)}</dt><dd>${escapeHtml(count)}</dd>`)
        .join("")}
    </dl>
  `.trim();

  const failedIntents = sync.failedIntents ?? [];
  if (failedIntents.length === 0) {
    return `${totalsHtml}<p class="diag-empty diag-ok-note">No failed or dead-lettered intents.</p>`;
  }

  const rows = failedIntents.map((intent) => `
    <tr>
      <td>${escapeHtml(asText(intent.intent_id))}</td>
      <td>${statusBadge(intent.status)}</td>
      <td>${escapeHtml(asText(intent.target_system))}</td>
      <td>${escapeHtml(asText(intent.intent_type))}</td>
      <td>${escapeHtml(asText(intent.entity_type))}</td>
      <td>${escapeHtml(asText(intent.attempt_count))}</td>
      <td>${escapeHtml(asText(intent.last_error_classification))}</td>
      <td class="diag-error-cell">${escapeHtml(asText(intent.last_error))}</td>
      <td>${escapeHtml(asText(intent.reference_id))}</td>
    </tr>
  `).join("");

  return `
    ${totalsHtml}
    <div class="diag-table-wrap">
      <table class="diag-table">
        <thead>
          <tr>
            <th>Intent ID</th>
            <th>Status</th>
            <th>Target</th>
            <th>Type</th>
            <th>Entity</th>
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

export function renderUpstreamValidationHtml(upstream) {
  if (!upstream) {
    return `<p class="diag-empty">Upstream validation status unavailable.</p>`;
  }

  const lastVal = upstream.lastValidation;

  return `
    <dl class="diag-dl">
      <dt>Validation enabled</dt><dd>${boolBadge(upstream.enabled)}</dd>
      ${lastVal
        ? `<dt>Last validated at</dt><dd>${escapeHtml(asText(lastVal.at))}</dd>
           <dt>Last result</dt><dd>${statusBadge(lastVal.result)}</dd>`
        : `<dt>Last validation</dt><dd><span class="diag-badge-neutral">Not yet run</span></dd>`}
    </dl>
  `.trim();
}

export function renderDiagnosticsHtml(sections) {
  const genAt = sections.generatedAt
    ? `<p class="diag-generated-at">Generated at: ${escapeHtml(sections.generatedAt)}</p>`
    : "";

  return `
    ${genAt}
    <section class="panel diag-section">

      <h2>Readiness Summary</h2>
      ${renderReadinessSummaryHtml(sections.readiness)}
    </section>
    <section class="panel diag-section">
      <h2>Metrics Summary</h2>
      ${renderMetricsSummaryHtml(sections.metrics)}
    </section>
    <section class="panel diag-section">
      <h2>Sync Intent Summary</h2>
      ${renderSyncIntentSummaryHtml(sections.sync)}
    </section>
    <section class="panel diag-section">
      <h2>Upstream Validation Status</h2>
      ${renderUpstreamValidationHtml(sections.upstream)}
    </section>
  `.trim();
}

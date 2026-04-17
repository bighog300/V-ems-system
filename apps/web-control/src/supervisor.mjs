import { ForbiddenError, UnauthorizedError, requestJson } from "./http.mjs";
import { escapeHtml as escHtml } from "./security.mjs";

function asText(value, fallback = "—") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function priorityClass(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "critical") return "priority-critical";
  if (p === "high") return "priority-high";
  if (p === "medium") return "priority-medium";
  return "priority-low";
}

const ACTIVE_STATUSES = new Set([
  "new", "awaiting dispatch", "assigned", "crew acknowledged", "en route",
  "on scene", "treating on scene", "transporting", "at destination", "handover complete"
]);

const CLOSURE_EXPECTED_STATUSES = new Set([
  "handover complete", "at destination"
]);

const AGING_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export async function loadSupervisorData({ apiBaseUrl, fetchImpl = fetch, ...config }) {
  const incidentsResponse = await requestJson(fetchImpl, `${apiBaseUrl}/api/incidents`, { config });
  let diagnosticsBody = null;
  try {
    const diagnosticsResponse = await requestJson(fetchImpl, `${apiBaseUrl}/api/support/diagnostics`, { config });
    diagnosticsBody = diagnosticsResponse.data;
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      throw error;
    }
    diagnosticsBody = null;
  }

  return {
    incidents: incidentsResponse.data?.incidents ?? [],
    diagnostics: diagnosticsBody
  };
}

export function buildSupervisorSections({ incidents, diagnostics }, now = Date.now()) {
  const agingIncidents = incidents
    .filter((inc) => {
      if (!ACTIVE_STATUSES.has((inc.status ?? "").toLowerCase())) return false;
      const createdMs = Date.parse(inc.created_at);
      return !Number.isNaN(createdMs) && now - createdMs > AGING_THRESHOLD_MS;
    })
    .map((inc) => ({
      incidentId: inc.incident_id,
      status: inc.status,
      priority: inc.priority,
      locationSummary: inc.location_summary,
      createdAt: inc.created_at,
      ageMinutes: Math.floor((now - Date.parse(inc.created_at)) / 60000),
      priorityClass: priorityClass(inc.priority)
    }))
    .sort((a, b) => b.ageMinutes - a.ageMinutes);

  const closureBlocked = incidents
    .filter((inc) => {
      const statusLower = (inc.status ?? "").toLowerCase();
      return inc.closure_ready === false && CLOSURE_EXPECTED_STATUSES.has(statusLower);
    })
    .map((inc) => ({
      incidentId: inc.incident_id,
      status: inc.status,
      priority: inc.priority,
      locationSummary: inc.location_summary,
      createdAt: inc.created_at,
      priorityClass: priorityClass(inc.priority)
    }));

  const workflowCounts = incidents.reduce((acc, inc) => {
    const status = inc.status ?? "Unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  const syncFailures = diagnostics?.sync_intent_summary
    ? {
        deadLettered: diagnostics.sync_intent_summary.totals?.dead_lettered ?? 0,
        pendingRetries: diagnostics.sync_intent_summary.totals?.pending_retries ?? 0,
        failuresByTarget: diagnostics.sync_intent_summary.totals?.failures_by_target ?? {},
        recentFailed: (diagnostics.sync_intent_summary.failed_intents ?? []).slice(0, 5)
      }
    : null;

  return {
    totalIncidents: incidents.length,
    agingIncidents,
    closureBlocked,
    workflowCounts,
    syncFailures
  };
}

export function renderAgingIncidentsHtml(agingIncidents) {
  if (!agingIncidents || agingIncidents.length === 0) {
    return `<p class="sup-empty sup-ok-note">No aging incidents — all active incidents are within the 2-hour threshold.</p>`;
  }

  const rows = agingIncidents.map((inc) => `
    <tr class="${escHtml(inc.priorityClass)}">
      <td><a href="./index.html?incidentId=${escHtml(inc.incidentId)}">${escHtml(inc.incidentId)}</a></td>
      <td>${escHtml(asText(inc.status))}</td>
      <td>${escHtml(asText(inc.priority))}</td>
      <td>${escHtml(asText(inc.locationSummary))}</td>
      <td class="sup-age-cell">${escHtml(inc.ageMinutes)} min</td>
      <td>${escHtml(asText(inc.createdAt))}</td>
    </tr>
  `).join("");

  return `
    <div class="sup-table-wrap">
      <table class="sup-table">
        <thead>
          <tr><th>Incident</th><th>Status</th><th>Priority</th><th>Location</th><th>Age</th><th>Created At</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();
}

export function renderClosureBlockedHtml(closureBlocked) {
  if (!closureBlocked || closureBlocked.length === 0) {
    return `<p class="sup-empty sup-ok-note">No closure-blocked incidents.</p>`;
  }

  const rows = closureBlocked.map((inc) => `
    <tr>
      <td><a href="./index.html?incidentId=${escHtml(inc.incidentId)}">${escHtml(inc.incidentId)}</a></td>
      <td>${escHtml(asText(inc.status))}</td>
      <td>${escHtml(asText(inc.priority))}</td>
      <td>${escHtml(asText(inc.locationSummary))}</td>
      <td>${escHtml(asText(inc.createdAt))}</td>
    </tr>
  `).join("");

  return `
    <div class="sup-table-wrap">
      <table class="sup-table">
        <thead>
          <tr><th>Incident</th><th>Status</th><th>Priority</th><th>Location</th><th>Created At</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();
}

export function renderWorkflowCountsHtml(workflowCounts, totalIncidents) {
  if (!workflowCounts || totalIncidents === 0) {
    return `<p class="sup-empty">No incidents in system.</p>`;
  }

  const rows = Object.entries(workflowCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([status, count]) => `
      <tr>
        <td>${escHtml(status)}</td>
        <td>${escHtml(count)}</td>
      </tr>
    `).join("");

  return `
    <p><strong>Total:</strong> ${escHtml(totalIncidents)}</p>
    <div class="sup-table-wrap">
      <table class="sup-table">
        <thead><tr><th>Status</th><th>Count</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();
}

export function renderSyncFailureIndicatorsHtml(syncFailures) {
  if (!syncFailures) {
    return `<p class="sup-empty">Sync failure data unavailable (diagnostics endpoint not accessible).</p>`;
  }

  const hasFailures = syncFailures.deadLettered > 0 || syncFailures.pendingRetries > 0;
  const summaryBadge = hasFailures
    ? `<span class="sup-badge-warn">${escHtml(syncFailures.deadLettered)} dead-lettered, ${escHtml(syncFailures.pendingRetries)} pending retries</span>`
    : `<span class="sup-badge-ok">No sync failures detected</span>`;

  const byTargetRows = Object.entries(syncFailures.failuresByTarget)
    .map(([target, count]) => `<tr><td>${escHtml(target)}</td><td>${escHtml(count)}</td></tr>`)
    .join("");

  const recentRows = syncFailures.recentFailed.map((intent) => `
    <tr>
      <td>${escHtml(asText(intent.intent_id))}</td>
      <td>${escHtml(asText(intent.target_system))}</td>
      <td>${escHtml(asText(intent.entity_type))}</td>
      <td>${escHtml(asText(intent.status))}</td>
      <td>${escHtml(asText(intent.last_error_classification))}</td>
      <td>${escHtml(asText(intent.reference_id))}</td>
    </tr>
  `).join("");

  return `
    <p>${summaryBadge}</p>
    ${byTargetRows ? `
      <h4>Failures by target system</h4>
      <div class="sup-table-wrap">
        <table class="sup-table">
          <thead><tr><th>Target</th><th>Failures</th></tr></thead>
          <tbody>${byTargetRows}</tbody>
        </table>
      </div>` : ""}
    ${recentRows ? `
      <h4>Recent failed intents</h4>
      <div class="sup-table-wrap">
        <table class="sup-table">
          <thead><tr><th>ID</th><th>Target</th><th>Entity</th><th>Status</th><th>Error Class</th><th>Reference</th></tr></thead>
          <tbody>${recentRows}</tbody>
        </table>
      </div>` : ""}
  `.trim();
}

export function renderSupervisorDashboardHtml(sections) {
  const agingCount = sections.agingIncidents.length;
  const blockedCount = sections.closureBlocked.length;

  const agingBadge = agingCount > 0
    ? `<span class="sup-badge-warn">${agingCount} aging</span>`
    : `<span class="sup-badge-ok">None</span>`;
  const blockedBadge = blockedCount > 0
    ? `<span class="sup-badge-warn">${blockedCount} blocked</span>`
    : `<span class="sup-badge-ok">None</span>`;

  return `
    <div class="sup-kpi-row">
      <div class="sup-kpi-card">
        <div class="sup-kpi-label">Total Incidents</div>
        <div class="sup-kpi-value">${escHtml(sections.totalIncidents)}</div>
      </div>
      <div class="sup-kpi-card">
        <div class="sup-kpi-label">Aging (&gt;2h active)</div>
        <div class="sup-kpi-value">${agingBadge}</div>
      </div>
      <div class="sup-kpi-card">
        <div class="sup-kpi-label">Closure-blocked</div>
        <div class="sup-kpi-value">${blockedBadge}</div>
      </div>
    </div>

    <section class="panel sup-section">
      <h2>Aging / Delayed Incidents <span class="sup-count-badge">${escHtml(agingCount)}</span></h2>
      <p class="hint">Active incidents open for more than 2 hours.</p>
      ${renderAgingIncidentsHtml(sections.agingIncidents)}
    </section>

    <section class="panel sup-section">
      <h2>Closure-blocked Incidents <span class="sup-count-badge">${escHtml(blockedCount)}</span></h2>
      <p class="hint">Incidents in handover/destination status where closure_ready is false.</p>
      ${renderClosureBlockedHtml(sections.closureBlocked)}
    </section>

    <section class="panel sup-section">
      <h2>Workflow Health</h2>
      <p class="hint">Incident counts by current status.</p>
      ${renderWorkflowCountsHtml(sections.workflowCounts, sections.totalIncidents)}
    </section>

    <section class="panel sup-section">
      <h2>Sync Failure Indicators</h2>
      <p class="hint">Dead-lettered and pending-retry sync intents from the backend.</p>
      ${renderSyncFailureIndicatorsHtml(sections.syncFailures)}
    </section>
  `.trim();
}

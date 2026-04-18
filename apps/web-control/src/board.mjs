import { escapeHtml, formatDateTime, sanitizeClassToken } from "./security.mjs";

function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

const ACTIVE_INCIDENT_STATUSES = new Set([
  "new",
  "awaiting dispatch",
  "assigned",
  "crew acknowledged",
  "en route",
  "on scene",
  "treating on scene",
  "transporting",
  "at destination",
  "handover complete"
]);

const CLOSED_INCIDENT_STATUSES = new Set(["closed", "cancelled", "stood down"]);

const IN_PROGRESS_STATUSES = new Set([
  "assigned",
  "crew acknowledged",
  "en route",
  "on scene",
  "treating on scene",
  "transporting",
  "at destination",
  "handover complete"
]);

function summarizeAssignment(assignmentSummary) {
  if (!assignmentSummary) return "No assignment summary";
  return `${assignmentSummary.assignment_id} • ${assignmentSummary.status} • ${assignmentSummary.vehicle_id}`;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function priorityClass(priority) {
  const normalizedPriority = normalize(priority);
  if (normalizedPriority === "critical") return "priority-critical";
  if (normalizedPriority === "high") return "priority-high";
  if (normalizedPriority === "medium") return "priority-medium";
  return "priority-low";
}

function prioritySortValue(priority) {
  const normalizedPriority = normalize(priority);
  if (normalizedPriority === "critical") return 0;
  if (normalizedPriority === "high") return 1;
  if (normalizedPriority === "medium") return 2;
  if (normalizedPriority === "low") return 3;
  return 4;
}

function isActiveIncident(status) {
  return ACTIVE_INCIDENT_STATUSES.has(normalize(status));
}

function parseRecencyTimestamp(item) {
  const candidate = item.updatedAt || item.createdAt;
  if (!candidate) return 0;
  const parsed = Date.parse(candidate);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatAgeMinutes(ageMinutes) {
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0) return "Age unavailable";
  if (ageMinutes < 1) return "<1m";
  if (ageMinutes < 60) return `${Math.floor(ageMinutes)}m`;
  const hours = Math.floor(ageMinutes / 60);
  const mins = Math.floor(ageMinutes % 60);
  return `${hours}h ${mins}m`;
}

function isBlockedStatus(status) {
  const normalizedStatus = normalize(status);
  return normalizedStatus.includes("blocked") || normalizedStatus.includes("escalat") || normalizedStatus.includes("hold");
}

function getUrgencyGroup(item) {
  if (item.isBlockedOrEscalated) return "blocked";
  if (item.isClosed) return "closed";
  if (item.priorityRank === 0 && item.isActive) return "critical";
  if (item.priorityRank <= 1 && item.isActive) return "high";
  if (item.isUnassigned && item.isActive) return "pending-assignment";
  if (item.isInProgress) return "in-progress";
  return "pending-assignment";
}

function urgencyGroupMeta(groupId) {
  if (groupId === "critical") return { title: "Critical", collapsed: false };
  if (groupId === "high") return { title: "High Priority", collapsed: false };
  if (groupId === "pending-assignment") return { title: "Pending Assignment", collapsed: false };
  if (groupId === "in-progress") return { title: "In Progress", collapsed: false };
  if (groupId === "blocked") return { title: "Blocked / Escalation", collapsed: false };
  return { title: "Closed / Recently Resolved", collapsed: true };
}

function renderKpiChip({ label, value, tone = "default" }) {
  return `<span class="kpi-chip kpi-chip-${sanitizeClassToken(tone, "default")}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></span>`;
}

function compareWithinGroup(left, right) {
  const severityDelta = left.priorityRank - right.priorityRank;
  if (severityDelta !== 0) return severityDelta;
  if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
  const ageDelta = right.ageMinutes - left.ageMinutes;
  if (ageDelta !== 0) return ageDelta;
  if (left.isUnassigned !== right.isUnassigned) return left.isUnassigned ? -1 : 1;
  return parseRecencyTimestamp(right) - parseRecencyTimestamp(left);
}

function renderIncidentCard(item, { selectedIncidentId, changedIncidentIds }) {
  const closureReady = item.closureReady === undefined ? "Not present" : String(item.closureReady);
  const closureClassName = item.closureReady === true ? "closure-ready-true" : "closure-ready-false";
  const isSelected = selectedIncidentId === item.incidentId;
  const isChanged = changedIncidentIds.has(item.incidentId);

  return `
    <article class="board-card ${sanitizeClassToken(item.priorityClassName, "priority-low")} ${isSelected ? "selected" : ""} ${item.isBlockedOrEscalated ? "is-blocked" : ""} ${item.isOverdue ? "is-overdue" : ""} ${isChanged ? "is-changed" : ""}" data-incident-id="${escapeHtml(item.incidentId)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(item.incidentId)} details">
      <header>
        <h3><button type="button" class="link-button" data-select-incident="${escapeHtml(item.incidentId)}">${escapeHtml(item.incidentId)}</button></h3>
        <p class="incident-card-meta"><span class="priority-pill">${escapeHtml(item.priority)}</span><span class="age-pill ${item.isOverdue ? "age-pill-overdue" : ""}">${escapeHtml(item.ageLabel)}</span></p>
      </header>
      <p class="incident-status-row"><span class="status-pill">${escapeHtml(item.status)}</span>${item.isBlockedOrEscalated ? '<span class="escalation-pill">Escalated</span>' : ""}</p>
      <dl>
        <dt>Address / Location</dt><dd>${escapeHtml(item.locationSummary)}</dd>
        <dt>Assignment</dt><dd>${escapeHtml(item.assignmentSummary)}</dd>
        <dt>Closure Ready</dt><dd><span class="closure-pill ${closureClassName}">${escapeHtml(closureReady)}</span></dd>
      </dl>
      <div class="incident-card-actions">
        <button type="button" data-select-incident="${escapeHtml(item.incidentId)}">Review</button>
        <a href="?incidentId=${encodeURIComponent(item.incidentId)}">Open</a>
      </div>
    </article>
  `;
}

function renderIncidentDetailPanel(item) {
  if (!item) {
    return `
      <aside class="dispatcher-side-panel panel">
        <h3>Incident Details / Actions</h3>
        <p class="hint">Select an incident card to review details and jump into assignment workflows.</p>
      </aside>
    `;
  }

  return `
    <aside class="dispatcher-side-panel panel" aria-live="polite">
      <h3>Incident Details / Actions</h3>
      <dl>
        <dt>Incident ID</dt><dd>${escapeHtml(item.incidentId)}</dd>
        <dt>Priority / Age</dt><dd>${escapeHtml(item.priority)} • ${escapeHtml(item.ageLabel)}</dd>
        <dt>Status</dt><dd>${escapeHtml(item.status)}</dd>
        <dt>Zone / Location</dt><dd>${escapeHtml(item.locationSummary)}</dd>
        <dt>Assignment</dt><dd>${escapeHtml(item.assignmentSummary)}</dd>
      </dl>
      <div class="side-panel-actions">
        <button type="button" data-quick-action="load-incident" data-incident-id="${escapeHtml(item.incidentId)}">Review Summary</button>
        <button type="button" data-quick-action="load-crew-incident" data-incident-id="${escapeHtml(item.incidentId)}">Open Assignment / Crew View</button>
        <a href="?incidentId=${encodeURIComponent(item.incidentId)}">Open direct link</a>
      </div>
      <p class="hint">Escalation: ${item.isBlockedOrEscalated ? "Flagged for supervisor review" : "No escalation flags"}.</p>
    </aside>
  `;
}

export function buildDispatcherBoardItems(boardData, { now = Date.now() } = {}) {
  return boardData.map((incidentSummary) => {
    const createdAt = incidentSummary.created_at ?? null;
    const updatedAt = incidentSummary.updated_at ?? null;
    const createdTs = parseTimestamp(createdAt) || parseTimestamp(updatedAt);
    const ageMinutes = createdTs > 0 ? Math.max(0, (now - createdTs) / 60000) : Number.NaN;
    const status = asText(incidentSummary.status);
    const assignmentSummary = summarizeAssignment(incidentSummary.assignment_summary);
    const isUnassigned = assignmentSummary === "No assignment summary" || normalize(status) === "awaiting dispatch";
    const priority = asText(incidentSummary.priority);
    const priorityRank = prioritySortValue(priority);
    const isClosed = CLOSED_INCIDENT_STATUSES.has(normalize(status));
    const isInProgress = IN_PROGRESS_STATUSES.has(normalize(status));
    const isActive = isActiveIncident(status);
    const isBlockedOrEscalated = isBlockedStatus(status);
    const isOverdue = isActive && Number.isFinite(ageMinutes) && ageMinutes >= 20;

    const item = {
      incidentId: asText(incidentSummary.incident_id),
      priority,
      priorityRank,
      status,
      locationSummary: asText(incidentSummary.location_summary),
      assignmentSummary,
      closureReady: incidentSummary.closure_ready,
      priorityClassName: priorityClass(incidentSummary.priority),
      createdAt,
      updatedAt,
      ageMinutes,
      ageLabel: formatAgeMinutes(ageMinutes),
      isUnassigned,
      isClosed,
      isInProgress,
      isActive,
      isBlockedOrEscalated,
      isOverdue
    };

    return {
      ...item,
      urgencyGroup: getUrgencyGroup(item)
    };
  });
}

export function filterAndSortDispatcherItems(items, {
  activeOnly = false,
  status = "all",
  priority = "all",
  sort = "priority"
} = {}) {
  const normalizedStatus = normalize(status);
  const normalizedPriority = normalize(priority);

  const filteredItems = items.filter((item) => {
    if (activeOnly && !isActiveIncident(item.status)) return false;
    if (normalizedStatus && normalizedStatus !== "all" && normalize(item.status) !== normalizedStatus) return false;
    if (normalizedPriority && normalizedPriority !== "all" && normalize(item.priority) !== normalizedPriority) return false;
    return true;
  });

  return filteredItems.sort((left, right) => {
    if (sort === "recency") {
      return parseRecencyTimestamp(right) - parseRecencyTimestamp(left);
    }

    const priorityDelta = prioritySortValue(left.priority) - prioritySortValue(right.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return parseRecencyTimestamp(right) - parseRecencyTimestamp(left);
  });
}

export function renderDispatcherBoardHtml(items, {
  lastUpdatedLabel,
  refreshReason = "manual",
  paused = false,
  selectedIncidentId = "",
  changedIncidentIds = new Set()
} = {}) {
  const selectedItem = items.find((item) => item.incidentId === selectedIncidentId) ?? items[0] ?? null;

  const activeCount = items.filter((item) => item.isActive).length;
  const unassignedCount = items.filter((item) => item.isUnassigned && item.isActive).length;
  const overdueCount = items.filter((item) => item.isOverdue || item.isBlockedOrEscalated).length;

  const grouped = new Map();
  for (const item of items) {
    const group = item.urgencyGroup ?? getUrgencyGroup(item);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(item);
  }

  const groupOrder = ["critical", "high", "pending-assignment", "in-progress", "blocked", "closed"];
  const groupSections = groupOrder
    .map((groupId) => {
      const groupItems = (grouped.get(groupId) ?? []).sort(compareWithinGroup);
      if (groupItems.length === 0) return "";
      const meta = urgencyGroupMeta(groupId);
      const cards = groupItems
        .map((item) => renderIncidentCard(item, { selectedIncidentId: selectedItem?.incidentId, changedIncidentIds }))
        .join("\n");
      return `
        <section class="board-group board-group-${sanitizeClassToken(groupId)}">
          <h3>${escapeHtml(meta.title)} (${groupItems.length})</h3>
          <div class="board-grid${meta.collapsed ? " collapsed" : ""}">
            ${cards}
          </div>
        </section>
      `;
    })
    .join("\n");

  const refreshText = paused ? "Paused" : refreshReason === "auto" ? "Auto refreshed" : "Manual refresh";
  const refreshNote = lastUpdatedLabel
    ? `<div class="board-refresh"><span><strong>Last refresh:</strong> ${escapeHtml(formatDateTime(lastUpdatedLabel))}</span><span>${escapeHtml(refreshText)}</span></div>`
    : "";

  const emptyState = items.length === 0 ? "<p>No incidents currently available for dispatch.</p>" : "";

  return `
    <section class="dispatcher-board-shell">
      <header class="dispatcher-board-header panel">
        <h2>VEMS Dispatcher Board</h2>
        ${refreshNote}
        <div class="kpi-chip-row">
          ${renderKpiChip({ label: "Active", value: activeCount })}
          ${renderKpiChip({ label: "Unassigned", value: unassignedCount, tone: unassignedCount > 0 ? "warning" : "default" })}
          ${renderKpiChip({ label: "Overdue / Escalated", value: overdueCount, tone: overdueCount > 0 ? "danger" : "default" })}
        </div>
      </header>
      <div class="dispatcher-board-main">
        <div>
          ${emptyState}
          ${groupSections}
        </div>
        ${renderIncidentDetailPanel(selectedItem)}
      </div>
    </section>
  `;
}

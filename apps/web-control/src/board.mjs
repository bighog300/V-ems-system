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

export function buildDispatcherBoardItems(boardData) {
  return boardData.map((incidentSummary) => ({
    incidentId: asText(incidentSummary.incident_id),
    priority: asText(incidentSummary.priority),
    status: asText(incidentSummary.status),
    locationSummary: asText(incidentSummary.location_summary),
    assignmentSummary: summarizeAssignment(incidentSummary.assignment_summary),
    closureReady: incidentSummary.closure_ready,
    priorityClassName: priorityClass(incidentSummary.priority),
    createdAt: incidentSummary.created_at ?? null,
    updatedAt: incidentSummary.updated_at ?? null
  }));
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

export function renderDispatcherBoardHtml(items, { lastUpdatedLabel } = {}) {
  if (items.length === 0) {
    return `<p>No incidents currently available for dispatch.</p>`;
  }

  const cards = items
    .map((item) => {
      const closureReady = item.closureReady === undefined ? "Not present" : String(item.closureReady);
      const closureClassName = item.closureReady === true ? "closure-ready-true" : "closure-ready-false";
      return `
        <article class="board-card ${item.priorityClassName}">
          <header>
            <h3><a href="?incidentId=${encodeURIComponent(item.incidentId)}">${item.incidentId}</a></h3>
            <p><strong>Priority:</strong> <span class="priority-pill">${item.priority}</span></p>
          </header>
          <dl>
            <dt>Status</dt><dd><span class="status-pill">${item.status}</span></dd>
            <dt>Address / Location</dt><dd>${item.locationSummary}</dd>
            <dt>Assignment</dt><dd>${item.assignmentSummary}</dd>
            <dt>Closure Ready</dt><dd><span class="closure-pill ${closureClassName}">${closureReady}</span></dd>
          </dl>
        </article>
      `;
    })
    .join("\n");

  const refreshNote = lastUpdatedLabel ? `<p class="hint"><strong>Last updated:</strong> ${lastUpdatedLabel}</p>` : "";
  return `${refreshNote}<section class="board-grid">${cards}</section>`;
}

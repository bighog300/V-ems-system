function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function summarizeAssignment(assignmentSummary) {
  if (!assignmentSummary) return "No assignment summary";
  return `${assignmentSummary.assignment_id} • ${assignmentSummary.status} • ${assignmentSummary.vehicle_id}`;
}

function priorityClass(priority) {
  return String(priority).toLowerCase() === "critical" ? "priority-critical" : "";
}

export function buildDispatcherBoardItems(boardData) {
  return boardData.map((incidentSummary) => ({
    incidentId: asText(incidentSummary.incident_id),
    priority: asText(incidentSummary.priority),
    status: asText(incidentSummary.status),
    locationSummary: asText(incidentSummary.location_summary),
    assignmentSummary: summarizeAssignment(incidentSummary.assignment_summary),
    closureReady: incidentSummary.closure_ready,
    priorityClassName: priorityClass(incidentSummary.priority)
  }));
}

export function renderDispatcherBoardHtml(items) {
  if (items.length === 0) {
    return `<p>No incidents currently available for dispatch.</p>`;
  }

  const cards = items
    .map((item) => {
      const closureReady = item.closureReady === undefined ? "Not present" : String(item.closureReady);
      return `
        <article class="board-card ${item.priorityClassName}">
          <header>
            <h3><a href="?incidentId=${encodeURIComponent(item.incidentId)}">${item.incidentId}</a></h3>
            <p><strong>Priority:</strong> ${item.priority}</p>
          </header>
          <dl>
            <dt>Status</dt><dd>${item.status}</dd>
            <dt>Address / Location</dt><dd>${item.locationSummary}</dd>
            <dt>Assignment</dt><dd>${item.assignmentSummary}</dd>
            <dt>Closure Ready</dt><dd>${closureReady}</dd>
          </dl>
        </article>
      `;
    })
    .join("\n");

  return `<section class="board-grid">${cards}</section>`;
}

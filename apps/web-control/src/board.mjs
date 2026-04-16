function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function summarizeAssignment(assignmentSummary) {
  const first = assignmentSummary?.assignments?.[0];
  if (!first) return "No assignment summary";
  return `${first.assignment_id} • ${first.status} • ${first.vehicle_id}`;
}

function priorityClass(priority) {
  return String(priority).toLowerCase() === "critical" ? "priority-critical" : "";
}

export function buildDispatcherBoardItems(boardData) {
  return boardData.map(({ incident, assignmentSummary }) => ({
    incidentId: asText(incident.incident_id),
    priority: asText(incident.priority),
    status: asText(incident.status),
    locationSummary: asText(incident.address),
    assignmentSummary: summarizeAssignment(assignmentSummary),
    closureReady: incident.closure_ready,
    priorityClassName: priorityClass(incident.priority)
  }));
}

export function renderDispatcherBoardHtml(items, boardContext = {}) {
  if (items.length === 0) {
    return `<p>No incidents loaded. Enter one or more Incident IDs to populate the board.</p>`;
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

  const gapNote = boardContext.discoveryGap
    ? `<p class="hint">${boardContext.discoveryGap}</p>`
    : "";

  return `${gapNote}<section class="board-grid">${cards}</section>`;
}

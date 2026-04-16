function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function summarizeAssignment(assignmentSummary) {
  if (!assignmentSummary) return "No assignment summary";
  return `${assignmentSummary.assignment_id} • ${assignmentSummary.status} • ${assignmentSummary.vehicle_id}`;
}

export function buildCrewJobListItems(boardData) {
  return boardData.map((incidentSummary) => ({
    incidentId: asText(incidentSummary.incident_id),
    priority: asText(incidentSummary.priority),
    status: asText(incidentSummary.status),
    locationSummary: asText(incidentSummary.location_summary),
    assignmentSummary: summarizeAssignment(incidentSummary.assignment_summary),
    closureReady: incidentSummary.closure_ready
  }));
}

export function renderCrewJobListHtml(items) {
  if (items.length === 0) {
    return `<p>No assigned incidents available in the crew job list.</p>`;
  }

  const listItems = items
    .map((item) => {
      const closureReady = item.closureReady === undefined ? "" : `<p><strong>Closure Ready:</strong> ${item.closureReady}</p>`;
      return `
        <li class="crew-job-card">
          <h3><a href="?view=crew&incidentId=${encodeURIComponent(item.incidentId)}">${item.incidentId}</a></h3>
          <p><strong>Priority:</strong> ${item.priority}</p>
          <p><strong>Status:</strong> ${item.status}</p>
          <p><strong>Location:</strong> ${item.locationSummary}</p>
          <p><strong>Assignment:</strong> ${item.assignmentSummary}</p>
          ${closureReady}
        </li>
      `;
    })
    .join("\n");

  return `<ul class="crew-job-list">${listItems}</ul>`;
}

function renderAction(actionLabel, endpointPath, enabled = true) {
  const disabledAttribute = enabled ? "" : " disabled";
  const note = enabled ? "Backend write path available. UI flow pending." : "Requires encounter linkage first.";
  return `
    <li>
      <button type="button"${disabledAttribute}>${actionLabel}</button>
      <small>${endpointPath} — ${note}</small>
    </li>
  `;
}

export function renderCrewIncidentDetailHtml(summary, { includeActionPlaceholders = true } = {}) {
  const encounterSummary = summary.encounterSummary.available
    ? `${summary.encounterSummary.encounter_status} (${summary.encounterSummary.encounter_id})`
    : asText(summary.encounterSummary.detail);
  const handoverSummary = summary.handoverSummary.available
    ? `${summary.handoverSummary.handover_status} / ${summary.handoverSummary.disposition}`
    : asText(summary.handoverSummary.detail);
  const closureReady = summary.closureReady === undefined ? "Not present" : String(summary.closureReady);
  const encounterId = summary.encounterSummary.encounter_id;
  const encounterActionsEnabled = summary.encounterSummary.available;

  return `
    <section class="panel">
      <h2>Crew Incident Detail</h2>
      <dl>
        <dt>Incident ID</dt><dd>${summary.incidentId}</dd>
        <dt>Incident Header</dt><dd>${summary.priority} priority • ${summary.status}</dd>
        <dt>Address / Location</dt><dd>${summary.locationSummary}</dd>
        <dt>Assignment Summary</dt><dd>${summary.assignmentSummary.summary}</dd>
        <dt>Patient Link Summary</dt><dd>${summary.patientLinkSummary.summary}</dd>
        <dt>Encounter Summary</dt><dd>${encounterSummary}</dd>
        <dt>Handover Summary</dt><dd>${handoverSummary}</dd>
        <dt>Closure Ready</dt><dd>${closureReady}</dd>
      </dl>
    </section>
    ${
      includeActionPlaceholders
        ? `<section class="panel">
      <h3>Crew Clinical Actions (Write UI Pending)</h3>
      <p class="hint">
        The backend write endpoints exist. These buttons are explicit placeholders and do not submit data yet.
      </p>
      <ul class="crew-action-list">
        ${renderAction("Patient search/create/link", "POST /api/patients/search | POST /api/patients | POST /api/incidents/{incidentId}/patient-link")}
        ${renderAction("Create encounter", "POST /api/incidents/{incidentId}/encounters")}
        ${renderAction("Record observation", `POST /api/encounters/${encounterId ?? "{encounterId}"}/observations`, encounterActionsEnabled)}
        ${renderAction("Record intervention", `POST /api/encounters/${encounterId ?? "{encounterId}"}/interventions`, encounterActionsEnabled)}
        ${renderAction("Record handover", `POST /api/encounters/${encounterId ?? "{encounterId}"}/handover`, encounterActionsEnabled)}
      </ul>
    </section>`
        : ""
    }
  `;
}

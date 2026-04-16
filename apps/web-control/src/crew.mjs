function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function summarizeAssignment(assignmentSummary) {
  if (!assignmentSummary) return "No assignment summary";
  return `${assignmentSummary.assignment_id} • ${assignmentSummary.status} • ${assignmentSummary.vehicle_id}`;
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

function renderEncounterCreatePanel(summary) {
  if (summary.encounterSummary.available) {
    return `
      <section class="panel">
        <h3>Create Encounter</h3>
        <p class="success-note">
          Encounter already linked: ${summary.encounterSummary.encounter_id} (${summary.encounterSummary.encounter_status}).
        </p>
        <p>Use the existing encounter for further clinical actions.</p>
      </section>
    `;
  }

  const linkedPatientId = summary.patientLinkSummary.openemrPatientId;
  if (!linkedPatientId) {
    return `
      <section class="panel">
        <h3>Create Encounter</h3>
        <p class="error-note">
          Cannot create encounter yet. This incident must be linked to an OpenEMR patient first.
        </p>
        <p class="hint">Complete patient search/create/link before submitting encounter creation.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h3>Create Encounter</h3>
      <form id="createEncounterForm" class="encounter-form">
        <label>
          patient_id
          <input id="encounterPatientId" name="patient_id" value="${linkedPatientId}" required />
        </label>
        <label>
          care_started_at
          <input id="encounterCareStartedAt" name="care_started_at" type="datetime-local" required />
        </label>
        <label>
          crew_ids (comma separated)
          <input id="encounterCrewIds" name="crew_ids" placeholder="STAFF-001, STAFF-002" required />
        </label>
        <label>
          presenting_complaint
          <input id="encounterPresentingComplaint" name="presenting_complaint" placeholder="Primary complaint" required />
        </label>
        <button type="submit">Create encounter</button>
        <p id="createEncounterFeedback" aria-live="polite" class="hint"></p>
      </form>
    </section>
  `;
}

export function buildCreateEncounterPayload(formDataLike) {
  const patientId = String(formDataLike.get("patient_id") ?? "").trim();
  const careStartedAtRaw = String(formDataLike.get("care_started_at") ?? "").trim();
  const crewIdsRaw = String(formDataLike.get("crew_ids") ?? "").trim();
  const presentingComplaint = String(formDataLike.get("presenting_complaint") ?? "").trim();

  const crewIds = crewIdsRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const careStartedAtDate = careStartedAtRaw ? new Date(careStartedAtRaw) : null;
  const careStartedAtIso = careStartedAtDate && !Number.isNaN(careStartedAtDate.valueOf()) ? careStartedAtDate.toISOString() : "";

  return {
    payload: {
      patient_id: patientId,
      care_started_at: careStartedAtIso,
      crew_ids: crewIds,
      presenting_complaint: presentingComplaint
    },
    validationErrors: [
      !patientId ? "patient_id is required." : null,
      !careStartedAtRaw ? "care_started_at is required." : null,
      careStartedAtRaw && !careStartedAtIso ? "care_started_at must be a valid datetime." : null,
      crewIds.length === 0 ? "crew_ids must include at least one crew member." : null,
      !presentingComplaint ? "presenting_complaint is required." : null
    ].filter(Boolean)
  };
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
    ${renderEncounterCreatePanel(summary)}
    ${
      includeActionPlaceholders
        ? `<section class="panel">
      <h3>Crew Clinical Actions (Write UI Pending)</h3>
      <p class="hint">
        Observation/intervention/handover forms are not part of this task. Existing placeholders remain.
      </p>
      <ul class="crew-action-list">
        ${renderAction("Patient search/create/link", "POST /api/patients/search | POST /api/patients | POST /api/incidents/{incidentId}/patient-link")}
        ${renderAction("Record observation", `POST /api/encounters/${encounterId ?? "{encounterId}"}/observations`, encounterActionsEnabled)}
        ${renderAction("Record intervention", `POST /api/encounters/${encounterId ?? "{encounterId}"}/interventions`, encounterActionsEnabled)}
        ${renderAction("Record handover", `POST /api/encounters/${encounterId ?? "{encounterId}"}/handover`, encounterActionsEnabled)}
      </ul>
    </section>`
        : ""
    }
  `;
}

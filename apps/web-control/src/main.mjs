import {
  ApiError,
  createEncounterIntervention,
  createEncounterObservation,
  createIncidentEncounter,
  loadCrewJobListData,
  loadIncidentOperationalData
} from "./api.mjs";
import { buildIncidentOperationalSummary, renderOperationalSummaryHtml } from "./summary.mjs";
import {
  buildCreateEncounterPayload,
  buildCreateInterventionPayload,
  buildCreateObservationPayload,
  buildCrewJobListItems,
  renderCrewIncidentDetailHtml,
  renderCrewJobListHtml
} from "./crew.mjs";

function readConfig() {
  const apiBaseInput = document.querySelector("#apiBaseUrl");
  const incidentInput = document.querySelector("#incidentId");
  return {
    apiBaseUrl: apiBaseInput.value.trim().replace(/\/$/, ""),
    incidentId: incidentInput.value.trim()
  };
}

async function renderIncidentDetail() {
  const output = document.querySelector("#incidentOutput");
  const status = document.querySelector("#status");
  status.textContent = "Loading incident detail...";

  try {
    const config = readConfig();
    if (!config.apiBaseUrl || !config.incidentId) {
      throw new Error("API Base URL and Incident ID are required.");
    }

    const data = await loadIncidentOperationalData(config);
    const summary = buildIncidentOperationalSummary(data);

    output.innerHTML = `
      <section class="panel">
        <h2>Incident Detail / Operational Summary</h2>
        ${renderOperationalSummaryHtml(summary)}
      </section>
      <section class="panel">
        <h3>Read-Path Notes</h3>
        <ul>
          <li>${summary.assignmentSummary.detail}</li>
          <li>${summary.patientLinkSummary.detail}</li>
        </ul>
      </section>
    `;
    status.textContent = "Loaded.";
  } catch (error) {
    output.innerHTML = "";
    status.textContent = error.message;
  }
}

async function renderCrewJobList() {
  const output = document.querySelector("#crewJobOutput");
  const status = document.querySelector("#status");
  status.textContent = "Loading crew job list...";

  try {
    const config = readConfig();
    if (!config.apiBaseUrl) {
      throw new Error("API Base URL is required.");
    }
    const boardData = await loadCrewJobListData(config);
    const items = buildCrewJobListItems(boardData.items);
    output.innerHTML = renderCrewJobListHtml(items);
    status.textContent = "Loaded.";
  } catch (error) {
    output.innerHTML = "";
    status.textContent = error.message;
  }
}

function formatApiError(error) {
  if (!(error instanceof ApiError)) return error.message;
  const parts = [error.message];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.correlationId) parts.push(`correlation_id=${error.correlationId}`);
  if (error.details && typeof error.details === "object") {
    parts.push(`details=${Object.entries(error.details).map(([key, value]) => `${key}:${value}`).join(", ")}`);
  }
  return parts.join(" | ");
}

async function onCreateEncounterSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.querySelector("#createEncounterFeedback");
  const status = document.querySelector("#status");
  const submitButton = form.querySelector('button[type="submit"]');

  const config = readConfig();
  if (!config.apiBaseUrl || !config.incidentId) {
    feedback.textContent = "API Base URL and Incident ID are required.";
    feedback.className = "error-note";
    return;
  }

  const { payload, validationErrors } = buildCreateEncounterPayload(new FormData(form));
  if (validationErrors.length > 0) {
    feedback.textContent = validationErrors.join(" ");
    feedback.className = "error-note";
    return;
  }

  try {
    submitButton.disabled = true;
    feedback.className = "hint";
    feedback.textContent = "Creating encounter...";

    await createIncidentEncounter({ apiBaseUrl: config.apiBaseUrl, incidentId: config.incidentId, payload });
    status.textContent = "Encounter created. Refreshing crew incident detail...";
    await renderCrewIncidentDetail();
    status.textContent = "Encounter created and crew incident detail refreshed.";
  } catch (error) {
    feedback.textContent = formatApiError(error);
    feedback.className = "error-note";
    status.textContent = "Encounter create failed.";
  } finally {
    submitButton.disabled = false;
  }
}



async function onRecordObservationSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.querySelector("#recordObservationFeedback");
  const status = document.querySelector("#status");
  const submitButton = form.querySelector('button[type="submit"]');

  const config = readConfig();
  if (!config.apiBaseUrl || !config.incidentId) {
    feedback.textContent = "API Base URL and Incident ID are required.";
    feedback.className = "error-note";
    return;
  }

  const encounterId = form.dataset.encounterId;
  if (!encounterId) {
    feedback.textContent = "Observation entry requires an encounter first.";
    feedback.className = "error-note";
    return;
  }

  const { payload, validationErrors } = buildCreateObservationPayload(new FormData(form));
  if (validationErrors.length > 0) {
    feedback.textContent = validationErrors.join(" ");
    feedback.className = "error-note";
    return;
  }

  try {
    submitButton.disabled = true;
    feedback.className = "hint";
    feedback.textContent = "Recording observation...";

    await createEncounterObservation({
      apiBaseUrl: config.apiBaseUrl,
      encounterId,
      payload
    });
    status.textContent = "Observation recorded. Refreshing crew incident detail...";
    await renderCrewIncidentDetail();
    status.textContent = "Observation recorded and crew incident detail refreshed.";
  } catch (error) {
    feedback.textContent = formatApiError(error);
    feedback.className = "error-note";
    status.textContent = "Observation create failed.";
  } finally {
    submitButton.disabled = false;
  }
}

async function onRecordInterventionSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.querySelector("#recordInterventionFeedback");
  const status = document.querySelector("#status");
  const submitButton = form.querySelector('button[type="submit"]');

  const config = readConfig();
  if (!config.apiBaseUrl || !config.incidentId) {
    feedback.textContent = "API Base URL and Incident ID are required.";
    feedback.className = "error-note";
    return;
  }

  const encounterId = form.dataset.encounterId;
  if (!encounterId) {
    feedback.textContent = "Intervention entry requires an encounter first.";
    feedback.className = "error-note";
    return;
  }

  const { payload, validationErrors } = buildCreateInterventionPayload(new FormData(form));
  if (validationErrors.length > 0) {
    feedback.textContent = validationErrors.join(" ");
    feedback.className = "error-note";
    return;
  }

  try {
    submitButton.disabled = true;
    feedback.className = "hint";
    feedback.textContent = "Recording intervention...";

    await createEncounterIntervention({
      apiBaseUrl: config.apiBaseUrl,
      encounterId,
      payload
    });
    status.textContent = "Intervention recorded. Refreshing crew incident detail...";
    await renderCrewIncidentDetail();
    status.textContent = "Intervention recorded and crew incident detail refreshed.";
  } catch (error) {
    feedback.textContent = formatApiError(error);
    feedback.className = "error-note";
    status.textContent = "Intervention create failed.";
  } finally {
    submitButton.disabled = false;
  }
}

async function renderCrewIncidentDetail() {
  const output = document.querySelector("#crewIncidentOutput");
  const status = document.querySelector("#status");
  status.textContent = "Loading crew incident detail...";

  try {
    const config = readConfig();
    if (!config.apiBaseUrl || !config.incidentId) {
      throw new Error("API Base URL and Incident ID are required.");
    }

    const data = await loadIncidentOperationalData(config);
    const summary = buildIncidentOperationalSummary(data);
    output.innerHTML = renderCrewIncidentDetailHtml(summary);

    const createForm = document.querySelector("#createEncounterForm");
    if (createForm) {
      createForm.addEventListener("submit", onCreateEncounterSubmit);
    }

    const observationForm = document.querySelector("#recordObservationForm");
    if (observationForm && summary.encounterSummary.encounter_id) {
      observationForm.dataset.encounterId = summary.encounterSummary.encounter_id;
      observationForm.addEventListener("submit", onRecordObservationSubmit);
    }

    const interventionForm = document.querySelector("#recordInterventionForm");
    if (interventionForm && summary.encounterSummary.encounter_id) {
      interventionForm.dataset.encounterId = summary.encounterSummary.encounter_id;
      interventionForm.addEventListener("submit", onRecordInterventionSubmit);
    }

    status.textContent = "Loaded.";
  } catch (error) {
    output.innerHTML = "";
    status.textContent = error.message;
  }
}

function hydrateInputsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const incidentId = params.get("incidentId");
  const view = params.get("view");
  if (incidentId) {
    const incidentInput = document.querySelector("#incidentId");
    incidentInput.value = incidentId;
  }
  if (view === "crew" && incidentId) {
    void renderCrewIncidentDetail();
  }
}

document.querySelector("#loadIncident").addEventListener("click", renderIncidentDetail);
document.querySelector("#loadBoard").addEventListener("click", renderCrewJobList);
document.querySelector("#loadCrewIncident").addEventListener("click", renderCrewIncidentDetail);

hydrateInputsFromQuery();

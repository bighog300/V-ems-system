import {
  ApiError,
  closeIncident,
  createEncounterHandover,
  createEncounterIntervention,
  createEncounterObservation,
  createIncidentEncounter,
  loadCrewJobListData,
  loadDispatcherBoardData,
  loadIncidentOperationalData
} from "./api.mjs";
import { buildDispatcherBoardItems, filterAndSortDispatcherItems, renderDispatcherBoardHtml } from "./board.mjs";
import { buildIncidentOperationalSummary, renderIncidentClosePanelHtml, renderOperationalSummaryHtml } from "./summary.mjs";
import {
  buildCreateEncounterPayload,
  buildCreateHandoverPayload,
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

let closeIncidentFeedback = "";
let dispatcherPollingIntervalId = null;

function readDispatcherBoardControls() {
  const activeOnlyInput = document.querySelector("#boardFilterActive");
  const statusInput = document.querySelector("#boardFilterStatus");
  const priorityInput = document.querySelector("#boardFilterPriority");
  const sortInput = document.querySelector("#boardSortBy");
  return {
    activeOnly: Boolean(activeOnlyInput?.checked),
    status: statusInput?.value ?? "all",
    priority: priorityInput?.value ?? "all",
    sort: sortInput?.value ?? "priority"
  };
}

function startDispatcherPolling() {
  stopDispatcherPolling();
  const autoRefreshToggle = document.querySelector("#boardAutoRefresh");
  if (!autoRefreshToggle?.checked) return;

  dispatcherPollingIntervalId = window.setInterval(() => {
    void renderDispatcherBoard({ refreshReason: "auto" });
  }, 15000);
}

function stopDispatcherPolling() {
  if (!dispatcherPollingIntervalId) return;
  window.clearInterval(dispatcherPollingIntervalId);
  dispatcherPollingIntervalId = null;
}

async function renderDispatcherBoard({ refreshReason = "manual" } = {}) {
  const output = document.querySelector("#dispatcherBoardOutput");
  const status = document.querySelector("#status");
  const controls = readDispatcherBoardControls();
  const config = readConfig();
  if (!config.apiBaseUrl) {
    status.textContent = "API Base URL is required.";
    return;
  }

  if (refreshReason === "manual") {
    status.textContent = "Loading dispatcher board...";
  }

  try {
    const boardData = await loadDispatcherBoardData(config);
    const items = buildDispatcherBoardItems(boardData.items);
    const filteredAndSortedItems = filterAndSortDispatcherItems(items, controls);
    output.innerHTML = renderDispatcherBoardHtml(filteredAndSortedItems, {
      lastUpdatedLabel: new Date().toISOString()
    });
    if (refreshReason === "manual") {
      status.textContent = "Dispatcher board loaded.";
    } else {
      status.textContent = "Dispatcher board auto-refreshed.";
    }
  } catch (error) {
    output.innerHTML = "";
    status.textContent = error.message;
  }
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
      ${renderIncidentClosePanelHtml({ summary, closeErrorMessage: closeIncidentFeedback })}
      <section class="panel">
        <h3>Read-Path Notes</h3>
        <ul>
          <li>${summary.assignmentSummary.detail}</li>
          <li>${summary.patientLinkSummary.detail}</li>
        </ul>
      </section>
    `;
    const closeButton = document.querySelector("#closeIncidentAction");
    if (closeButton) {
      closeButton.addEventListener("click", onCloseIncidentClick);
    }
    status.textContent = "Loaded.";
  } catch (error) {
    output.innerHTML = "";
    status.textContent = error.message;
  }
}

async function onCloseIncidentClick(event) {
  const button = event.currentTarget;
  const status = document.querySelector("#status");
  const config = readConfig();
  if (!config.apiBaseUrl || !config.incidentId) {
    closeIncidentFeedback = "API Base URL and Incident ID are required.";
    await renderIncidentDetail();
    return;
  }

  try {
    button.disabled = true;
    closeIncidentFeedback = "";
    status.textContent = "Closing incident...";
    await closeIncident({ apiBaseUrl: config.apiBaseUrl, incidentId: config.incidentId });
    closeIncidentFeedback = "";
    await renderIncidentDetail();
    status.textContent = "Incident closed and incident detail refreshed.";
  } catch (error) {
    closeIncidentFeedback = formatApiError(error);
    await renderIncidentDetail();
    status.textContent = "Incident close failed.";
  } finally {
    button.disabled = false;
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

async function onRecordHandoverSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.querySelector("#recordHandoverFeedback");
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
    feedback.textContent = "Handover entry requires an encounter first.";
    feedback.className = "error-note";
    return;
  }

  const { payload, validationErrors } = buildCreateHandoverPayload(new FormData(form));
  if (validationErrors.length > 0) {
    feedback.textContent = validationErrors.join(" ");
    feedback.className = "error-note";
    return;
  }

  try {
    submitButton.disabled = true;
    feedback.className = "hint";
    feedback.textContent = "Recording handover...";

    await createEncounterHandover({
      apiBaseUrl: config.apiBaseUrl,
      encounterId,
      payload
    });
    status.textContent = "Handover recorded. Refreshing crew incident detail...";
    await renderCrewIncidentDetail();
    status.textContent = "Handover recorded and crew incident detail refreshed.";
  } catch (error) {
    feedback.textContent = formatApiError(error);
    feedback.className = "error-note";
    status.textContent = "Handover create failed.";
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

    const handoverForm = document.querySelector("#recordHandoverForm");
    if (handoverForm && summary.encounterSummary.encounter_id) {
      handoverForm.dataset.encounterId = summary.encounterSummary.encounter_id;
      handoverForm.addEventListener("submit", onRecordHandoverSubmit);
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
document.querySelector("#loadDispatcherBoard").addEventListener("click", () => void renderDispatcherBoard());
document.querySelector("#boardFilterActive").addEventListener("change", () => void renderDispatcherBoard());
document.querySelector("#boardFilterStatus").addEventListener("change", () => void renderDispatcherBoard());
document.querySelector("#boardFilterPriority").addEventListener("change", () => void renderDispatcherBoard());
document.querySelector("#boardSortBy").addEventListener("change", () => void renderDispatcherBoard());
document.querySelector("#boardAutoRefresh").addEventListener("change", () => {
  startDispatcherPolling();
  void renderDispatcherBoard();
});

hydrateInputsFromQuery();
startDispatcherPolling();

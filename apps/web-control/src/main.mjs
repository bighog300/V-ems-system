import { listPatientCases, loadPatientCaseData, createPatientCase, patientCaseWrite, patientIdentityWrite, getPatientCaseClinicalSection, savePatientCaseDemographics, createPatientCaseClinicalRecord, getEpcrSummary, epcrAction } from './api.mjs';
import { renderPatientCasesPanel } from './crew.mjs';
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
import { runCloseIncidentAction, runCrewFormAction } from "./workflow-actions.mjs";
import { buildDispatcherBoardItems, filterAndSortDispatcherItems, renderDispatcherBoardHtml } from "./board.mjs";
import { buildIncidentOperationalSummary, renderIncidentClosePanelHtml, renderOperationalSummaryHtml } from "./summary.mjs";
import {
  buildCreateEncounterPayload,
  buildCreateHandoverPayload,
  buildCreateInterventionPayload,
  buildCreateObservationPayload,
  buildCrewJobListItems,
  renderCrewIncidentDetailHtml,
  renderEpcrFinalizationPanel,
  renderCrewJobListHtml
} from "./crew.mjs";
import { applyProductionUiMode, readSessionFromDom } from "./session.mjs";
import { handleAppError, startPolling } from "./runtime.mjs";

function readConfig() {
  return readSessionFromDom();
}

let selectedPatientCaseId = '';
let selectedPatientIncidentId = '';
let crewRenderVersion = 0;
let closeIncidentFeedback = "";
let selectedDispatcherIncidentId = "";
let previousDispatcherSnapshot = new Map();

const dispatcherPolling = startPolling({
  enabled: () => Boolean(document.querySelector("#boardAutoRefresh")?.checked),
  intervalMs: 15000,
  onTick: () => renderDispatcherBoard({ refreshReason: "auto" })
});

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

function bindDispatcherBoardActions() {
  const boardOutput = document.querySelector("#dispatcherBoardOutput");
  boardOutput.querySelectorAll("[data-select-incident]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const incidentId = event.currentTarget.getAttribute("data-select-incident") ?? "";
      if (!incidentId) return;
      selectedDispatcherIncidentId = incidentId;
      void renderDispatcherBoard({ refreshReason: "manual" });
    });
  });

  boardOutput.querySelectorAll("[data-quick-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const incidentId = event.currentTarget.getAttribute("data-incident-id") ?? "";
      const incidentInput = document.querySelector("#incidentId");
      if (incidentInput && incidentId) {
        incidentInput.value = incidentId;
      }
      const action = event.currentTarget.getAttribute("data-quick-action");
      if (action === "load-incident") {
        void renderIncidentDetail();
        return;
      }
      if (action === "load-crew-incident") {
        void renderCrewIncidentDetail();
      }
    });
  });
}

function buildChangedIncidentIds(items) {
  const changed = new Set();
  for (const item of items) {
    const snapshot = `${item.status}|${item.assignmentSummary}|${item.updatedAt ?? ""}|${item.priority}`;
    if (previousDispatcherSnapshot.has(item.incidentId) && previousDispatcherSnapshot.get(item.incidentId) !== snapshot) {
      changed.add(item.incidentId);
    }
    previousDispatcherSnapshot.set(item.incidentId, snapshot);
  }
  return changed;
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
    const changedIncidentIds = buildChangedIncidentIds(filteredAndSortedItems);
    if (!selectedDispatcherIncidentId && filteredAndSortedItems.length > 0) {
      selectedDispatcherIncidentId = filteredAndSortedItems[0].incidentId;
    }
    output.innerHTML = renderDispatcherBoardHtml(filteredAndSortedItems, {
      lastUpdatedLabel: new Date(),
      refreshReason,
      paused: !document.querySelector("#boardAutoRefresh")?.checked,
      selectedIncidentId: selectedDispatcherIncidentId,
      changedIncidentIds
    });
    bindDispatcherBoardActions();
    if (refreshReason === "manual") {
      status.textContent = "Dispatcher board loaded.";
    } else {
      status.textContent = "Dispatcher board auto-refreshed.";
    }
  } catch (error) {
    output.innerHTML = "";
    previousDispatcherSnapshot = new Map();
    const errorResult = handleAppError(error, { statusEl: status, outputEl: output, fallbackPrefix: "Dispatcher board failed." });
    if (errorResult.authFailure) {
      dispatcherPolling.stop();
    }
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
    handleAppError(error, { statusEl: status, outputEl: output, fallbackPrefix: "Incident detail failed." });
  }
}

async function onCloseIncidentClick(event) {
  const button = event.currentTarget;
  const status = document.querySelector("#status");
  const config = readConfig();
  await runCloseIncidentAction({
    button,
    status,
    config,
    closeIncident,
    refreshIncidentDetail: renderIncidentDetail,
    formatError: formatApiError,
    setCloseFeedback: (message) => {
      closeIncidentFeedback = message;
    }
  });
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
    handleAppError(error, { statusEl: status, outputEl: output, fallbackPrefix: "Crew job list failed." });
  }
}

function formatApiError(error) {
  if (!(error instanceof ApiError)) return error.message;
  const parts = [error.message];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.correlationId) parts.push(`correlation_id=${error.correlationId}`);
  if (error.requestId) parts.push(`request_id=${error.requestId}`);
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
  await runCrewFormAction({
    form,
    feedback,
    status,
    submitButton,
    config: readConfig(),
    buildPayload: data => {
      const result = buildCreateEncounterPayload(data);
      result.validationErrors = result.validationErrors.filter(e => !e.startsWith('crew_ids'));
      delete result.payload.crew_ids;
      return result;
    },
    progressMessage: "Creating encounter...",
    successMessage: "Encounter created and crew incident detail refreshed.",
    failureStatusMessage: "Encounter create failed.",
    successStatusLoadingMessage: "Encounter created. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, incidentId, payload }) => ({ apiBaseUrl, incidentId, payload }),
    requestAction: request => patientCaseWrite({ ...readConfig(), ...request, patientCaseId: form.dataset.patientCaseId, action: 'encounters' }),
    refreshCrewIncidentDetail: renderCrewIncidentDetail,
    formatError: formatApiError
  });
}



async function onRecordObservationSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.querySelector("#recordObservationFeedback");
  const status = document.querySelector("#status");
  const submitButton = form.querySelector('button[type="submit"]');
  await runCrewFormAction({
    form,
    feedback,
    status,
    submitButton,
    config: readConfig(),
    requireEncounter: true,
    missingEncounterMessage: "Observation entry requires an encounter first.",
    buildPayload: buildCreateObservationPayload,
    progressMessage: "Recording observation...",
    successMessage: "Observation recorded and crew incident detail refreshed.",
    failureStatusMessage: "Observation create failed.",
    successStatusLoadingMessage: "Observation recorded. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, encounterId, payload }) => ({ apiBaseUrl, encounterId, payload }),
    requestAction: createEncounterObservation,
    refreshCrewIncidentDetail: renderCrewIncidentDetail,
    formatError: formatApiError
  });
}

async function onRecordInterventionSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.querySelector("#recordInterventionFeedback");
  const status = document.querySelector("#status");
  const submitButton = form.querySelector('button[type="submit"]');
  await runCrewFormAction({
    form,
    feedback,
    status,
    submitButton,
    config: readConfig(),
    requireEncounter: true,
    missingEncounterMessage: "Intervention entry requires an encounter first.",
    buildPayload: buildCreateInterventionPayload,
    progressMessage: "Recording intervention...",
    successMessage: "Intervention recorded and crew incident detail refreshed.",
    failureStatusMessage: "Intervention create failed.",
    successStatusLoadingMessage: "Intervention recorded. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, encounterId, payload }) => ({ apiBaseUrl, encounterId, payload }),
    requestAction: createEncounterIntervention,
    refreshCrewIncidentDetail: renderCrewIncidentDetail,
    formatError: formatApiError
  });
}

async function onRecordHandoverSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = document.querySelector("#recordHandoverFeedback");
  const status = document.querySelector("#status");
  const submitButton = form.querySelector('button[type="submit"]');
  await runCrewFormAction({
    form,
    feedback,
    status,
    submitButton,
    config: readConfig(),
    requireEncounter: true,
    missingEncounterMessage: "Handover entry requires an encounter first.",
    buildPayload: buildCreateHandoverPayload,
    progressMessage: "Recording handover...",
    successMessage: "Handover recorded and crew incident detail refreshed.",
    failureStatusMessage: "Handover create failed.",
    successStatusLoadingMessage: "Handover recorded. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, encounterId, payload }) => ({ apiBaseUrl, encounterId, payload }),
    requestAction: createEncounterHandover,
    refreshCrewIncidentDetail: renderCrewIncidentDetail,
    formatError: formatApiError
  });
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

    const version = ++crewRenderVersion;
    output.innerHTML = '';
    if (selectedPatientIncidentId !== config.incidentId) { selectedPatientCaseId = ''; selectedPatientIncidentId = config.incidentId; }
    const cases = await listPatientCases(config);
    if (!cases.some(c => c.patient_case_id === selectedPatientCaseId)) selectedPatientCaseId = '';
    const selectedId = selectedPatientCaseId;
    const caseData = selectedId ? await loadPatientCaseData({ ...config, patientCaseId: selectedId }) : null;
    const epcrData = selectedId ? await getEpcrSummary({ ...config, patientCaseId: selectedId }) : null;
    if (version !== crewRenderVersion) return;
    const summary = caseData ? buildIncidentOperationalSummary({ ...caseData, incident: { incident_id: config.incidentId, closure_ready: caseData.patientCase.closure_ready }, assignmentSummary: null }) : null;
    output.innerHTML = renderPatientCasesPanel(cases, selectedId) + (summary ? renderCrewIncidentDetailHtml(summary) + renderEpcrFinalizationPanel(epcrData, selectedId) : '');
    output.querySelectorAll('[data-patient-case]').forEach(button => button.addEventListener('click', () => {
      if (output.querySelector('[data-submitting="true"]')) return;
      if (selectedPatientCaseId && !window.confirm('Switch patient? Unsaved entries will be discarded.')) return;
      selectedPatientCaseId = button.dataset.patientCase;
      void renderCrewIncidentDetail();
    }));
    const bindCaseForm = (selector, action) => {
      const form = output.querySelector(selector);
      form?.addEventListener('submit', async event => {
        event.preventDefault();
        if (form.dataset.submitting === 'true') return;
        form.dataset.submitting = 'true';
        try { await action(Object.fromEntries(new FormData(form)), event); }
        catch (error) { status.textContent = formatApiError(error); }
        finally { form.dataset.submitting = 'false'; }
      });
    };
    bindCaseForm('#createPatientCaseForm', async payload => {
      for (const key of Object.keys(payload)) if (!payload[key]) delete payload[key];
      const created = await createPatientCase({ ...config, payload });
      selectedPatientCaseId = created.patient_case_id;
      await renderCrewIncidentDetail();
    });
    bindCaseForm('#provisionalPatientForm', async () => {
      await patientCaseWrite({ ...config, patientCaseId: selectedId, action: 'provisional-patient', payload: {} });
      await renderCrewIncidentDetail();
    });
    bindCaseForm('#patientLinkForm', async payload => {
      await patientCaseWrite({ ...config, patientCaseId: selectedId, action: 'patient-link', payload });
      await renderCrewIncidentDetail();
    });
    bindCaseForm('#patientIdentityForm', async (payload, event) => {
      const action = event.submitter?.value ?? 'search';
      const result = await patientIdentityWrite({ ...config, action, payload });
      output.querySelector('#patientSearchResults').textContent = JSON.stringify(result, null, 2);
      if (action === 'create') output.querySelector('#patientLinkForm [name="openemr_patient_id"]').value = result.patient_id;
    });
    bindCaseForm('#demographicsForm', async payload => {
      payload.dob_unknown = Boolean(payload.dob_unknown);
      await savePatientCaseDemographics({ ...config, patientCaseId: selectedId, payload });
      await renderCrewIncidentDetail();
    });
    bindCaseForm('#assessmentForm', async payload => {
      let structured;
      try { structured = JSON.parse(payload.payload || '{}'); } catch { throw new Error('Assessment payload must be valid JSON'); }
      await createPatientCaseClinicalRecord({ ...config, patientCaseId: selectedId, section: 'assessments', payload: { section_type: payload.section_type, payload: structured } });
      await renderCrewIncidentDetail();
    });
    bindCaseForm('#dispositionForm', async payload => {
      await createPatientCaseClinicalRecord({ ...config, patientCaseId: selectedId, section: 'disposition', payload });
      await renderCrewIncidentDetail();
    });
    bindCaseForm('#epcrCompleteForm', async () => { await epcrAction({ ...config, patientCaseId: selectedId, action: 'complete' }); await renderCrewIncidentDetail(); });
    bindCaseForm('#epcrSignatureForm', async payload => { await epcrAction({ ...config, patientCaseId: selectedId, action: 'signatures', payload }); await renderCrewIncidentDetail(); });
    bindCaseForm('#epcrSubmitForm', async () => { await epcrAction({ ...config, patientCaseId: selectedId, action: 'submit' }); await renderCrewIncidentDetail(); });
    bindCaseForm('#epcrReviewForm', async payload => { await epcrAction({ ...config, patientCaseId: selectedId, action: 'review', payload }); await renderCrewIncidentDetail(); });
    bindCaseForm('#epcrFlagForm', async payload => { await epcrAction({ ...config, patientCaseId: selectedId, action: 'qa-flags', payload }); await renderCrewIncidentDetail(); });
    bindCaseForm('#epcrAmendmentForm', async payload => { await epcrAction({ ...config, patientCaseId: selectedId, action: 'amendments', payload: { ...payload, after_value: payload.after_value } }); await renderCrewIncidentDetail(); });
    if (!summary) { status.textContent = 'Select a patient case.'; return; }

    const createForm = document.querySelector("#createEncounterForm");
    if (createForm) {
      createForm.dataset.patientCaseId = selectedId;
      createForm.querySelector('[name="patient_id"]').readOnly = true;
      const crewInput = createForm.querySelector('[name="crew_ids"]');
      crewInput.value = caseData.patientCase.crew_ids.join(', ');
      crewInput.required = false; crewInput.readOnly = true;
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
    handleAppError(error, { statusEl: status, outputEl: output, fallbackPrefix: "Crew incident detail failed." });
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
  dispatcherPolling.start();
  void renderDispatcherBoard();
});

applyProductionUiMode();
hydrateInputsFromQuery();
dispatcherPolling.start();

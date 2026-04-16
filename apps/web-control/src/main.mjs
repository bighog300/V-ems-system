import { loadDispatcherBoardData, loadIncidentOperationalData } from "./api.mjs";
import { buildDispatcherBoardItems, renderDispatcherBoardHtml } from "./board.mjs";
import { buildIncidentOperationalSummary, renderOperationalSummaryHtml } from "./summary.mjs";

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

async function renderDispatcherBoard() {
  const output = document.querySelector("#boardOutput");
  const status = document.querySelector("#status");
  status.textContent = "Loading dispatcher board...";

  try {
    const config = readConfig();
    if (!config.apiBaseUrl) {
      throw new Error("API Base URL is required.");
    }
    const boardData = await loadDispatcherBoardData(config);
    const items = buildDispatcherBoardItems(boardData.items);
    output.innerHTML = renderDispatcherBoardHtml(items);
    status.textContent = "Loaded.";
  } catch (error) {
    output.innerHTML = "";
    status.textContent = error.message;
  }
}

function hydrateInputsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const incidentId = params.get("incidentId");
  if (incidentId) {
    const incidentInput = document.querySelector("#incidentId");
    incidentInput.value = incidentId;
  }
}

document.querySelector("#loadIncident").addEventListener("click", renderIncidentDetail);
document.querySelector("#loadBoard").addEventListener("click", renderDispatcherBoard);

hydrateInputsFromQuery();

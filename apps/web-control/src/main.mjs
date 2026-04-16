import { loadCrewJobListData, loadIncidentOperationalData } from "./api.mjs";
import { buildIncidentOperationalSummary, renderOperationalSummaryHtml } from "./summary.mjs";
import { buildCrewJobListItems, renderCrewIncidentDetailHtml, renderCrewJobListHtml } from "./crew.mjs";

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

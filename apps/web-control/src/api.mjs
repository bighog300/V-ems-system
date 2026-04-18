import { ApiError } from "./api-error.mjs";
import { requestJson } from "./http.mjs";

async function getJson(fetchImpl, url, config, options = {}) {
  return requestJson(fetchImpl, url, { config, ...options });
}

async function postJson(fetchImpl, url, payload, config, options = {}) {
  const result = await requestJson(fetchImpl, url, { method: "POST", payload, config, ...options });
  return result.data;
}

async function patchJson(fetchImpl, url, payload, config, options = {}) {
  const result = await requestJson(fetchImpl, url, { method: "PATCH", payload, config, ...options });
  return result.data;
}

export async function loadIncidentOperationalData({ apiBaseUrl, incidentId, fetchImpl = fetch, signal, ...config }) {
  const incidentUrl = `${apiBaseUrl}/api/incidents/${incidentId}`;
  const incidentResult = await getJson(fetchImpl, incidentUrl, config, { signal });
  if (incidentResult.notFound) throw new Error(`Incident ${incidentId} not found`);

  const assignmentResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/assignments`, config, { signal });
  const assignmentSummary = assignmentResult.notFound ? null : assignmentResult.data;

  const patientLinkResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-link`, config, { signal });
  const patientLink = patientLinkResult.notFound ? null : patientLinkResult.data;

  const encounterResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/encounters`, config, { signal });
  const encounterLink = encounterResult.notFound ? null : encounterResult.data;

  let handover = null;
  let interventions = [];
  if (encounterLink?.encounter_id) {
    const handoverResult = await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterLink.encounter_id}/handover`, config, { signal });
    handover = handoverResult.notFound ? null : handoverResult.data;
    const interventionsResult = await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterLink.encounter_id}/interventions`, config, { signal });
    interventions = interventionsResult.notFound ? [] : (interventionsResult.data ?? []);
  }

  return {
    incident: incidentResult.data,
    assignmentSummary,
    patientLink,
    encounterLink,
    handover,
    interventions
  };
}

export async function createIncidentEncounter({ apiBaseUrl, incidentId, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/encounters`, payload, config);
}

export async function createEncounterObservation({ apiBaseUrl, encounterId, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterId}/observations`, payload, config);
}

export async function createEncounterIntervention({ apiBaseUrl, encounterId, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterId}/interventions`, payload, config);
}

export async function createEncounterHandover({ apiBaseUrl, encounterId, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterId}/handover`, payload, config);
}

export async function closeIncident({ apiBaseUrl, incidentId, fetchImpl = fetch, ...config }) {
  return patchJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}`, { action: "close_incident" }, config);
}

export async function assignIncident({ apiBaseUrl, incidentId, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/assignments`, payload, config);
}

export async function escalateIncident({ apiBaseUrl, incidentId, fetchImpl = fetch, ...config }) {
  return patchJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}`, { action: "escalate_priority" }, config);
}

export async function loadDispatcherBoardData({ apiBaseUrl, fetchImpl = fetch, ...config }) {
  const boardList = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents`, config);
  return {
    items: boardList.data?.incidents ?? []
  };
}

export async function loadCrewJobListData({ apiBaseUrl, fetchImpl = fetch, ...config }) {
  const boardList = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents`, config);
  return {
    items: boardList.data?.incidents ?? []
  };
}

export { ApiError };

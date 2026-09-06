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

  let patientLinkResult;
  try {
    patientLinkResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-link`, config, { signal });
  } catch (error) {
    if (error.status !== 409) throw error;
    const patientCases = await listPatientCases({ apiBaseUrl, incidentId, fetchImpl, ...config });
    return { incident: incidentResult.data, assignmentSummary, patientCases, patientLink: null, encounterLink: null, handover: null, interventions: [] };
  }
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

export async function loadPatientCaseData({ apiBaseUrl, patientCaseId, fetchImpl = fetch, ...config }) {
  const root = `${apiBaseUrl}/api/patient-cases/${patientCaseId}`;
  const c = await getJson(fetchImpl, root, config);
  if (c.notFound) throw new Error('Patient case not found');
  const patient = await getJson(fetchImpl, `${root}/patient-link`, config);
  const encounter = await getJson(fetchImpl, `${root}/encounter`, config);
  let handover = null, interventions = [];
  if (encounter.data?.encounter_id) {
    handover = (await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounter.data.encounter_id}/handover`, config)).data;
    interventions = (await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounter.data.encounter_id}/interventions`, config)).data ?? [];
  }
  return { patientCase: c.data, patientLink: patient.data, encounterLink: encounter.data, handover, interventions };
}
export async function listPatientCases({ apiBaseUrl, incidentId, fetchImpl = fetch, ...config }) {
  return (await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-cases`, config)).data?.patient_cases ?? [];
}
export async function createPatientCase({ apiBaseUrl, incidentId, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-cases`, payload, config, { headers: { 'idempotency-key': config.idempotencyKey ?? crypto.randomUUID() } });
}
export async function patientCaseWrite({ apiBaseUrl, patientCaseId, action, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/${action}`, payload, config, { headers: { 'idempotency-key': config.idempotencyKey ?? crypto.randomUUID() } });
}
export async function getPatientCaseClinicalSection({ apiBaseUrl, patientCaseId, section, fetchImpl = fetch, ...config }) {
  return (await getJson(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/${section}`, config)).data;
}
export async function savePatientCaseDemographics({ apiBaseUrl, patientCaseId, payload, fetchImpl = fetch, ...config }) {
  return (await requestJson(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/demographics`, { method: "PUT", payload, config })).data;
}
export async function createPatientCaseClinicalRecord({ apiBaseUrl, patientCaseId, section, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/${section}`, payload, config, { headers: { 'idempotency-key': config.idempotencyKey ?? crypto.randomUUID() } });
}
export async function getEpcrSummary({ apiBaseUrl, patientCaseId, fetchImpl = fetch, ...config }) {
  return (await getJson(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/summary`, config)).data;
}
export async function epcrAction({ apiBaseUrl, patientCaseId, action, payload = {}, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/${action}`, payload, config, { headers: { 'idempotency-key': config.idempotencyKey ?? crypto.randomUUID() } });
}
export async function patientIdentityWrite({ apiBaseUrl, action, payload, fetchImpl = fetch, ...config }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/patients${action === 'search' ? '/search' : ''}`, payload, config, { headers: { 'idempotency-key': config.idempotencyKey ?? crypto.randomUUID() } });
}

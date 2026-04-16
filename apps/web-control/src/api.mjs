class ApiError extends Error {
  constructor(message, { status, code, retryable, correlationId, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.correlationId = correlationId;
    this.details = details;
  }
}

function buildApiError(status, body = {}) {
  const error = body?.error ?? {};
  return new ApiError(error.message ?? `Request failed: ${status}`, {
    status,
    code: error.code,
    retryable: error.retryable,
    correlationId: error.correlation_id,
    details: error.details
  });
}

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { "content-type": "application/json" } });
  if (response.status === 404) return { notFound: true, data: null };
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw buildApiError(response.status, body);
  }
  return { notFound: false, data: await response.json() };
}

async function postJson(fetchImpl, url, payload) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildApiError(response.status, body);
  }

  return body;
}

async function patchJson(fetchImpl, url, payload) {
  const response = await fetchImpl(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildApiError(response.status, body);
  }

  return body;
}

export async function loadIncidentOperationalData({ apiBaseUrl, incidentId, fetchImpl = fetch }) {
  const incidentUrl = `${apiBaseUrl}/api/incidents/${incidentId}`;
  const incidentResult = await getJson(fetchImpl, incidentUrl);
  if (incidentResult.notFound) throw new Error(`Incident ${incidentId} not found`);

  const assignmentResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/assignments`);
  const assignmentSummary = assignmentResult.notFound ? null : assignmentResult.data;

  const patientLinkResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-link`);
  const patientLink = patientLinkResult.notFound ? null : patientLinkResult.data;

  const encounterResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/encounters`);
  const encounterLink = encounterResult.notFound ? null : encounterResult.data;

  let handover = null;
  let interventions = [];
  if (encounterLink?.encounter_id) {
    const handoverResult = await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterLink.encounter_id}/handover`);
    handover = handoverResult.notFound ? null : handoverResult.data;
    const interventionsResult = await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterLink.encounter_id}/interventions`);
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

export async function createIncidentEncounter({ apiBaseUrl, incidentId, payload, fetchImpl = fetch }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/encounters`, payload);
}

export async function createEncounterObservation({ apiBaseUrl, encounterId, payload, fetchImpl = fetch }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterId}/observations`, payload);
}

export async function createEncounterIntervention({ apiBaseUrl, encounterId, payload, fetchImpl = fetch }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterId}/interventions`, payload);
}

export async function createEncounterHandover({ apiBaseUrl, encounterId, payload, fetchImpl = fetch }) {
  return postJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterId}/handover`, payload);
}

export async function closeIncident({ apiBaseUrl, incidentId, fetchImpl = fetch }) {
  return patchJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}`, { action: "close_incident" });
}

export async function loadDispatcherBoardData({ apiBaseUrl, fetchImpl = fetch }) {
  const boardList = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents`);
  return {
    items: boardList.data?.incidents ?? []
  };
}

export async function loadCrewJobListData({ apiBaseUrl, fetchImpl = fetch }) {
  const boardList = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents`);
  return {
    items: boardList.data?.incidents ?? []
  };
}

export { ApiError };

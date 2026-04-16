class ApiError extends Error {
  constructor(message, { status, code, retryable, correlationId, requestId, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.correlationId = correlationId;
    this.requestId = requestId;
    this.details = details;
  }
}

function buildApiError(status, body = {}, response = undefined) {
  const error = body?.error ?? {};
  return new ApiError(error.message ?? `Request failed: ${status}`, {
    status,
    code: error.code,
    retryable: error.retryable,
    correlationId: error.correlation_id ?? response?.headers?.get("x-correlation-id") ?? undefined,
    requestId: response?.headers?.get("x-request-id") ?? undefined,
    details: error.details
  });
}

function buildRequestHeaders(config, headers = {}) {
  const actorId = config.actorId?.trim();
  const actorRole = config.actorRole?.trim();
  return {
    "content-type": "application/json",
    ...(actorId ? { "x-actor-id": actorId } : {}),
    ...(actorRole ? { "x-user-role": actorRole } : {}),
    ...headers
  };
}

async function getJson(fetchImpl, url, config, headers = {}) {
  const response = await fetchImpl(url, { headers: buildRequestHeaders(config, headers) });
  if (response.status === 404) return { notFound: true, data: null };
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw buildApiError(response.status, body, response);
  }
  return { notFound: false, data: await response.json() };
}

async function postJson(fetchImpl, url, payload, config, headers = {}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: buildRequestHeaders(config, headers),
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildApiError(response.status, body, response);
  }

  return body;
}

async function patchJson(fetchImpl, url, payload, config, headers = {}) {
  const response = await fetchImpl(url, {
    method: "PATCH",
    headers: buildRequestHeaders(config, headers),
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw buildApiError(response.status, body, response);
  }

  return body;
}

export async function loadIncidentOperationalData({ apiBaseUrl, incidentId, fetchImpl = fetch, ...config }) {
  const incidentUrl = `${apiBaseUrl}/api/incidents/${incidentId}`;
  const incidentResult = await getJson(fetchImpl, incidentUrl, config);
  if (incidentResult.notFound) throw new Error(`Incident ${incidentId} not found`);

  const assignmentResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/assignments`, config);
  const assignmentSummary = assignmentResult.notFound ? null : assignmentResult.data;

  const patientLinkResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-link`, config);
  const patientLink = patientLinkResult.notFound ? null : patientLinkResult.data;

  const encounterResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/encounters`, config);
  const encounterLink = encounterResult.notFound ? null : encounterResult.data;

  let handover = null;
  let interventions = [];
  if (encounterLink?.encounter_id) {
    const handoverResult = await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterLink.encounter_id}/handover`, config);
    handover = handoverResult.notFound ? null : handoverResult.data;
    const interventionsResult = await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterLink.encounter_id}/interventions`, config);
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

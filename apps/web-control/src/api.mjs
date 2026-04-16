async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { "content-type": "application/json" } });
  if (response.status === 404) return { notFound: true, data: null };
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${response.status}`);
  }
  return { notFound: false, data: await response.json() };
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
  if (encounterLink?.encounter_id) {
    const handoverResult = await getJson(fetchImpl, `${apiBaseUrl}/api/encounters/${encounterLink.encounter_id}/handover`);
    handover = handoverResult.notFound ? null : handoverResult.data;
  }

  return {
    incident: incidentResult.data,
    assignmentSummary,
    patientLink,
    encounterLink,
    handover
  };
}

export async function loadDispatcherBoardData({ apiBaseUrl, incidentIds, fetchImpl = fetch }) {
  const uniqueIncidentIds = [...new Set(incidentIds.map((id) => id.trim()).filter(Boolean))];
  const records = [];

  for (const incidentId of uniqueIncidentIds) {
    const incidentResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}`);
    if (incidentResult.notFound) {
      records.push({
        incident: {
          incident_id: incidentId,
          priority: "Unavailable",
          status: "Not found",
          address: "Incident ID not found"
        },
        assignmentSummary: null
      });
      continue;
    }

    const assignmentResult = await getJson(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/assignments`);
    records.push({
      incident: incidentResult.data,
      assignmentSummary: assignmentResult.notFound ? null : assignmentResult.data
    });
  }

  return {
    items: records,
    discoveryGap: "Board list discovery is currently manual because no incident-list GET endpoint is available yet."
  };
}

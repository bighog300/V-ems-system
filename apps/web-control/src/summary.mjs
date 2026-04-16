function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function buildIncidentOperationalSummary({ incident, encounterLink, handover }) {
  const patientIdFromEncounter = encounterLink?.openemr_patient_id;

  const assignmentSummary = {
    available: false,
    summary: "Assignment summary unavailable",
    detail: "Backend gap: there is no existing read endpoint for assignment-by-incident in current API contracts."
  };

  const patientLinkSummary = patientIdFromEncounter
    ? {
        available: true,
        summary: `Linked patient ${patientIdFromEncounter}`,
        detail: "Derived from encounter linkage read path (GET /api/incidents/{incidentId}/encounters)."
      }
    : {
        available: false,
        summary: "Patient link unavailable",
        detail: "Backend gap: no existing read endpoint for patient link status by incident."
      };

  const encounterSummary = encounterLink
    ? {
        available: true,
        encounter_id: asText(encounterLink.encounter_id),
        openemr_encounter_id: asText(encounterLink.openemr_encounter_id),
        encounter_status: asText(encounterLink.encounter_status),
        care_started_at: asText(encounterLink.care_started_at)
      }
    : {
        available: false,
        detail: "No encounter linkage found for this incident."
      };

  const handoverSummary = handover
    ? {
        available: true,
        handover_status: asText(handover.handover_status),
        disposition: asText(handover.disposition),
        closure_ready: handover.closure_ready
      }
    : {
        available: false,
        detail: encounterLink
          ? "No handover payload available from GET /api/encounters/{encounterId}/handover."
          : "Handover is unavailable until encounter linkage exists."
      };

  return {
    incidentId: asText(incident.incident_id),
    priority: asText(incident.priority),
    status: asText(incident.status),
    locationSummary: asText(incident.address),
    closureReady: incident.closure_ready,
    assignmentSummary,
    patientLinkSummary,
    encounterSummary,
    handoverSummary
  };
}

export function renderOperationalSummaryHtml(summary) {
  const closureReady = summary.closureReady === undefined ? "Not present" : String(summary.closureReady);
  const encounterSection = summary.encounterSummary.available
    ? `${summary.encounterSummary.encounter_status} (${summary.encounterSummary.encounter_id})`
    : asText(summary.encounterSummary.detail);
  const handoverSection = summary.handoverSummary.available
    ? `${summary.handoverSummary.handover_status} / ${summary.handoverSummary.disposition}`
    : asText(summary.handoverSummary.detail);

  return `
    <dl>
      <dt>Incident ID</dt><dd>${summary.incidentId}</dd>
      <dt>Priority</dt><dd>${summary.priority}</dd>
      <dt>Status</dt><dd>${summary.status}</dd>
      <dt>Address / Location</dt><dd>${summary.locationSummary}</dd>
      <dt>Assignment Summary</dt><dd>${summary.assignmentSummary.summary}</dd>
      <dt>Patient Link Summary</dt><dd>${summary.patientLinkSummary.summary}</dd>
      <dt>Encounter Summary</dt><dd>${encounterSection}</dd>
      <dt>Closure Ready</dt><dd>${closureReady}</dd>
      <dt>Handover</dt><dd>${handoverSection}</dd>
    </dl>
  `;
}

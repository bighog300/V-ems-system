function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

export function buildIncidentOperationalSummary({ incident, assignmentSummary: assignmentData, patientLink, encounterLink, handover }) {
  const assignments = assignmentData?.assignments ?? [];
  const latestAssignment = assignments[0];
  const assignmentSummary = latestAssignment
    ? {
        available: true,
        summary: `${latestAssignment.assignment_id} • ${latestAssignment.status} • ${latestAssignment.vehicle_id}`,
        detail: `${assignments.length} assignment record(s) returned by GET /api/incidents/{incidentId}/assignments.`
      }
    : {
        available: false,
        summary: "Assignment summary unavailable",
        detail: "No assignment summary returned by GET /api/incidents/{incidentId}/assignments."
      };

  const patientLinkSummary = patientLink
    ? {
        available: true,
        summary: patientLink.openemr_patient_id
          ? `Linked patient ${patientLink.openemr_patient_id}`
          : `Patient link ${patientLink.verification_status}`,
        detail: "Loaded from GET /api/incidents/{incidentId}/patient-link."
      }
    : {
        available: false,
        summary: "Patient link unavailable",
        detail: "No patient-link summary returned by GET /api/incidents/{incidentId}/patient-link."
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

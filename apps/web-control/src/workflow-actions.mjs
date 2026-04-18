function setFeedback(feedback, { message, kind = "hint" }) {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = kind;
}

function lockSubmission(control) {
  if (!control) return false;
  if (control.dataset?.submitting === "true") return true;
  if (control.dataset) control.dataset.submitting = "true";
  control.disabled = true;
  return false;
}

function unlockSubmission(control) {
  if (!control) return;
  if (control.dataset) control.dataset.submitting = "false";
  control.disabled = false;
}

export async function runCloseIncidentAction({
  button,
  status,
  setCloseFeedback,
  config,
  closeIncident,
  refreshIncidentDetail,
  formatError
}) {
  if (!config.apiBaseUrl || !config.incidentId) {
    setCloseFeedback("API Base URL and Incident ID are required.");
    await refreshIncidentDetail();
    return;
  }

  if (lockSubmission(button)) {
    status.textContent = "Incident close already in progress...";
    return;
  }

  try {
    setCloseFeedback("");
    status.textContent = "Closing incident...";
    await closeIncident({ apiBaseUrl: config.apiBaseUrl, incidentId: config.incidentId });
    setCloseFeedback("");
    await refreshIncidentDetail();
    status.textContent = "Incident closed and incident detail refreshed.";
  } catch (error) {
    setCloseFeedback(formatError(error));
    await refreshIncidentDetail();
    status.textContent = "Incident close failed.";
  } finally {
    unlockSubmission(button);
  }
}

export async function runAssignIncidentAction({
  button,
  vehicleIdInput,
  status,
  setAssignFeedback,
  config,
  assignIncident,
  refreshIncidentDetail,
  formatError
}) {
  if (!config.apiBaseUrl || !config.incidentId) {
    setAssignFeedback("API Base URL and Incident ID are required.");
    return;
  }

  const vehicleId = vehicleIdInput?.value?.trim() ?? "";
  if (!vehicleId) {
    setAssignFeedback("Vehicle ID is required to assign.");
    return;
  }

  if (lockSubmission(button)) {
    status.textContent = "Assignment already in progress...";
    return;
  }

  try {
    setAssignFeedback("");
    status.textContent = "Assigning vehicle...";
    await assignIncident({ apiBaseUrl: config.apiBaseUrl, incidentId: config.incidentId, payload: { vehicle_id: vehicleId } });
    setAssignFeedback("");
    await refreshIncidentDetail();
    status.textContent = "Vehicle assigned and incident detail refreshed.";
  } catch (error) {
    setAssignFeedback(formatError(error));
    await refreshIncidentDetail();
    status.textContent = "Assignment failed.";
  } finally {
    unlockSubmission(button);
  }
}

export async function runEscalateIncidentAction({
  button,
  status,
  setEscalateFeedback,
  config,
  escalateIncident,
  refreshIncidentDetail,
  formatError
}) {
  if (!config.apiBaseUrl || !config.incidentId) {
    setEscalateFeedback("API Base URL and Incident ID are required.");
    return;
  }

  if (lockSubmission(button)) {
    status.textContent = "Escalation already in progress...";
    return;
  }

  try {
    setEscalateFeedback("");
    status.textContent = "Escalating priority...";
    await escalateIncident({ apiBaseUrl: config.apiBaseUrl, incidentId: config.incidentId });
    setEscalateFeedback("");
    await refreshIncidentDetail();
    status.textContent = "Priority escalated and incident detail refreshed.";
  } catch (error) {
    setEscalateFeedback(formatError(error));
    await refreshIncidentDetail();
    status.textContent = "Escalation failed.";
  } finally {
    unlockSubmission(button);
  }
}

export async function runCrewFormAction({
  form,
  feedback,
  status,
  submitButton,
  config,
  requireEncounter = false,
  missingEncounterMessage,
  buildPayload,
  progressMessage,
  successMessage,
  failureStatusMessage,
  successStatusLoadingMessage,
  buildRequest,
  requestAction,
  refreshCrewIncidentDetail,
  formatError
}) {
  if (!config.apiBaseUrl || !config.incidentId) {
    setFeedback(feedback, { message: "API Base URL and Incident ID are required.", kind: "error-note" });
    return;
  }

  if (lockSubmission(submitButton)) {
    setFeedback(feedback, { message: "Submission already in progress...", kind: "hint" });
    return;
  }

  const encounterId = form?.dataset?.encounterId;
  if (requireEncounter && !encounterId) {
    setFeedback(feedback, { message: missingEncounterMessage, kind: "error-note" });
    unlockSubmission(submitButton);
    return;
  }

  const { payload, validationErrors } = buildPayload(new FormData(form));
  if (validationErrors.length > 0) {
    setFeedback(feedback, { message: validationErrors.join(" "), kind: "error-note" });
    unlockSubmission(submitButton);
    return;
  }

  try {
    setFeedback(feedback, { message: progressMessage, kind: "hint" });

    await requestAction(buildRequest({ apiBaseUrl: config.apiBaseUrl, incidentId: config.incidentId, encounterId, payload }));
    status.textContent = successStatusLoadingMessage;
    await refreshCrewIncidentDetail();
    setFeedback(feedback, { message: successMessage, kind: "success-note" });
    status.textContent = successMessage;
  } catch (error) {
    setFeedback(feedback, { message: formatError(error), kind: "error-note" });
    status.textContent = failureStatusMessage;
  } finally {
    unlockSubmission(submitButton);
  }
}

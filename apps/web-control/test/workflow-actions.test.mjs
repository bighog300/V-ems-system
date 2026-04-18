import test from "node:test";
import assert from "node:assert/strict";
import { runAssignIncidentAction, runCloseIncidentAction, runCrewFormAction, runEscalateIncidentAction } from "../src/workflow-actions.mjs";

class FakeControl {
  constructor() {
    this.disabled = false;
    this.dataset = {};
    this.textContent = "";
    this.className = "";
  }
}

class FakeForm extends FakeControl {
  constructor(fields = {}, encounterId = "") {
    super();
    this.fields = fields;
    this.dataset.encounterId = encounterId;
    this.submitButton = new FakeControl();
  }

  querySelector(selector) {
    if (selector === 'button[type="submit"]') return this.submitButton;
    return null;
  }
}

global.FormData = class {
  constructor(form) {
    this.form = form;
  }

  get(key) {
    return this.form.fields[key];
  }
};

test("runAssignIncidentAction assigns vehicle and refreshes on success", async () => {
  const button = new FakeControl();
  const vehicleIdInput = { value: "AMB-201" };
  const status = new FakeControl();
  let assignFeedback = "";
  const assignments = [];
  let refreshCalls = 0;

  await runAssignIncidentAction({
    button,
    vehicleIdInput,
    status,
    setAssignFeedback: (msg) => { assignFeedback = msg; },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000010" },
    assignIncident: async ({ payload }) => { assignments.push(payload); },
    refreshIncidentDetail: async () => { refreshCalls += 1; },
    formatError: (err) => err.message
  });

  assert.equal(assignments.length, 1);
  assert.deepEqual(assignments[0], { vehicle_id: "AMB-201" });
  assert.equal(refreshCalls, 1);
  assert.equal(assignFeedback, "");
  assert.equal(status.textContent, "Vehicle assigned and incident detail refreshed.");
  assert.equal(button.disabled, false);
});

test("runAssignIncidentAction rejects empty vehicle ID without locking button", async () => {
  const button = new FakeControl();
  const vehicleIdInput = { value: "   " };
  const status = new FakeControl();
  let assignFeedback = "";
  let assignCalls = 0;

  await runAssignIncidentAction({
    button,
    vehicleIdInput,
    status,
    setAssignFeedback: (msg) => { assignFeedback = msg; },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000011" },
    assignIncident: async () => { assignCalls += 1; },
    refreshIncidentDetail: async () => {},
    formatError: (err) => err.message
  });

  assert.equal(assignCalls, 0);
  assert.equal(assignFeedback, "Vehicle ID is required to assign.");
  assert.equal(button.disabled, false);
});

test("runAssignIncidentAction handles backend error and sets feedback", async () => {
  const button = new FakeControl();
  const vehicleIdInput = { value: "AMB-999" };
  const status = new FakeControl();
  let assignFeedback = "";

  await runAssignIncidentAction({
    button,
    vehicleIdInput,
    status,
    setAssignFeedback: (msg) => { assignFeedback = msg; },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000012" },
    assignIncident: async () => { throw new Error("VEHICLE_NOT_AVAILABLE"); },
    refreshIncidentDetail: async () => {},
    formatError: (err) => `formatted:${err.message}`
  });

  assert.equal(assignFeedback, "formatted:VEHICLE_NOT_AVAILABLE");
  assert.equal(status.textContent, "Assignment failed.");
  assert.equal(button.disabled, false);
});

test("runAssignIncidentAction prevents duplicate in-flight submissions", async () => {
  const button = new FakeControl();
  const vehicleIdInput = { value: "AMB-300" };
  const status = new FakeControl();
  let callCount = 0;
  let resolveFirst;

  const first = runAssignIncidentAction({
    button,
    vehicleIdInput,
    status,
    setAssignFeedback: () => {},
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000013" },
    assignIncident: async () => {
      callCount += 1;
      await new Promise((resolve) => { resolveFirst = resolve; });
    },
    refreshIncidentDetail: async () => {},
    formatError: (err) => err.message
  });

  const second = runAssignIncidentAction({
    button,
    vehicleIdInput,
    status,
    setAssignFeedback: () => {},
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000013" },
    assignIncident: async () => { callCount += 1; },
    refreshIncidentDetail: async () => {},
    formatError: (err) => err.message
  });

  await Promise.resolve();
  assert.equal(callCount, 1);
  assert.equal(status.textContent, "Assignment already in progress...");
  resolveFirst();
  await Promise.all([first, second]);
  assert.equal(button.dataset.submitting, "false");
});

test("runEscalateIncidentAction escalates priority and refreshes on success", async () => {
  const button = new FakeControl();
  const status = new FakeControl();
  let escalateFeedback = "";
  let escalateCalls = 0;
  let refreshCalls = 0;

  await runEscalateIncidentAction({
    button,
    status,
    setEscalateFeedback: (msg) => { escalateFeedback = msg; },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000020" },
    escalateIncident: async () => { escalateCalls += 1; },
    refreshIncidentDetail: async () => { refreshCalls += 1; },
    formatError: (err) => err.message
  });

  assert.equal(escalateCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(escalateFeedback, "");
  assert.equal(status.textContent, "Priority escalated and incident detail refreshed.");
  assert.equal(button.disabled, false);
});

test("runEscalateIncidentAction handles backend error and sets feedback", async () => {
  const button = new FakeControl();
  const status = new FakeControl();
  let escalateFeedback = "";

  await runEscalateIncidentAction({
    button,
    status,
    setEscalateFeedback: (msg) => { escalateFeedback = msg; },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000021" },
    escalateIncident: async () => { throw new Error("ALREADY_CRITICAL"); },
    refreshIncidentDetail: async () => {},
    formatError: (err) => `formatted:${err.message}`
  });

  assert.equal(escalateFeedback, "formatted:ALREADY_CRITICAL");
  assert.equal(status.textContent, "Escalation failed.");
  assert.equal(button.disabled, false);
});

test("runEscalateIncidentAction prevents duplicate in-flight submissions", async () => {
  const button = new FakeControl();
  const status = new FakeControl();
  let callCount = 0;
  let resolveFirst;

  const first = runEscalateIncidentAction({
    button,
    status,
    setEscalateFeedback: () => {},
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000022" },
    escalateIncident: async () => {
      callCount += 1;
      await new Promise((resolve) => { resolveFirst = resolve; });
    },
    refreshIncidentDetail: async () => {},
    formatError: (err) => err.message
  });

  const second = runEscalateIncidentAction({
    button,
    status,
    setEscalateFeedback: () => {},
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000022" },
    escalateIncident: async () => { callCount += 1; },
    refreshIncidentDetail: async () => {},
    formatError: (err) => err.message
  });

  await Promise.resolve();
  assert.equal(callCount, 1);
  assert.equal(status.textContent, "Escalation already in progress...");
  resolveFirst();
  await Promise.all([first, second]);
  assert.equal(button.dataset.submitting, "false");
});

test("runCrewFormAction submits create encounter flow with loading and success feedback", async () => {
  const form = new FakeForm(
    {
      patient_id: "OE-123",
      care_started_at: "2026-04-16T12:30",
      crew_ids: "STAFF-001",
      presenting_complaint: "Chest pain"
    },
    ""
  );
  const feedback = new FakeControl();
  const status = new FakeControl();

  const requests = [];
  let refreshCalls = 0;
  await runCrewFormAction({
    form,
    feedback,
    status,
    submitButton: form.submitButton,
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000001" },
    buildPayload: (formData) => ({
      payload: {
        patient_id: formData.get("patient_id")
      },
      validationErrors: []
    }),
    progressMessage: "Creating encounter...",
    successMessage: "Encounter created and crew incident detail refreshed.",
    failureStatusMessage: "Encounter create failed.",
    successStatusLoadingMessage: "Encounter created. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, incidentId, payload }) => ({ apiBaseUrl, incidentId, payload }),
    requestAction: async (request) => {
      requests.push(request);
    },
    refreshCrewIncidentDetail: async () => {
      refreshCalls += 1;
    },
    formatError: (error) => error.message
  });

  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    apiBaseUrl: "http://example.test",
    incidentId: "INC-000001",
    payload: { patient_id: "OE-123" }
  });
  assert.equal(refreshCalls, 1);
  assert.equal(feedback.className, "success-note");
  assert.equal(feedback.textContent, "Encounter created and crew incident detail refreshed.");
  assert.equal(status.textContent, "Encounter created and crew incident detail refreshed.");
  assert.equal(form.submitButton.disabled, false);
  assert.equal(form.submitButton.dataset.submitting, "false");
});

test("runCrewFormAction prevents duplicate in-flight submission", async () => {
  const form = new FakeForm({ name: "oxygen" }, "ENC-123");
  const feedback = new FakeControl();
  const status = new FakeControl();

  let resolveRequest;
  let requestCount = 0;
  const firstCall = runCrewFormAction({
    form,
    feedback,
    status,
    submitButton: form.submitButton,
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000002" },
    requireEncounter: true,
    missingEncounterMessage: "Intervention entry requires an encounter first.",
    buildPayload: () => ({ payload: { name: "oxygen" }, validationErrors: [] }),
    progressMessage: "Recording intervention...",
    successMessage: "Intervention recorded and crew incident detail refreshed.",
    failureStatusMessage: "Intervention create failed.",
    successStatusLoadingMessage: "Intervention recorded. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, encounterId, payload }) => ({ apiBaseUrl, encounterId, payload }),
    requestAction: async () => {
      requestCount += 1;
      await new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
    refreshCrewIncidentDetail: async () => {},
    formatError: (error) => error.message
  });

  const secondCall = runCrewFormAction({
    form,
    feedback,
    status,
    submitButton: form.submitButton,
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000002" },
    requireEncounter: true,
    missingEncounterMessage: "Intervention entry requires an encounter first.",
    buildPayload: () => ({ payload: { name: "oxygen" }, validationErrors: [] }),
    progressMessage: "Recording intervention...",
    successMessage: "Intervention recorded and crew incident detail refreshed.",
    failureStatusMessage: "Intervention create failed.",
    successStatusLoadingMessage: "Intervention recorded. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, encounterId, payload }) => ({ apiBaseUrl, encounterId, payload }),
    requestAction: async () => {
      requestCount += 1;
    },
    refreshCrewIncidentDetail: async () => {},
    formatError: (error) => error.message
  });

  await Promise.resolve();
  assert.equal(requestCount, 1);
  assert.equal(feedback.textContent, "Submission already in progress...");

  resolveRequest();
  await Promise.all([firstCall, secondCall]);
  assert.equal(form.submitButton.dataset.submitting, "false");
});

test("runCrewFormAction handles validation and backend error feedback for observation/handover", async () => {
  const form = new FakeForm({}, "ENC-456");
  const feedback = new FakeControl();
  const status = new FakeControl();

  await runCrewFormAction({
    form,
    feedback,
    status,
    submitButton: form.submitButton,
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000003" },
    requireEncounter: true,
    missingEncounterMessage: "Observation entry requires an encounter first.",
    buildPayload: () => ({ payload: {}, validationErrors: ["recorded_at is required."] }),
    progressMessage: "Recording observation...",
    successMessage: "Observation recorded and crew incident detail refreshed.",
    failureStatusMessage: "Observation create failed.",
    successStatusLoadingMessage: "Observation recorded. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, encounterId, payload }) => ({ apiBaseUrl, encounterId, payload }),
    requestAction: async () => {},
    refreshCrewIncidentDetail: async () => {},
    formatError: (error) => error.message
  });

  assert.equal(feedback.className, "error-note");
  assert.equal(feedback.textContent, "recorded_at is required.");

  await runCrewFormAction({
    form,
    feedback,
    status,
    submitButton: form.submitButton,
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000003" },
    requireEncounter: true,
    missingEncounterMessage: "Handover entry requires an encounter first.",
    buildPayload: () => ({ payload: { handover_status: "Handover Completed" }, validationErrors: [] }),
    progressMessage: "Recording handover...",
    successMessage: "Handover recorded and crew incident detail refreshed.",
    failureStatusMessage: "Handover create failed.",
    successStatusLoadingMessage: "Handover recorded. Refreshing crew incident detail...",
    buildRequest: ({ apiBaseUrl, encounterId, payload }) => ({ apiBaseUrl, encounterId, payload }),
    requestAction: async () => {
      throw new Error("code=INVALID_STATUS_TRANSITION");
    },
    refreshCrewIncidentDetail: async () => {},
    formatError: (error) => `formatted:${error.message}`
  });

  assert.equal(feedback.className, "error-note");
  assert.equal(feedback.textContent, "formatted:code=INVALID_STATUS_TRANSITION");
  assert.equal(status.textContent, "Handover create failed.");
});

test("runCloseIncidentAction supports success, duplicate prevention, and error feedback", async () => {
  const button = new FakeControl();
  const status = new FakeControl();
  let closeFeedback = "";
  let closeCount = 0;
  let resolveClose;

  const firstClose = runCloseIncidentAction({
    button,
    status,
    setCloseFeedback: (message) => {
      closeFeedback = message;
    },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000004" },
    closeIncident: async () => {
      closeCount += 1;
      await new Promise((resolve) => {
        resolveClose = resolve;
      });
    },
    refreshIncidentDetail: async () => {},
    formatError: (error) => error.message
  });

  const secondClose = runCloseIncidentAction({
    button,
    status,
    setCloseFeedback: (message) => {
      closeFeedback = message;
    },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000004" },
    closeIncident: async () => {
      closeCount += 1;
    },
    refreshIncidentDetail: async () => {},
    formatError: (error) => error.message
  });

  await Promise.resolve();
  assert.equal(closeCount, 1);
  assert.equal(status.textContent, "Incident close already in progress...");

  resolveClose();
  await Promise.all([firstClose, secondClose]);
  assert.equal(status.textContent, "Incident closed and incident detail refreshed.");

  await runCloseIncidentAction({
    button,
    status,
    setCloseFeedback: (message) => {
      closeFeedback = message;
    },
    config: { apiBaseUrl: "http://example.test", incidentId: "INC-000004" },
    closeIncident: async () => {
      throw new Error("code=INVALID_STATUS_TRANSITION");
    },
    refreshIncidentDetail: async () => {},
    formatError: (error) => `formatted:${error.message}`
  });

  assert.equal(closeFeedback, "formatted:code=INVALID_STATUS_TRANSITION");
  assert.equal(status.textContent, "Incident close failed.");
  assert.equal(button.dataset.submitting, "false");
});

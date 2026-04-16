function asText(value, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function summarizeAssignment(assignmentSummary) {
  if (!assignmentSummary) return "No assignment summary";
  return `${assignmentSummary.assignment_id} • ${assignmentSummary.status} • ${assignmentSummary.vehicle_id}`;
}

function renderAction(actionLabel, endpointPath, enabled = true) {
  const disabledAttribute = enabled ? "" : " disabled";
  const note = enabled ? "Backend write path available. UI flow pending." : "Requires encounter linkage first.";
  return `
    <li>
      <button type="button"${disabledAttribute}>${actionLabel}</button>
      <small>${endpointPath} — ${note}</small>
    </li>
  `;
}

function toLocalDateTimeInputValue(dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.valueOf())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(date.valueOf() - offsetMs);
  return localDate.toISOString().slice(0, 16);
}

function isEncounterActive(summary) {
  return Boolean(summary?.encounterSummary?.available);
}

function hasPatientLink(summary) {
  return Boolean(summary?.patientLinkSummary?.openemrPatientId);
}

function getWorkflowGuidance(summary) {
  if (!hasPatientLink(summary)) {
    return {
      title: "Link patient before clinical charting",
      detail: "Use patient search/create/link first. Encounter and downstream care actions stay blocked until a patient is linked.",
      action: "Run patient search/create/link"
    };
  }

  if (!isEncounterActive(summary)) {
    return {
      title: "Create encounter to start care progression",
      detail: "Patient link exists, but no encounter linkage is available for this incident yet.",
      action: "Submit Create Encounter"
    };
  }

  const encounterStatus = summary.encounterSummary.encounter_status;
  if (encounterStatus === "Ready for Handover" && !summary.handoverSummary.available) {
    return {
      title: "Record handover now",
      detail: "Encounter is in Ready for Handover. Capture destination/disposition to advance closure readiness.",
      action: "Submit Record Handover"
    };
  }

  if (summary.handoverSummary.available && summary.handoverSummary.handover_status !== "Handover Completed") {
    return {
      title: "Complete handover",
      detail: "A handover record exists but is not yet marked Handover Completed.",
      action: "Update handover to Handover Completed"
    };
  }

  if (summary.closureReady === true) {
    return {
      title: "Workflow complete for crew",
      detail: "Backend reports closure_ready=true. Confirm with dispatch/supervisor for final incident closure action.",
      action: "Confirm closure handoff"
    };
  }

  return {
    title: "Continue assessment/treatment updates",
    detail: "Encounter is active. Record observations and interventions as care progresses.",
    action: "Record observation or intervention"
  };
}

function renderWorkflowGuidancePanel(summary) {
  const guidance = getWorkflowGuidance(summary);
  return `
    <section class="panel">
      <h3>Next Step Guidance</h3>
      <p><strong>${guidance.title}</strong></p>
      <p class="hint">${guidance.detail}</p>
      <p><strong>Suggested next action:</strong> ${guidance.action}</p>
    </section>
  `;
}

function renderCareTimeline(summary) {
  const encounterStatus = summary.encounterSummary.available ? summary.encounterSummary.encounter_status : "Not Started";
  const handoverStatus = summary.handoverSummary.available ? summary.handoverSummary.handover_status : null;

  const timelineItems = [
    {
      label: "Assignment active",
      detail: summary.assignmentSummary.summary,
      state: summary.assignmentSummary.available ? "done" : "upcoming"
    },
    {
      label: "Patient linked",
      detail: summary.patientLinkSummary.summary,
      state: hasPatientLink(summary) ? "done" : "current"
    },
    {
      label: "Encounter created",
      detail: summary.encounterSummary.available ? `${encounterStatus} (${summary.encounterSummary.encounter_id})` : summary.encounterSummary.detail,
      state: summary.encounterSummary.available ? "done" : hasPatientLink(summary) ? "current" : "upcoming"
    },
    {
      label: "Assessment & treatment",
      detail: summary.encounterSummary.available
        ? `Encounter status: ${encounterStatus}`
        : "Assessment and interventions unlock after encounter creation.",
      state: summary.encounterSummary.available && !summary.handoverSummary.available ? "current" : summary.handoverSummary.available ? "done" : "upcoming"
    },
    {
      label: "Handover",
      detail: summary.handoverSummary.available
        ? `${summary.handoverSummary.handover_status} / ${summary.handoverSummary.disposition}`
        : "No handover recorded yet.",
      state:
        handoverStatus === "Handover Completed"
          ? "done"
          : summary.encounterSummary.available && encounterStatus === "Ready for Handover"
            ? "current"
            : summary.encounterSummary.available
              ? "upcoming"
              : "upcoming"
    },
    {
      label: "Closure readiness",
      detail: summary.closureReady === undefined ? "Not present in payload" : `closure_ready=${summary.closureReady}`,
      state: summary.closureReady === true ? "done" : summary.handoverSummary.available ? "current" : "upcoming"
    }
  ];

  const itemsHtml = timelineItems
    .map((item) => `<li class="timeline-item timeline-item-${item.state}"><p><strong>${item.label}</strong></p><p>${item.detail}</p></li>`)
    .join("\n");

  return `
    <section class="panel">
      <h3>Care Timeline / Progression</h3>
      <ol class="care-timeline">${itemsHtml}</ol>
    </section>
  `;
}

function renderEncounterCreatePanel(summary, { defaultDateTimeValue = "" } = {}) {
  if (summary.encounterSummary.available) {
    return `
      <section class="panel">
        <h3>Create Encounter</h3>
        <p class="success-note">
          Encounter already linked: ${summary.encounterSummary.encounter_id} (${summary.encounterSummary.encounter_status}).
        </p>
        <p>Use the existing encounter for further clinical actions.</p>
      </section>
    `;
  }

  const linkedPatientId = summary.patientLinkSummary.openemrPatientId;
  if (!linkedPatientId) {
    return `
      <section class="panel">
        <h3>Create Encounter</h3>
        <p class="error-note">
          Cannot create encounter yet. This incident must be linked to an OpenEMR patient first.
        </p>
        <p class="hint">Complete patient search/create/link before submitting encounter creation.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h3>Create Encounter</h3>
      <form id="createEncounterForm" class="encounter-form">
        <label>
          patient_id
          <input id="encounterPatientId" name="patient_id" value="${linkedPatientId}" required />
        </label>
        <label>
          care_started_at
          <input id="encounterCareStartedAt" name="care_started_at" type="datetime-local" value="${defaultDateTimeValue}" required />
        </label>
        <label>
          crew_ids (comma separated)
          <input id="encounterCrewIds" name="crew_ids" placeholder="STAFF-001, STAFF-002" required />
        </label>
        <label>
          presenting_complaint
          <input id="encounterPresentingComplaint" name="presenting_complaint" placeholder="Primary complaint" required />
        </label>
        <button type="submit">Create encounter</button>
        <p id="createEncounterFeedback" aria-live="polite" class="hint"></p>
      </form>
    </section>
  `;
}

function renderObservationPanel(summary, { defaultDateTimeValue = "" } = {}) {
  if (!summary.encounterSummary.available) {
    return `
      <section class="panel">
        <h3>Record Observation</h3>
        <p class="error-note">Observation entry is unavailable because no encounter is linked yet.</p>
        <p class="hint">Create an encounter first, then return here to submit clinical observations.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h3>Record Observation</h3>
      <form id="recordObservationForm" class="encounter-form">
        <label>
          recorded_at
          <input name="recorded_at" type="datetime-local" value="${defaultDateTimeValue}" required />
        </label>
        <label>
          systolic BP (mmHg)
          <input name="systolic_bp_mmhg" type="number" inputmode="numeric" min="40" max="300" required />
        </label>
        <label>
          diastolic BP (mmHg)
          <input name="diastolic_bp_mmhg" type="number" inputmode="numeric" min="20" max="200" required />
        </label>
        <label>
          heart rate (bpm)
          <input name="heart_rate_bpm" type="number" inputmode="numeric" min="0" max="300" required />
        </label>
        <label>
          respiratory rate (bpm)
          <input name="respiratory_rate_bpm" type="number" inputmode="numeric" min="0" max="120" required />
        </label>
        <label>
          SpO2 (%)
          <input name="spo2_pct" type="number" inputmode="decimal" min="0" max="100" step="0.1" required />
        </label>
        <label>
          temperature (°C)
          <input name="temperature_c" type="number" inputmode="decimal" min="25" max="45" step="0.1" required />
        </label>
        <label>
          pain score (0-10)
          <input name="pain_score" type="number" inputmode="numeric" min="0" max="10" required />
        </label>
        <label>
          mental status
          <select name="mental_status" required>
            <option value="">Select status</option>
            <option value="alert">Alert</option>
            <option value="verbal">Responds to Voice</option>
            <option value="pain">Responds to Pain</option>
            <option value="unresponsive">Unresponsive</option>
          </select>
        </label>
        <label>
          source (optional)
          <select name="source">
            <option value="">Default (manual)</option>
            <option value="manual">manual</option>
            <option value="monitor">monitor</option>
          </select>
        </label>
        <label>
          notes (optional)
          <textarea name="notes" rows="3" maxlength="500" placeholder="Optional clinical context"></textarea>
        </label>
        <button type="submit">Record observation</button>
        <p id="recordObservationFeedback" aria-live="polite" class="hint"></p>
      </form>
    </section>
  `;
}

function renderInterventionPanel(summary, { defaultDateTimeValue = "" } = {}) {
  if (!summary.encounterSummary.available) {
    return `
      <section class="panel">
        <h3>Record Intervention</h3>
        <p class="error-note">Intervention entry is unavailable because no encounter is linked yet.</p>
        <p class="hint">Create an encounter first, then return here to record interventions.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h3>Record Intervention</h3>
      <form id="recordInterventionForm" class="encounter-form">
        <label>
          performed_at
          <input name="performed_at" type="datetime-local" value="${defaultDateTimeValue}" required />
        </label>
        <label>
          type
          <select name="type" required>
            <option value="">Select type</option>
            <option value="medication">medication</option>
            <option value="procedure">procedure</option>
            <option value="airway">airway</option>
            <option value="oxygen_therapy">oxygen_therapy</option>
            <option value="immobilization">immobilization</option>
            <option value="other">other</option>
          </select>
        </label>
        <label>
          name
          <input name="name" required />
        </label>
        <label>
          dose (optional)
          <input name="dose" />
        </label>
        <label>
          route (optional)
          <input name="route" />
        </label>
        <label>
          response (optional)
          <textarea name="response" rows="3"></textarea>
        </label>
        <label>
          stock_item_id (optional)
          <input name="stock_item_id" placeholder="ITEM-001" />
        </label>
        <p class="hint">Stock item linkage is optional and does not mutate inventory from this screen.</p>
        <button type="submit">Record intervention</button>
        <p id="recordInterventionFeedback" aria-live="polite" class="hint"></p>
      </form>
    </section>
  `;
}

function normalizeIntegerField(formDataLike, key) {
  const raw = String(formDataLike.get(key) ?? "").trim();
  if (!raw) return { raw, value: null };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return { raw, value: Number.NaN };
  return { raw, value: parsed };
}

function normalizeNumberField(formDataLike, key) {
  const raw = String(formDataLike.get(key) ?? "").trim();
  if (!raw) return { raw, value: null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { raw, value: Number.NaN };
  return { raw, value: parsed };
}

function validateRange(name, value, [min, max]) {
  if (typeof value !== "number" || Number.isNaN(value)) return `${name} must be a valid number.`;
  if (value < min || value > max) return `${name} must be between ${min} and ${max}.`;
  return null;
}

const mentalStatusToGcs = {
  alert: 15,
  verbal: 12,
  pain: 8,
  unresponsive: 3
};

const interventionTypes = new Set(["medication", "procedure", "airway", "oxygen_therapy", "immobilization", "other"]);
const handoverStatuses = new Set(["Ready for Handover", "Handover Completed"]);

export function buildCreateEncounterPayload(formDataLike) {
  const patientId = String(formDataLike.get("patient_id") ?? "").trim();
  const careStartedAtRaw = String(formDataLike.get("care_started_at") ?? "").trim();
  const crewIdsRaw = String(formDataLike.get("crew_ids") ?? "").trim();
  const presentingComplaint = String(formDataLike.get("presenting_complaint") ?? "").trim();

  const crewIds = crewIdsRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const careStartedAtDate = careStartedAtRaw ? new Date(careStartedAtRaw) : null;
  const careStartedAtIso = careStartedAtDate && !Number.isNaN(careStartedAtDate.valueOf()) ? careStartedAtDate.toISOString() : "";

  return {
    payload: {
      patient_id: patientId,
      care_started_at: careStartedAtIso,
      crew_ids: crewIds,
      presenting_complaint: presentingComplaint
    },
    validationErrors: [
      !patientId ? "patient_id is required." : null,
      !careStartedAtRaw ? "care_started_at is required." : null,
      careStartedAtRaw && !careStartedAtIso ? "care_started_at must be a valid datetime." : null,
      crewIds.length === 0 ? "crew_ids must include at least one crew member." : null,
      !presentingComplaint ? "presenting_complaint is required." : null
    ].filter(Boolean)
  };
}

export function buildCreateObservationPayload(formDataLike, { nowMs = Date.now() } = {}) {
  const recordedAtRaw = String(formDataLike.get("recorded_at") ?? "").trim();
  const source = String(formDataLike.get("source") ?? "").trim();
  const notes = String(formDataLike.get("notes") ?? "").trim();
  const mentalStatus = String(formDataLike.get("mental_status") ?? "").trim();

  const systolic = normalizeIntegerField(formDataLike, "systolic_bp_mmhg");
  const diastolic = normalizeIntegerField(formDataLike, "diastolic_bp_mmhg");
  const heartRate = normalizeIntegerField(formDataLike, "heart_rate_bpm");
  const respiratoryRate = normalizeIntegerField(formDataLike, "respiratory_rate_bpm");
  const painScore = normalizeIntegerField(formDataLike, "pain_score");
  const spo2 = normalizeNumberField(formDataLike, "spo2_pct");
  const temperature = normalizeNumberField(formDataLike, "temperature_c");

  const recordedAtDate = recordedAtRaw ? new Date(recordedAtRaw) : null;
  const recordedAtIso = recordedAtDate && !Number.isNaN(recordedAtDate.valueOf()) ? recordedAtDate.toISOString() : "";
  const gcs = mentalStatus ? mentalStatusToGcs[mentalStatus] : undefined;

  const payload = {
    recorded_at: recordedAtIso,
    vital_signs: {
      systolic_bp_mmhg: systolic.value,
      diastolic_bp_mmhg: diastolic.value,
      heart_rate_bpm: heartRate.value,
      respiratory_rate_bpm: respiratoryRate.value,
      spo2_pct: spo2.value,
      temperature_c: temperature.value,
      pain_score: painScore.value,
      gcs
    }
  };

  if (source) payload.source = source;
  if (notes) payload.notes = notes;

  const validationErrors = [
    !recordedAtRaw ? "recorded_at is required." : null,
    recordedAtRaw && !recordedAtIso ? "recorded_at must be a valid datetime." : null,
    recordedAtIso && recordedAtDate.valueOf() > nowMs ? "recorded_at cannot be in the future." : null,
    !systolic.raw ? "systolic_bp_mmhg is required." : validateRange("systolic_bp_mmhg", systolic.value, [40, 300]),
    !diastolic.raw ? "diastolic_bp_mmhg is required." : validateRange("diastolic_bp_mmhg", diastolic.value, [20, 200]),
    !heartRate.raw ? "heart_rate_bpm is required." : validateRange("heart_rate_bpm", heartRate.value, [0, 300]),
    !respiratoryRate.raw ? "respiratory_rate_bpm is required." : validateRange("respiratory_rate_bpm", respiratoryRate.value, [0, 120]),
    !spo2.raw ? "spo2_pct is required." : validateRange("spo2_pct", spo2.value, [0, 100]),
    !temperature.raw ? "temperature_c is required." : validateRange("temperature_c", temperature.value, [25, 45]),
    !painScore.raw ? "pain_score is required." : validateRange("pain_score", painScore.value, [0, 10]),
    !mentalStatus ? "mental_status is required." : null,
    mentalStatus && !gcs ? "mental_status is invalid." : null,
    source && source !== "manual" && source !== "monitor" ? "source must be manual or monitor." : null,
    notes.length > 500 ? "notes must be 500 characters or fewer." : null
  ].filter(Boolean);

  return { payload, validationErrors };
}

export function buildCreateInterventionPayload(formDataLike) {
  const performedAtRaw = String(formDataLike.get("performed_at") ?? "").trim();
  const type = String(formDataLike.get("type") ?? "").trim();
  const name = String(formDataLike.get("name") ?? "").trim();
  const dose = String(formDataLike.get("dose") ?? "").trim();
  const route = String(formDataLike.get("route") ?? "").trim();
  const response = String(formDataLike.get("response") ?? "").trim();
  const stockItemId = String(formDataLike.get("stock_item_id") ?? "").trim();

  const performedAtDate = performedAtRaw ? new Date(performedAtRaw) : null;
  const performedAtIso = performedAtDate && !Number.isNaN(performedAtDate.valueOf()) ? performedAtDate.toISOString() : "";

  const payload = {
    performed_at: performedAtIso,
    type,
    name
  };

  if (dose) payload.dose = dose;
  if (route) payload.route = route;
  if (response) payload.response = response;
  if (stockItemId) payload.stock_item_id = stockItemId;

  const validationErrors = [
    !performedAtRaw ? "performed_at is required." : null,
    performedAtRaw && !performedAtIso ? "performed_at must be a valid datetime." : null,
    !type ? "type is required." : null,
    type && !interventionTypes.has(type) ? "type is invalid." : null,
    !name ? "name is required." : null
  ].filter(Boolean);

  return { payload, validationErrors };
}

export function buildCreateHandoverPayload(formDataLike) {
  const handoverTimeRaw = String(formDataLike.get("handover_time") ?? "").trim();
  const destinationFacility = String(formDataLike.get("destination_facility") ?? "").trim();
  const receivingClinician = String(formDataLike.get("receiving_clinician") ?? "").trim();
  const disposition = String(formDataLike.get("disposition") ?? "").trim();
  const handoverStatus = String(formDataLike.get("handover_status") ?? "").trim();
  const notes = String(formDataLike.get("notes") ?? "").trim();

  const handoverTimeDate = handoverTimeRaw ? new Date(handoverTimeRaw) : null;
  const handoverTimeIso = handoverTimeDate && !Number.isNaN(handoverTimeDate.valueOf()) ? handoverTimeDate.toISOString() : "";

  const payload = {
    handover_time: handoverTimeIso,
    destination_facility: destinationFacility,
    receiving_clinician: receivingClinician,
    disposition,
    handover_status: handoverStatus
  };

  if (notes) payload.notes = notes;

  const validationErrors = [
    !handoverTimeRaw ? "handover_time is required." : null,
    handoverTimeRaw && !handoverTimeIso ? "handover_time must be a valid datetime." : null,
    !destinationFacility ? "destination_facility is required." : null,
    !receivingClinician ? "receiving_clinician is required." : null,
    !disposition ? "disposition is required." : null,
    !handoverStatus ? "handover_status is required." : null,
    handoverStatus && !handoverStatuses.has(handoverStatus) ? "handover_status is invalid." : null,
    notes.length > 1000 ? "notes must be 1000 characters or fewer." : null
  ].filter(Boolean);

  return { payload, validationErrors };
}

function renderHandoverPanel(summary, { defaultDateTimeValue = "" } = {}) {
  if (!summary.encounterSummary.available) {
    return `
      <section class="panel">
        <h3>Record Handover</h3>
        <p class="error-note">Handover entry is unavailable because no encounter is linked yet.</p>
        <p class="hint">Create an encounter first, then return here to complete handover/disposition.</p>
      </section>
    `;
  }

  if (summary.handoverSummary.available) {
    return `
      <section class="panel">
        <h3>Record Handover</h3>
        <p class="success-note">
          Handover already recorded: ${summary.handoverSummary.handover_status} / ${summary.handoverSummary.disposition}.
        </p>
        <p>Use this summary for operational confirmation. Duplicate create is disabled for this encounter.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h3>Record Handover</h3>
      <form id="recordHandoverForm" class="encounter-form">
        <label>
          handover_time
          <input name="handover_time" type="datetime-local" value="${defaultDateTimeValue}" required />
        </label>
        <label>
          destination_facility
          <input name="destination_facility" required />
        </label>
        <label>
          receiving_clinician
          <input name="receiving_clinician" required />
        </label>
        <label>
          disposition
          <input name="disposition" required />
        </label>
        <label>
          handover_status
          <select name="handover_status" required>
            <option value="">Select status</option>
            <option value="Ready for Handover">Ready for Handover</option>
            <option value="Handover Completed">Handover Completed</option>
          </select>
        </label>
        <label>
          notes (optional)
          <textarea name="notes" rows="3" maxlength="1000" placeholder="Optional operational handover notes"></textarea>
        </label>
        <button type="submit">Record handover</button>
        <p id="recordHandoverFeedback" aria-live="polite" class="hint"></p>
      </form>
    </section>
  `;
}

export function buildCrewJobListItems(boardData) {
  return boardData.map((incidentSummary) => ({
    incidentId: asText(incidentSummary.incident_id),
    priority: asText(incidentSummary.priority),
    status: asText(incidentSummary.status),
    locationSummary: asText(incidentSummary.location_summary),
    assignmentSummary: summarizeAssignment(incidentSummary.assignment_summary),
    closureReady: incidentSummary.closure_ready
  }));
}

export function renderCrewJobListHtml(items) {
  if (items.length === 0) {
    return `<p>No assigned incidents available in the crew job list.</p>`;
  }

  const listItems = items
    .map((item) => {
      const closureReady = item.closureReady === undefined ? "" : `<p><strong>Closure Ready:</strong> ${item.closureReady}</p>`;
      return `
        <li class="crew-job-card">
          <h3><a href="?view=crew&incidentId=${encodeURIComponent(item.incidentId)}">${item.incidentId}</a></h3>
          <p><strong>Priority:</strong> ${item.priority}</p>
          <p><strong>Status:</strong> ${item.status}</p>
          <p><strong>Location:</strong> ${item.locationSummary}</p>
          <p><strong>Assignment:</strong> ${item.assignmentSummary}</p>
          ${closureReady}
        </li>
      `;
    })
    .join("\n");

  return `<ul class="crew-job-list">${listItems}</ul>`;
}

export function renderCrewIncidentDetailHtml(summary, { includeActionPlaceholders = true, now = new Date() } = {}) {
  const encounterSummary = summary.encounterSummary.available
    ? `${summary.encounterSummary.encounter_status} (${summary.encounterSummary.encounter_id})`
    : asText(summary.encounterSummary.detail);
  const handoverSummary = summary.handoverSummary.available
    ? `${summary.handoverSummary.handover_status} / ${summary.handoverSummary.disposition}`
    : asText(summary.handoverSummary.detail);
  const closureReady = summary.closureReady === undefined ? "Not present" : String(summary.closureReady);
  const defaultDateTimeValue = toLocalDateTimeInputValue(now);
  return `
    <section class="panel">
      <h2>Crew Incident Detail</h2>
      <dl>
        <dt>Incident ID</dt><dd>${summary.incidentId}</dd>
        <dt>Incident Header</dt><dd>${summary.priority} priority • ${summary.status}</dd>
        <dt>Address / Location</dt><dd>${summary.locationSummary}</dd>
        <dt>Assignment Summary</dt><dd>${summary.assignmentSummary.summary}</dd>
        <dt>Patient Link Summary</dt><dd>${summary.patientLinkSummary.summary}</dd>
        <dt>Encounter Summary</dt><dd>${encounterSummary}</dd>
        <dt>Handover Summary</dt><dd>${handoverSummary}</dd>
        <dt>Closure Ready</dt><dd>${closureReady}</dd>
      </dl>
    </section>
    ${renderCareTimeline(summary)}
    ${renderWorkflowGuidancePanel(summary)}
    <section class="panel">
      <h3>Workflow Actions</h3>
      <div class="workflow-stage-group">
        <h4>1) Encounter setup</h4>
        ${renderEncounterCreatePanel(summary, { defaultDateTimeValue })}
      </div>
      <div class="workflow-stage-group">
        <h4>2) Assessment (observations)</h4>
        ${renderObservationPanel(summary, { defaultDateTimeValue })}
      </div>
      <div class="workflow-stage-group">
        <h4>3) Treatment (interventions)</h4>
        ${renderInterventionPanel(summary, { defaultDateTimeValue })}
      </div>
      <div class="workflow-stage-group">
        <h4>4) Handover / disposition</h4>
        ${renderHandoverPanel(summary, { defaultDateTimeValue })}
      </div>
    </section>
    ${
      includeActionPlaceholders
        ? `<section class="panel">
      <h3>Crew Clinical Actions (Pending)</h3>
      <ul class="crew-action-list">
        ${renderAction("Patient search/create/link", "POST /api/patients/search | POST /api/patients | POST /api/incidents/{incidentId}/patient-link")}
      </ul>
    </section>`
        : ""
    }
  `;
}

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

function renderEncounterCreatePanel(summary) {
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
          <input id="encounterCareStartedAt" name="care_started_at" type="datetime-local" required />
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

function renderObservationPanel(summary) {
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
          <input name="recorded_at" type="datetime-local" required />
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

export function renderCrewIncidentDetailHtml(summary, { includeActionPlaceholders = true } = {}) {
  const encounterSummary = summary.encounterSummary.available
    ? `${summary.encounterSummary.encounter_status} (${summary.encounterSummary.encounter_id})`
    : asText(summary.encounterSummary.detail);
  const handoverSummary = summary.handoverSummary.available
    ? `${summary.handoverSummary.handover_status} / ${summary.handoverSummary.disposition}`
    : asText(summary.handoverSummary.detail);
  const closureReady = summary.closureReady === undefined ? "Not present" : String(summary.closureReady);
  const encounterId = summary.encounterSummary.encounter_id;
  const encounterActionsEnabled = summary.encounterSummary.available;

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
    ${renderEncounterCreatePanel(summary)}
    ${renderObservationPanel(summary)}
    ${
      includeActionPlaceholders
        ? `<section class="panel">
      <h3>Crew Clinical Actions (Pending)</h3>
      <ul class="crew-action-list">
        ${renderAction("Patient search/create/link", "POST /api/patients/search | POST /api/patients | POST /api/incidents/{incidentId}/patient-link")}
        ${renderAction("Record intervention", `POST /api/encounters/${encounterId ?? "{encounterId}"}/interventions`, encounterActionsEnabled)}
        ${renderAction("Record handover", `POST /api/encounters/${encounterId ?? "{encounterId}"}/handover`, encounterActionsEnabled)}
      </ul>
    </section>`
        : ""
    }
  `;
}

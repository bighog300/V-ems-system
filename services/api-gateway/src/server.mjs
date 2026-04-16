import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { OrchestrationService } from "@vems/orchestration";
import { ApiError, CALL_SOURCES, INCIDENT_CATEGORIES, INCIDENT_PRIORITIES } from "@vems/shared";

const PATIENT_SEX_VALUES = ["male", "female", "other", "unknown"];
const PATIENT_LINK_VERIFICATION_STATUSES = ["unknown", "provisional", "matched_existing", "created_new", "verified", "duplicate_suspected"];
const ENCOUNTER_STATUSES = ["Not Started", "Open", "Assessment In Progress", "Treatment In Progress", "Ready for Handover", "Handover Completed", "Closed", "Cancelled"];


function okJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function errorEnvelope(code, message, retryable) {
  return { error: { code, message, retryable, correlation_id: randomUUID() } };
}

async function parseJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("INVALID_PAYLOAD", "Malformed JSON payload", 400);
  }
}

function validateCreateIncident(payload) {
  if (!payload?.call || !payload?.incident) throw new ApiError("INVALID_PAYLOAD", "Missing call or incident object", 400);
  if (!CALL_SOURCES.includes(payload.call.call_source)) throw new ApiError("INVALID_PAYLOAD", "Invalid call_source", 400);
  if (!payload.call.received_at) throw new ApiError("INVALID_PAYLOAD", "received_at is required", 400);
  if (!INCIDENT_CATEGORIES.includes(payload.incident.category)) throw new ApiError("INVALID_PAYLOAD", "Invalid incident category", 400);
  if (!INCIDENT_PRIORITIES.includes(payload.incident.priority)) throw new ApiError("INVALID_PAYLOAD", "Invalid incident priority", 400);
  if (!payload.incident.description || !payload.incident.address) throw new ApiError("INVALID_PAYLOAD", "description and address are required", 400);
  if (!Number.isInteger(payload.incident.patient_count) || payload.incident.patient_count < 0) {
    throw new ApiError("INVALID_PAYLOAD", "patient_count must be integer >= 0", 400);
  }
}

function validateCreateAssignment(payload) {
  if (!/^AMB-[0-9]{3,}$/.test(payload.vehicle_id)) throw new ApiError("INVALID_PAYLOAD", "Invalid vehicle_id", 400);
  if (!Array.isArray(payload.crew_ids) || payload.crew_ids.length === 0) throw new ApiError("INVALID_PAYLOAD", "crew_ids required", 400);
  if (!payload.crew_ids.every((id) => /^STAFF-[0-9]{3,}$/.test(id))) throw new ApiError("INVALID_PAYLOAD", "Invalid crew_ids format", 400);
  if (!payload.reason) throw new ApiError("INVALID_PAYLOAD", "reason is required", 400);
}

function validateAction(payload) {
  if (!payload?.action || typeof payload.action !== "string") throw new ApiError("INVALID_PAYLOAD", "action is required", 400);
}

function validatePatientSearch(payload) {
  if (!payload || typeof payload !== "object") throw new ApiError("INVALID_PAYLOAD", "Patient search payload is required", 400);
  const hasAnyField = [payload.first_name, payload.last_name, payload.dob, payload.sex, payload.phone].some(Boolean);
  if (!hasAnyField) throw new ApiError("INVALID_PAYLOAD", "At least one search field is required", 400);
  if (payload.sex && !PATIENT_SEX_VALUES.includes(payload.sex)) throw new ApiError("INVALID_PAYLOAD", "Invalid sex", 400);
}

function validatePatientCreate(payload) {
  if (!payload?.first_name || !payload?.last_name || !payload?.dob) {
    throw new ApiError("INVALID_PAYLOAD", "first_name, last_name, and dob are required", 400);
  }
  if (payload.sex && !PATIENT_SEX_VALUES.includes(payload.sex)) throw new ApiError("INVALID_PAYLOAD", "Invalid sex", 400);
}

function validatePatientLink(payload) {
  if (!payload || typeof payload !== "object") throw new ApiError("INVALID_PAYLOAD", "Patient link payload is required", 400);
  if (!PATIENT_LINK_VERIFICATION_STATUSES.includes(payload.verification_status)) {
    throw new ApiError("INVALID_PAYLOAD", "Invalid verification_status", 400);
  }
  if (payload.verification_status === "verified" && !payload.openemr_patient_id) {
    throw new ApiError("INVALID_PAYLOAD", "openemr_patient_id is required when verification_status is verified", 400);
  }
}


function validateCreateEncounter(payload) {
  if (!payload || typeof payload !== "object") throw new ApiError("INVALID_PAYLOAD", "Encounter payload is required", 400);
  if (!payload.patient_id || typeof payload.patient_id !== "string") throw new ApiError("INVALID_PAYLOAD", "patient_id is required", 400);
  if (!payload.care_started_at || typeof payload.care_started_at !== "string") throw new ApiError("INVALID_PAYLOAD", "care_started_at is required", 400);
  if (Number.isNaN(Date.parse(payload.care_started_at))) throw new ApiError("INVALID_PAYLOAD", "care_started_at must be an ISO-8601 datetime", 400);
  if (!Array.isArray(payload.crew_ids) || payload.crew_ids.length === 0) throw new ApiError("INVALID_PAYLOAD", "crew_ids required", 400);
  if (!payload.crew_ids.every((id) => /^STAFF-[0-9]{3,}$/.test(id))) throw new ApiError("INVALID_PAYLOAD", "Invalid crew_ids format", 400);
  if (!payload.presenting_complaint || typeof payload.presenting_complaint !== "string") {
    throw new ApiError("INVALID_PAYLOAD", "presenting_complaint is required", 400);
  }
}

function validateEncounterId(encounterId) {
  if (!/^ENC-[A-Za-z0-9-]+$/.test(encounterId)) throw new ApiError("INVALID_PAYLOAD", "Invalid encounter_id", 400);
}

function validateCreateObservation(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError("INVALID_PAYLOAD", "Observation payload is required", 400);
  }
  const allowedObservationFields = new Set(["recorded_at", "source", "notes", "vital_signs"]);
  const unknownObservationFields = Object.keys(payload).filter((field) => !allowedObservationFields.has(field));
  if (unknownObservationFields.length > 0) {
    throw new ApiError("INVALID_PAYLOAD", `Unknown observation fields: ${unknownObservationFields.join(", ")}`, 400);
  }

  if (!payload.recorded_at || typeof payload.recorded_at !== "string" || Number.isNaN(Date.parse(payload.recorded_at))) {
    throw new ApiError("INVALID_PAYLOAD", "recorded_at is required and must be an ISO-8601 datetime", 400);
  }
  if (payload.source !== undefined && !["manual", "monitor"].includes(payload.source)) {
    throw new ApiError("INVALID_PAYLOAD", "source must be one of: manual, monitor", 400);
  }
  if (payload.notes !== undefined && typeof payload.notes !== "string") {
    throw new ApiError("INVALID_PAYLOAD", "notes must be a string", 400);
  }

  if (!payload.vital_signs || typeof payload.vital_signs !== "object" || Array.isArray(payload.vital_signs)) {
    throw new ApiError("INVALID_PAYLOAD", "vital_signs is required", 400);
  }

  const allowedVitalFields = new Set([
    "heart_rate_bpm",
    "respiratory_rate_bpm",
    "systolic_bp_mmhg",
    "diastolic_bp_mmhg",
    "spo2_pct",
    "temperature_c",
    "gcs",
    "pain_score"
  ]);
  const vitalKeys = Object.keys(payload.vital_signs);
  if (vitalKeys.length === 0) throw new ApiError("INVALID_PAYLOAD", "vital_signs must include at least one field", 400);
  const unknownVitalFields = vitalKeys.filter((field) => !allowedVitalFields.has(field));
  if (unknownVitalFields.length > 0) {
    throw new ApiError("INVALID_PAYLOAD", `Unknown vital_signs fields: ${unknownVitalFields.join(", ")}`, 400);
  }

  const integerFields = ["heart_rate_bpm", "respiratory_rate_bpm", "systolic_bp_mmhg", "diastolic_bp_mmhg", "gcs", "pain_score"];
  for (const field of integerFields) {
    if (payload.vital_signs[field] !== undefined && !Number.isInteger(payload.vital_signs[field])) {
      throw new ApiError("INVALID_PAYLOAD", `${field} must be an integer`, 400);
    }
  }
  const numberFields = ["spo2_pct", "temperature_c"];
  for (const field of numberFields) {
    if (payload.vital_signs[field] !== undefined && typeof payload.vital_signs[field] !== "number") {
      throw new ApiError("INVALID_PAYLOAD", `${field} must be a number`, 400);
    }
  }

  const rangedFields = {
    heart_rate_bpm: [0, 300],
    respiratory_rate_bpm: [0, 120],
    systolic_bp_mmhg: [40, 300],
    diastolic_bp_mmhg: [20, 200],
    spo2_pct: [0, 100],
    temperature_c: [25, 45],
    gcs: [3, 15],
    pain_score: [0, 10]
  };
  for (const [field, [min, max]] of Object.entries(rangedFields)) {
    const value = payload.vital_signs[field];
    if (value !== undefined && (value < min || value > max)) {
      throw new ApiError("INVALID_PAYLOAD", `${field} must be between ${min} and ${max}`, 400);
    }
  }
}

function validateCreateIntervention(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError("INVALID_PAYLOAD", "Intervention payload is required", 400);
  }

  const allowedFields = new Set(["performed_at", "type", "name", "dose", "route", "response", "stock_item_id"]);
  const unknownFields = Object.keys(payload).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new ApiError("INVALID_PAYLOAD", `Unknown intervention fields: ${unknownFields.join(", ")}`, 400);
  }

  if (!payload.performed_at || typeof payload.performed_at !== "string" || Number.isNaN(Date.parse(payload.performed_at))) {
    throw new ApiError("INVALID_PAYLOAD", "performed_at is required and must be an ISO-8601 datetime", 400);
  }
  const interventionTypes = ["medication", "procedure", "airway", "oxygen_therapy", "immobilization", "other"];
  if (!interventionTypes.includes(payload.type)) {
    throw new ApiError("INVALID_PAYLOAD", "type must be one of: medication, procedure, airway, oxygen_therapy, immobilization, other", 400);
  }
  if (!payload.name || typeof payload.name !== "string") {
    throw new ApiError("INVALID_PAYLOAD", "name is required", 400);
  }

  for (const optionalField of ["dose", "route", "response", "stock_item_id"]) {
    if (payload[optionalField] !== undefined && typeof payload[optionalField] !== "string") {
      throw new ApiError("INVALID_PAYLOAD", `${optionalField} must be a string`, 400);
    }
  }
}

export function createApp(orchestration = new OrchestrationService()) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = req.method ?? "GET";
      const correlationId = req.headers["x-correlation-id"] ?? randomUUID();
      const idempotencyKey = req.headers["idempotency-key"];

      if (method === "GET" && url.pathname === "/health") return okJson(res, 200, { status: "ok" });

      if (method === "POST" && url.pathname === "/api/incidents") {
        const payload = await parseJson(req);
        validateCreateIncident(payload);
        const incident = orchestration.createIncident(payload, { correlationId, idempotencyKey });
        return okJson(res, 201, incident);
      }


      if (method === "POST" && url.pathname === "/api/patients/search") {
        const payload = await parseJson(req);
        validatePatientSearch(payload);
        const result = await orchestration.searchPatient(payload, { correlationId });
        return okJson(res, 200, result);
      }

      if (method === "POST" && url.pathname === "/api/patients") {
        const payload = await parseJson(req);
        validatePatientCreate(payload);
        const patient = await orchestration.createPatient(payload, { correlationId, idempotencyKey });
        return okJson(res, 201, patient);
      }

      const incidentMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})$/);
      if (incidentMatch && method === "GET") {
        const incident = orchestration.getIncident(incidentMatch[1]);
        return okJson(res, 200, incident);
      }
      if (incidentMatch && method === "PATCH") {
        const payload = await parseJson(req);
        validateAction(payload);
        const incident = orchestration.updateIncident(incidentMatch[1], payload, { correlationId });
        return okJson(res, 200, incident);
      }

      const patientLinkMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})\/patient-link$/);
      if (patientLinkMatch && method === "POST") {
        const payload = await parseJson(req);
        validatePatientLink(payload);
        const link = orchestration.linkPatientToIncidentContext(patientLinkMatch[1], payload, { correlationId });
        return okJson(res, 200, link);
      }

      const assignmentCreateMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})\/assignments$/);
      if (assignmentCreateMatch && method === "POST") {
        const payload = await parseJson(req);
        validateCreateAssignment(payload);
        const assignment = orchestration.createAssignment(assignmentCreateMatch[1], payload, { correlationId, idempotencyKey });
        return okJson(res, 201, assignment);
      }


      const encounterCreateMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})\/encounters$/);
      if (encounterCreateMatch && method === "GET") {
        const encounter = orchestration.getEncounterByIncident(encounterCreateMatch[1]);
        return okJson(res, 200, encounter);
      }
      if (encounterCreateMatch && method === "POST") {
        const payload = await parseJson(req);
        validateCreateEncounter(payload);
        const encounter = await orchestration.createEncounterForIncident(encounterCreateMatch[1], payload, { correlationId, idempotencyKey });
        if (!ENCOUNTER_STATUSES.includes(encounter.status)) {
          throw new ApiError("DOWNSTREAM_UNAVAILABLE", "Encounter status not recognized", 502, true);
        }
        return okJson(res, 201, encounter);
      }

      const observationCreateMatch = url.pathname.match(/^\/api\/encounters\/([^/]+)\/observations$/);
      if (observationCreateMatch && method === "POST") {
        const encounterId = observationCreateMatch[1];
        validateEncounterId(encounterId);
        const payload = await parseJson(req);
        validateCreateObservation(payload);
        const observation = await orchestration.createObservationForEncounter(encounterId, payload, { correlationId });
        return okJson(res, 201, observation);
      }

      const interventionCreateMatch = url.pathname.match(/^\/api\/encounters\/([^/]+)\/interventions$/);
      if (interventionCreateMatch && method === "POST") {
        const encounterId = interventionCreateMatch[1];
        validateEncounterId(encounterId);
        const payload = await parseJson(req);
        validateCreateIntervention(payload);
        const intervention = await orchestration.createInterventionForEncounter(encounterId, payload, { correlationId });
        return okJson(res, 201, intervention);
      }

      const assignmentPatchMatch = url.pathname.match(/^\/api\/assignments\/(ASN-[0-9]{6})$/);
      if (assignmentPatchMatch && method === "PATCH") {
        const payload = await parseJson(req);
        validateAction(payload);
        const assignment = orchestration.updateAssignment(assignmentPatchMatch[1], payload, { correlationId });
        return okJson(res, 200, assignment);
      }

      return okJson(res, 404, errorEnvelope("NOT_FOUND", "Route not found", false));
    } catch (error) {
      if (error instanceof ApiError) return okJson(res, error.status, errorEnvelope(error.code, error.message, error.retryable));
      return okJson(res, 500, errorEnvelope("DOWNSTREAM_UNAVAILABLE", "Unexpected server error", true));
    }
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createApp();
  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, () => {
    console.log(`api-gateway listening on ${port}`);
  });
}

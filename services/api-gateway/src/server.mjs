import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { OrchestrationService } from "@vems/orchestration";
import { ApiError, CALL_SOURCES, INCIDENT_CATEGORIES, INCIDENT_PRIORITIES } from "@vems/shared";

const PATIENT_SEX_VALUES = ["male", "female", "other", "unknown"];
const PATIENT_LINK_VERIFICATION_STATUSES = ["unknown", "provisional", "matched_existing", "created_new", "verified", "duplicate_suspected"];


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

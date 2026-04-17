import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { OrchestrationService } from "@vems/orchestration";
import { ApiError, CALL_SOURCES, INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, createLogger } from "@vems/shared";

const PATIENT_SEX_VALUES = ["male", "female", "other", "unknown"];
const PATIENT_LINK_VERIFICATION_STATUSES = ["unknown", "provisional", "matched_existing", "created_new", "verified", "duplicate_suspected"];
const ENCOUNTER_STATUSES = ["Not Started", "Open", "Assessment In Progress", "Treatment In Progress", "Ready for Handover", "Handover Completed", "Closed", "Cancelled"];


const logger = createLogger({ serviceName: "api-gateway" });

const RBAC_POLICIES = [
  { pattern: /^\/api\/support\/diagnostics$/, method: "GET", roles: ["supervisor", "operations_manager", "sys_admin"] },
  { pattern: /^\/api\/incidents$/, method: "POST", roles: ["dispatcher", "supervisor", "operations_manager", "sys_admin"] },
  { pattern: /^\/api\/incidents\/(INC-[0-9]{6})$/, method: "PATCH", roles: ["dispatcher", "supervisor", "operations_manager", "sys_admin"] },
  { pattern: /^\/api\/incidents\/(INC-[0-9]{6})\/assignments$/, method: "POST", roles: ["dispatcher", "supervisor", "operations_manager", "sys_admin"] },
  { pattern: /^\/api\/assignments\/(ASN-[0-9]{6})$/, method: "PATCH", roles: ["dispatcher", "supervisor", "operations_manager", "sys_admin"] },
  { pattern: /^\/api\/patients\/search$/, method: "POST", roles: ["dispatcher", "field_crew", "field_crew_lead", "supervisor", "clinical_reviewer", "sys_admin"] },
  { pattern: /^\/api\/patients$/, method: "POST", roles: ["field_crew", "field_crew_lead", "clinical_reviewer", "supervisor", "sys_admin"] },
  { pattern: /^\/api\/incidents\/(INC-[0-9]{6})\/patient-link$/, method: "POST", roles: ["dispatcher", "field_crew", "field_crew_lead", "clinical_reviewer", "supervisor", "sys_admin"] },
  { pattern: /^\/api\/incidents\/(INC-[0-9]{6})\/encounters$/, method: "POST", roles: ["field_crew", "field_crew_lead", "clinical_reviewer", "supervisor", "sys_admin"] },
  { pattern: /^\/api\/encounters\/([^/]+)\/observations$/, method: "POST", roles: ["field_crew", "field_crew_lead", "clinical_reviewer", "supervisor", "sys_admin"] },
  { pattern: /^\/api\/encounters\/([^/]+)\/interventions$/, method: "POST", roles: ["field_crew", "field_crew_lead", "clinical_reviewer", "supervisor", "sys_admin"] },
  { pattern: /^\/api\/encounters\/([^/]+)\/handover$/, method: "POST", roles: ["field_crew", "field_crew_lead", "clinical_reviewer", "supervisor", "sys_admin"] }
];

function toHeaderValue(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildRequestContext(req) {
  return {
    requestId: toHeaderValue(req.headers["x-request-id"]) ?? randomUUID(),
    correlationId: toHeaderValue(req.headers["x-correlation-id"]) ?? randomUUID(),
    actorId: toHeaderValue(req.headers["x-actor-id"]),
    role: (toHeaderValue(req.headers["x-user-role"]) ?? "anonymous").toLowerCase(),
    startedAt: Date.now()
  };
}

function okJson(res, status, body, context) {
  res.writeHead(status, {
    "content-type": "application/json",
    "x-correlation-id": context.correlationId,
    "x-request-id": context.requestId
  });
  res.end(JSON.stringify(body));
}

function errorEnvelope(code, message, retryable, context, details = undefined) {
  const error = {
    code,
    message,
    retryable,
    correlation_id: context.correlationId
  };
  if (details !== undefined) error.details = details;
  return { error };
}

function evaluateRbac({ method, pathname, role, enforceRbac }) {
  const policy = RBAC_POLICIES.find((candidate) => candidate.method === method && candidate.pattern.test(pathname));
  if (!policy) return { enforced: enforceRbac, requiresRole: false, allowed: true, requiredRoles: [] };
  const allowed = policy.roles.includes(role);
  return { enforced: enforceRbac, requiresRole: true, allowed: !enforceRbac || allowed, requiredRoles: policy.roles, roleMatched: allowed };
}

function envFlagEnabled(...values) {
  return values.some((value) => value === "true");
}

function readinessReport(orchestration, diagnostics) {
  const incidents = orchestration.listIncidentsForBoard();
  const byStatus = incidents.reduce((acc, incident) => {
    acc[incident.status] = (acc[incident.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    generated_at: new Date().toISOString(),
    production_readiness: {
      structured_logging: true,
      correlation_headers: true,
      rbac_enforced: diagnostics.rbacEnforced
    },
    diagnostics: {
      environment: {
        app_env: diagnostics.appEnv,
        profile: diagnostics.profile
      },
      controls: {
        rbac_enforced: diagnostics.rbacEnforced,
        upstream_connectivity_validation_enabled: diagnostics.upstreamConnectivityValidationEnabled
      },
      modes: {
        smoke_include_upstream_connectivity: diagnostics.smokeIncludeUpstreamConnectivity,
        readiness_mode: diagnostics.readinessMode
      },
      last_validation: diagnostics.lastValidation
    },
    incident_snapshot: {
      total: incidents.length,
      by_status: byStatus
    }
  };
}

function metricsSummary(metrics) {
  return {
    started_at: metrics.started_at,
    request_count: metrics.request_count,
    request_failures: metrics.request_failures,
    rbac_deny_count: metrics.rbac_deny_count,
    failure_rate_pct: metrics.request_count === 0
      ? 0
      : Number(((metrics.request_failures / metrics.request_count) * 100).toFixed(2)),
    latency_ms: {
      avg: metrics.latency_ms.avg,
      min: metrics.latency_ms.min,
      max: metrics.latency_ms.max
    }
  };
}

function syncIntentSummary(orchestration) {
  const intents = orchestration.listSyncIntents();
  const byStatus = intents.reduce((acc, intent) => {
    acc[intent.status] = (acc[intent.status] ?? 0) + 1;
    return acc;
  }, {});

  const byEntityType = intents.reduce((acc, intent) => {
    const key = intent.entity_type ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const failuresByTarget = intents
    .filter((intent) => intent.status === "dead_lettered" || (intent.status === "pending" && intent.attempt_count > 0))
    .reduce((acc, intent) => {
      const key = intent.target_system ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  const pendingRetries = intents
    .filter((intent) => intent.status === "pending" && intent.attempt_count > 0)
    .sort((a, b) => b.attempt_count - a.attempt_count);

  const failedIntents = intents
    .filter((intent) => intent.status === "dead_lettered" || (intent.status === "pending" && intent.attempt_count > 0))
    .sort((a, b) => b.intent_id - a.intent_id)
    .slice(0, 15)
    .map((intent) => ({
      intent_id: intent.intent_id,
      target_system: intent.target_system,
      intent_type: intent.intent_type,
      entity_type: intent.entity_type,
      status: intent.status,
      attempt_count: intent.attempt_count,
      last_error_classification: intent.last_error_classification,
      last_error: intent.last_error,
      dead_lettered_at: intent.dead_lettered_at,
      created_at: intent.created_at,
      correlation_id: intent.correlation_id,
      reference_id: intent.payload?.incident_id ?? intent.payload?.encounter_id ?? intent.payload?.assignment_id ?? null
    }));

  return {
    generated_at: new Date().toISOString(),
    totals: {
      total: intents.length,
      by_status: byStatus,
      by_entity_type: byEntityType,
      failures_by_target: failuresByTarget,
      pending_retries: pendingRetries.length,
      dead_lettered: byStatus.dead_lettered ?? 0
    },
    failed_intents: failedIntents
  };
}

function evaluateAlertStates(metricsSum, syncSum, thresholds) {
  return {
    rbac_deny_count: (metricsSum.rbac_deny_count ?? 0) >= thresholds.rbac_deny_count_warn ? "warn" : "ok",
    dead_letter_count: (syncSum.totals.dead_lettered ?? 0) >= thresholds.dead_letter_count_warn ? "warn" : "ok",
    failure_rate_pct: (metricsSum.failure_rate_pct ?? 0) >= thresholds.failure_rate_pct_warn ? "warn" : "ok",
    latency_avg_ms: (metricsSum.latency_ms.avg ?? 0) >= thresholds.latency_avg_ms_warn ? "warn" : "ok"
  };
}

function supportDiagnosticsReport(orchestration, diagnostics, metrics, alertThresholds) {
  const metricsSum = metricsSummary(metrics);
  const syncSum = syncIntentSummary(orchestration);
  return {
    generated_at: new Date().toISOString(),
    readiness_summary: readinessReport(orchestration, diagnostics),
    metrics_summary: metricsSum,
    sync_intent_summary: syncSum,
    upstream_validation_status: {
      enabled: diagnostics.upstreamConnectivityValidationEnabled,
      last_validation: diagnostics.lastValidation
    },
    alert_thresholds: alertThresholds,
    alert_states: evaluateAlertStates(metricsSum, syncSum, alertThresholds)
  };
}

function createApiMetricsCollector() {
  return {
    started_at: new Date().toISOString(),
    request_count: 0,
    request_failures: 0,
    rbac_deny_count: 0,
    latency_ms: {
      count: 0,
      total: 0,
      min: null,
      max: null,
      avg: 0
    },
    by_route: {}
  };
}

function routeMetricKey(method, pathname) {
  return `${method} ${pathname}`;
}

function recordRequestMetrics(metrics, { method, pathname, durationMs, failed }) {
  metrics.request_count += 1;
  if (failed) metrics.request_failures += 1;

  metrics.latency_ms.count += 1;
  metrics.latency_ms.total += durationMs;
  metrics.latency_ms.min = metrics.latency_ms.min === null ? durationMs : Math.min(metrics.latency_ms.min, durationMs);
  metrics.latency_ms.max = metrics.latency_ms.max === null ? durationMs : Math.max(metrics.latency_ms.max, durationMs);
  metrics.latency_ms.avg = Number((metrics.latency_ms.total / metrics.latency_ms.count).toFixed(2));

  const routeKey = routeMetricKey(method, pathname);
  if (!metrics.by_route[routeKey]) {
    metrics.by_route[routeKey] = {
      request_count: 0,
      request_failures: 0
    };
  }
  metrics.by_route[routeKey].request_count += 1;
  if (failed) metrics.by_route[routeKey].request_failures += 1;
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

function validateCreateHandover(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError("INVALID_PAYLOAD", "Handover payload is required", 400);
  }

  const allowedFields = new Set([
    "handover_time",
    "destination_facility",
    "receiving_clinician",
    "disposition",
    "handover_status",
    "notes"
  ]);
  const unknownFields = Object.keys(payload).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new ApiError("INVALID_PAYLOAD", `Unknown handover fields: ${unknownFields.join(", ")}`, 400);
  }

  if (!payload.handover_time || typeof payload.handover_time !== "string" || Number.isNaN(Date.parse(payload.handover_time))) {
    throw new ApiError("INVALID_PAYLOAD", "handover_time is required and must be an ISO-8601 datetime", 400);
  }
  if (!payload.disposition || typeof payload.disposition !== "string") {
    throw new ApiError("INVALID_PAYLOAD", "disposition is required", 400);
  }
  const handoverStatuses = ["Ready for Handover", "Handover Completed"];
  if (!handoverStatuses.includes(payload.handover_status)) {
    throw new ApiError("INVALID_PAYLOAD", "handover_status must be one of: Ready for Handover, Handover Completed", 400);
  }

  for (const optionalField of ["destination_facility", "receiving_clinician", "notes"]) {
    if (payload[optionalField] !== undefined && typeof payload[optionalField] !== "string") {
      throw new ApiError("INVALID_PAYLOAD", `${optionalField} must be a string`, 400);
    }
  }
}

export function createApp(orchestration = new OrchestrationService()) {
  const enforceRbac = process.env.RBAC_ENFORCE === "true";
  const appEnv = process.env.APP_ENV ?? "development";
  const profile = process.env.APP_PROFILE ?? process.env.NODE_ENV ?? "default";
  const smokeIncludeUpstreamConnectivity = process.env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY === "true";
  const upstreamConnectivityValidationEnabled = envFlagEnabled(
    process.env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED,
    process.env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY
  );
  const lastValidation = process.env.UPSTREAM_CONNECTIVITY_LAST_VALIDATED_AT
    ? {
      at: process.env.UPSTREAM_CONNECTIVITY_LAST_VALIDATED_AT,
      result: process.env.UPSTREAM_CONNECTIVITY_LAST_RESULT ?? "unknown"
    }
    : null;
  const diagnostics = {
    appEnv,
    profile,
    rbacEnforced: enforceRbac,
    upstreamConnectivityValidationEnabled,
    smokeIncludeUpstreamConnectivity,
    readinessMode: process.env.READINESS_MODE ?? process.env.SMOKE_MODE ?? null,
    lastValidation
  };
  const metrics = createApiMetricsCollector();
  const metricsExposureEnabled = appEnv !== "production" || process.env.INTERNAL_METRICS_ENABLED === "true";
  const alertThresholds = {
    rbac_deny_count_warn: Number(process.env.ALERT_RBAC_DENY_WARN ?? 10),
    dead_letter_count_warn: Number(process.env.ALERT_DEAD_LETTER_WARN ?? 5),
    failure_rate_pct_warn: Number(process.env.ALERT_FAILURE_RATE_PCT_WARN ?? 5),
    latency_avg_ms_warn: Number(process.env.ALERT_LATENCY_AVG_MS_WARN ?? 1000)
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const context = buildRequestContext(req);
    const idempotencyKey = req.headers["idempotency-key"];
    let requestFailed = false;

    logger.info("request_received", {
      correlation_id: context.correlationId,
      request_id: context.requestId,
      actor_id: context.actorId,
      actor_role: context.role,
      method,
      path: url.pathname
    });

    const rbac = evaluateRbac({ method, pathname: url.pathname, role: context.role, enforceRbac });
    if (rbac.requiresRole) {
      logger.info("rbac_evaluated", {
        correlation_id: context.correlationId,
        request_id: context.requestId,
        actor_id: context.actorId,
        actor_role: context.role,
        allowed: rbac.allowed,
        enforce_rbac: rbac.enforced,
        required_roles: rbac.requiredRoles,
        method,
        path: url.pathname
      });
      if (!rbac.allowed) {
        requestFailed = true;
        metrics.rbac_deny_count += 1;
        return okJson(res, 403, errorEnvelope("FORBIDDEN", "Role is not authorized for this action", false, context, {
          required_roles: rbac.requiredRoles
        }), context);
      }
    }

    try {
      if (method === "GET" && url.pathname === "/health") return okJson(res, 200, { status: "ok" }, context);

      if (method === "GET" && url.pathname === "/api/support/readiness") {
        return okJson(res, 200, readinessReport(orchestration, diagnostics), context);
      }

      if (method === "GET" && url.pathname === "/api/support/metrics") {
        if (!metricsExposureEnabled) {
          requestFailed = true;
          return okJson(res, 404, errorEnvelope("NOT_FOUND", "Route not found", false, context), context);
        }
        return okJson(res, 200, {
          generated_at: new Date().toISOString(),
          api_gateway: metrics
        }, context);
      }

      if (method === "GET" && url.pathname === "/api/support/diagnostics") {
        return okJson(res, 200, supportDiagnosticsReport(orchestration, diagnostics, metrics, alertThresholds), context);
      }

      if (method === "GET" && url.pathname === "/api/incidents") {
        const incidents = orchestration.listIncidentsForBoard();
        return okJson(res, 200, { incidents }, context);
      }

      if (method === "POST" && url.pathname === "/api/incidents") {
        const payload = await parseJson(req);
        validateCreateIncident(payload);
        const incident = orchestration.createIncident(payload, { correlationId: context.correlationId, idempotencyKey });
        return okJson(res, 201, incident, context);
      }

      if (method === "POST" && url.pathname === "/api/patients/search") {
        const payload = await parseJson(req);
        validatePatientSearch(payload);
        const result = await orchestration.searchPatient(payload, { correlationId: context.correlationId });
        return okJson(res, 200, result, context);
      }

      if (method === "POST" && url.pathname === "/api/patients") {
        const payload = await parseJson(req);
        validatePatientCreate(payload);
        const patient = await orchestration.createPatient(payload, { correlationId: context.correlationId, idempotencyKey });
        return okJson(res, 201, patient, context);
      }

      const incidentMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})$/);
      if (incidentMatch && method === "GET") {
        const incident = orchestration.getIncident(incidentMatch[1]);
        return okJson(res, 200, incident, context);
      }
      if (incidentMatch && method === "PATCH") {
        const payload = await parseJson(req);
        validateAction(payload);
        const incident = orchestration.updateIncident(incidentMatch[1], payload, { correlationId: context.correlationId });
        return okJson(res, 200, incident, context);
      }

      const patientLinkMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})\/patient-link$/);
      if (patientLinkMatch && method === "GET") {
        const link = orchestration.getPatientLink(patientLinkMatch[1]);
        return okJson(res, 200, link, context);
      }
      if (patientLinkMatch && method === "POST") {
        const payload = await parseJson(req);
        validatePatientLink(payload);
        const link = orchestration.linkPatientToIncidentContext(patientLinkMatch[1], payload, { correlationId: context.correlationId });
        return okJson(res, 200, link, context);
      }

      const assignmentCreateMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})\/assignments$/);
      if (assignmentCreateMatch && method === "GET") {
        const assignments = orchestration.getAssignmentsByIncident(assignmentCreateMatch[1]);
        return okJson(res, 200, assignments, context);
      }
      if (assignmentCreateMatch && method === "POST") {
        const payload = await parseJson(req);
        validateCreateAssignment(payload);
        const assignment = orchestration.createAssignment(assignmentCreateMatch[1], payload, { correlationId: context.correlationId, idempotencyKey });
        return okJson(res, 201, assignment, context);
      }

      const encounterCreateMatch = url.pathname.match(/^\/api\/incidents\/(INC-[0-9]{6})\/encounters$/);
      if (encounterCreateMatch && method === "GET") {
        const encounter = orchestration.getEncounterByIncident(encounterCreateMatch[1]);
        return okJson(res, 200, encounter, context);
      }
      if (encounterCreateMatch && method === "POST") {
        const payload = await parseJson(req);
        validateCreateEncounter(payload);
        const encounter = await orchestration.createEncounterForIncident(encounterCreateMatch[1], payload, { correlationId: context.correlationId, idempotencyKey });
        if (!ENCOUNTER_STATUSES.includes(encounter.status)) {
          throw new ApiError("DOWNSTREAM_UNAVAILABLE", "Encounter status not recognized", 502, true);
        }
        return okJson(res, 201, encounter, context);
      }

      const observationCreateMatch = url.pathname.match(/^\/api\/encounters\/([^/]+)\/observations$/);
      if (observationCreateMatch && method === "POST") {
        const encounterId = observationCreateMatch[1];
        validateEncounterId(encounterId);
        const payload = await parseJson(req);
        validateCreateObservation(payload);
        const observation = await orchestration.createObservationForEncounter(encounterId, payload, { correlationId: context.correlationId });
        return okJson(res, 201, observation, context);
      }

      const interventionCreateMatch = url.pathname.match(/^\/api\/encounters\/([^/]+)\/interventions$/);
      if (interventionCreateMatch && method === "GET") {
        const encounterId = interventionCreateMatch[1];
        validateEncounterId(encounterId);
        const interventions = await orchestration.getInterventionsForEncounter(encounterId);
        return okJson(res, 200, interventions, context);
      }
      if (interventionCreateMatch && method === "POST") {
        const encounterId = interventionCreateMatch[1];
        validateEncounterId(encounterId);
        const payload = await parseJson(req);
        validateCreateIntervention(payload);
        const intervention = await orchestration.createInterventionForEncounter(encounterId, payload, { correlationId: context.correlationId });
        return okJson(res, 201, intervention, context);
      }

      const handoverCreateMatch = url.pathname.match(/^\/api\/encounters\/([^/]+)\/handover$/);
      if (handoverCreateMatch && method === "GET") {
        const encounterId = handoverCreateMatch[1];
        validateEncounterId(encounterId);
        const handover = await orchestration.getHandoverForEncounter(encounterId);
        return okJson(res, 200, handover, context);
      }
      if (handoverCreateMatch && method === "POST") {
        const encounterId = handoverCreateMatch[1];
        validateEncounterId(encounterId);
        const payload = await parseJson(req);
        validateCreateHandover(payload);
        const handover = await orchestration.createHandoverForEncounter(encounterId, payload, { correlationId: context.correlationId });
        return okJson(res, 201, handover, context);
      }

      const assignmentPatchMatch = url.pathname.match(/^\/api\/assignments\/(ASN-[0-9]{6})$/);
      if (assignmentPatchMatch && method === "PATCH") {
        const payload = await parseJson(req);
        validateAction(payload);
        const assignment = orchestration.updateAssignment(assignmentPatchMatch[1], payload, { correlationId: context.correlationId });
        return okJson(res, 200, assignment, context);
      }

      requestFailed = true;
      return okJson(res, 404, errorEnvelope("NOT_FOUND", "Route not found", false, context), context);
    } catch (error) {
      requestFailed = true;
      if (error instanceof ApiError) {
        logger.warn("request_failed", {
          correlation_id: context.correlationId,
          request_id: context.requestId,
          actor_id: context.actorId,
          actor_role: context.role,
          method,
          path: url.pathname,
          status: error.status,
          error_code: error.code,
          error_message: error.message
        });
        return okJson(res, error.status, errorEnvelope(error.code, error.message, error.retryable, context), context);
      }

      logger.error("request_failed_unhandled", {
        correlation_id: context.correlationId,
        request_id: context.requestId,
        actor_id: context.actorId,
        actor_role: context.role,
        method,
        path: url.pathname,
        error
      });
      return okJson(res, 500, errorEnvelope("DOWNSTREAM_UNAVAILABLE", "Unexpected server error", true, context), context);
    } finally {
      recordRequestMetrics(metrics, {
        method,
        pathname: url.pathname,
        durationMs: Date.now() - context.startedAt,
        failed: requestFailed
      });
      logger.info("request_completed", {
        correlation_id: context.correlationId,
        request_id: context.requestId,
        actor_id: context.actorId,
        actor_role: context.role,
        method,
        path: url.pathname,
        duration_ms: Date.now() - context.startedAt
      });
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

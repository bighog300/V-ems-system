import { randomUUID } from "node:crypto";
import { ApiError, IdGenerator, nextAssignmentStatus, nextIncidentStatus } from "@vems/shared";

export class OrchestrationService {
  constructor() {
    this.idGenerator = new IdGenerator();
    this.incidents = new Map();
    this.assignments = new Map();
    this.events = [];
    this.audits = [];
    this.idempotencyCache = new Map();
  }

  createIncident(payload, meta) {
    if (meta.idempotencyKey) {
      const existingId = this.idempotencyCache.get(`incident:${meta.idempotencyKey}`);
      if (existingId) return this.incidents.get(existingId);
    }

    const now = new Date().toISOString();
    const callId = this.idGenerator.next("CALL");
    const incidentId = this.idGenerator.next("INC");

    const record = {
      incident_id: incidentId,
      call_id: callId,
      status: "New",
      created_at: now,
      updated_at: now,
      correlation_id: meta.correlationId,
      ...payload.incident
    };

    this.incidents.set(incidentId, record);
    this.audit("incident", incidentId, "create_incident", meta.correlationId, undefined, record);
    this.event("IncidentCreated", meta.correlationId, { incident_id: incidentId, call_id: callId, status: record.status });

    if (meta.idempotencyKey) this.idempotencyCache.set(`incident:${meta.idempotencyKey}`, incidentId);
    return record;
  }

  getIncident(incidentId) {
    const incident = this.incidents.get(incidentId);
    if (!incident) throw new ApiError("NOT_FOUND", `Incident ${incidentId} not found`, 404);
    return incident;
  }

  updateIncident(incidentId, payload, meta) {
    const current = this.getIncident(incidentId);
    let nextStatus;
    try {
      nextStatus = nextIncidentStatus(current.status, payload.action);
    } catch (error) {
      throw new ApiError("INVALID_STATUS_TRANSITION", error.message, 409);
    }

    if (nextStatus === "Closed") {
      const hasActiveAssignments = [...this.assignments.values()].some(
        (a) => a.incident_id === incidentId && ["Assigned", "Accepted", "Mobilised", "Active"].includes(a.status)
      );
      if (hasActiveAssignments) {
        throw new ApiError("INVALID_STATUS_TRANSITION", "Incident cannot close while active assignments exist", 409);
      }
    }

    const updated = { ...current, status: nextStatus, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.incidents.set(incidentId, updated);
    this.audit("incident", incidentId, `incident_action:${payload.action}`, meta.correlationId, current, updated);
    this.event("IncidentUpdated", meta.correlationId, { incident_id: incidentId, old_status: current.status, new_status: nextStatus });
    return updated;
  }

  createAssignment(incidentId, payload, meta) {
    if (meta.idempotencyKey) {
      const existingId = this.idempotencyCache.get(`assignment:${meta.idempotencyKey}`);
      if (existingId) return this.assignments.get(existingId);
    }

    this.getIncident(incidentId);

    const now = new Date().toISOString();
    const assignmentId = this.idGenerator.next("ASN");
    const record = {
      assignment_id: assignmentId,
      incident_id: incidentId,
      status: "Proposed",
      vehicle_status: "Assigned",
      vehicle_id: payload.vehicle_id,
      crew_ids: payload.crew_ids,
      reason: payload.reason,
      created_at: now,
      updated_at: now,
      correlation_id: meta.correlationId
    };

    this.assignments.set(assignmentId, record);
    this.audit("assignment", assignmentId, "create_assignment", meta.correlationId, undefined, record);
    this.event("AssignmentCreated", meta.correlationId, { assignment_id: assignmentId, incident_id: incidentId, status: record.status });

    if (meta.idempotencyKey) this.idempotencyCache.set(`assignment:${meta.idempotencyKey}`, assignmentId);
    return record;
  }

  updateAssignment(assignmentId, payload, meta) {
    const current = this.assignments.get(assignmentId);
    if (!current) throw new ApiError("NOT_FOUND", `Assignment ${assignmentId} not found`, 404);

    let nextStatus;
    try {
      nextStatus = nextAssignmentStatus(current.status, payload.action);
    } catch (error) {
      throw new ApiError("INVALID_STATUS_TRANSITION", error.message, 409);
    }

    const updated = { ...current, status: nextStatus, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.assignments.set(assignmentId, updated);
    this.audit("assignment", assignmentId, `assignment_action:${payload.action}`, meta.correlationId, current, updated);
    this.event("IncidentUpdated", meta.correlationId, {
      incident_id: current.incident_id,
      assignment_id: assignmentId,
      old_status: current.status,
      new_status: nextStatus
    });
    return updated;
  }

  audit(entityType, entityId, action, correlationId, beforeJson, afterJson) {
    this.audits.push({
      timestamp: new Date().toISOString(),
      entity_type: entityType,
      entity_id: entityId,
      action,
      correlation_id: correlationId,
      before_json: beforeJson,
      after_json: afterJson
    });
  }

  event(eventType, correlationId, payload) {
    this.events.push({
      event_id: randomUUID(),
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      source_system: "custom_app",
      correlation_id: correlationId,
      payload
    });
  }
}

import { randomUUID } from "node:crypto";
import { ApiError, nextAssignmentStatus, nextIncidentStatus } from "@vems/shared";
import { SqliteClient } from "./db.mjs";
import { IncidentRepository } from "./repositories/incident-repository.mjs";
import { AssignmentRepository } from "./repositories/assignment-repository.mjs";
import { AuditLogRepository } from "./repositories/audit-log-repository.mjs";
import { EventOutboxRepository } from "./repositories/event-outbox-repository.mjs";
import { IdempotencyKeyRepository } from "./repositories/idempotency-key-repository.mjs";
import { SyncIntentRepository } from "./repositories/sync-intent-repository.mjs";
import { VtigerPayloadMapper } from "./adapters/vtiger/vtiger-payload-mapper.mjs";

export class OrchestrationService {
  constructor(options = {}) {
    this.db = options.db ?? new SqliteClient(options.dbPath);
    this.incidents = new IncidentRepository(this.db);
    this.assignments = new AssignmentRepository(this.db);
    this.audits = new AuditLogRepository(this.db);
    this.events = new EventOutboxRepository(this.db);
    this.idempotency = new IdempotencyKeyRepository(this.db);
    this.syncIntents = new SyncIntentRepository(this.db);
    this.vtigerMapper = options.vtigerMapper ?? new VtigerPayloadMapper();
  }

  createIncident(payload, meta) {
    if (meta.idempotencyKey) {
      const existingId = this.idempotency.getResourceId("incident", meta.idempotencyKey);
      if (existingId) return this.incidents.findById(existingId);
    }

    const now = new Date().toISOString();
    const callId = this.incidents.nextCallId();
    const incidentId = this.incidents.nextIncidentId();

    const record = {
      incident_id: incidentId,
      call_id: callId,
      status: "New",
      created_at: now,
      updated_at: now,
      correlation_id: meta.correlationId,
      ...payload.incident
    };

    this.incidents.create(record);
    this.audit("incident", incidentId, "create_incident", meta.correlationId, undefined, record);
    this.event("IncidentCreated", meta.correlationId, { incident_id: incidentId, call_id: callId, status: record.status });
    this.syncIntent("incident", "createIncidentMirror", meta.correlationId, this.vtigerMapper.mapIncidentCreate(record));

    if (meta.idempotencyKey) this.idempotency.save("incident", meta.idempotencyKey, incidentId, now);
    return record;
  }

  getIncident(incidentId) {
    const incident = this.incidents.findById(incidentId);
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
      const hasActiveAssignments = this.assignments.findActiveByIncident(incidentId).length > 0;
      if (hasActiveAssignments) {
        throw new ApiError("INVALID_STATUS_TRANSITION", "Incident cannot close while active assignments exist", 409);
      }
    }

    const updated = { ...current, status: nextStatus, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.incidents.updateStatus(incidentId, nextStatus, updated.updated_at, meta.correlationId);
    this.audit("incident", incidentId, `incident_action:${payload.action}`, meta.correlationId, current, updated);
    this.event("IncidentUpdated", meta.correlationId, { incident_id: incidentId, old_status: current.status, new_status: nextStatus });
    this.syncIntent("incident", "updateIncidentMirror", meta.correlationId, this.vtigerMapper.mapIncidentUpdate(updated));
    return updated;
  }

  createAssignment(incidentId, payload, meta) {
    if (meta.idempotencyKey) {
      const existingId = this.idempotency.getResourceId("assignment", meta.idempotencyKey);
      if (existingId) return this.assignments.findById(existingId);
    }

    this.getIncident(incidentId);

    const now = new Date().toISOString();
    const assignmentId = this.assignments.nextAssignmentId();
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

    this.assignments.create(record);
    this.audit("assignment", assignmentId, "create_assignment", meta.correlationId, undefined, record);
    this.event("AssignmentCreated", meta.correlationId, { assignment_id: assignmentId, incident_id: incidentId, status: record.status });
    this.syncIntent("assignment", "createAssignmentMirror", meta.correlationId, this.vtigerMapper.mapAssignmentCreate(record));

    if (meta.idempotencyKey) this.idempotency.save("assignment", meta.idempotencyKey, assignmentId, now);
    return record;
  }

  updateAssignment(assignmentId, payload, meta) {
    const current = this.assignments.findById(assignmentId);
    if (!current) throw new ApiError("NOT_FOUND", `Assignment ${assignmentId} not found`, 404);

    let nextStatus;
    try {
      nextStatus = nextAssignmentStatus(current.status, payload.action);
    } catch (error) {
      throw new ApiError("INVALID_STATUS_TRANSITION", error.message, 409);
    }

    const updated = { ...current, status: nextStatus, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.assignments.updateStatus(assignmentId, nextStatus, updated.updated_at, meta.correlationId);
    this.audit("assignment", assignmentId, `assignment_action:${payload.action}`, meta.correlationId, current, updated);
    this.event("IncidentUpdated", meta.correlationId, {
      incident_id: current.incident_id,
      assignment_id: assignmentId,
      old_status: current.status,
      new_status: nextStatus
    });
    this.syncIntent("assignment", "updateAssignmentMirror", meta.correlationId, this.vtigerMapper.mapAssignmentUpdate(updated));
    return updated;
  }

  audit(entityType, entityId, action, correlationId, beforeJson, afterJson) {
    this.audits.append({
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
    this.events.append({
      event_id: randomUUID(),
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      source_system: "custom_app",
      correlation_id: correlationId,
      payload
    });
  }

  syncIntent(entityType, operation, correlationId, payload) {
    this.syncIntents.append({
      target_system: "vtiger",
      entity_type: entityType,
      operation,
      correlation_id: correlationId,
      created_at: new Date().toISOString(),
      payload
    });
  }

  listOutboxEvents() {
    return this.events.listAll();
  }

  listSyncIntents() {
    return this.syncIntents.listAll();
  }
}

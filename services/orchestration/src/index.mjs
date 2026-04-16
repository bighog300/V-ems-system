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
import { OpenEmrAdapterClient } from "./adapters/openemr/openemr-adapter-client.mjs";
import { PatientLinkRepository } from "./repositories/patient-link-repository.mjs";
import { EncounterLinkRepository } from "./repositories/encounter-link-repository.mjs";

const ENCOUNTER_ALLOWED_PATIENT_LINK_STATES = ["verified", "provisional"];

export class OrchestrationService {
  constructor(options = {}) {
    this.db = options.db ?? new SqliteClient(options.dbPath);
    this.incidents = new IncidentRepository(this.db);
    this.assignments = new AssignmentRepository(this.db);
    this.audits = new AuditLogRepository(this.db);
    this.events = new EventOutboxRepository(this.db);
    this.idempotency = new IdempotencyKeyRepository(this.db);
    this.syncIntents = new SyncIntentRepository(this.db);
    this.patientLinks = new PatientLinkRepository(this.db);
    this.encounterLinks = new EncounterLinkRepository(this.db);
    this.vtigerMapper = options.vtigerMapper ?? new VtigerPayloadMapper();
    this.openemr = options.openemr ?? new OpenEmrAdapterClient();
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


  async searchPatient(payload, meta) {
    const result = await this.openemr.searchPatient(payload);
    this.audit("patient", payload.phone ?? payload.last_name ?? "search", "search_patient", meta.correlationId, undefined, result);
    this.event("PatientMatchRequested", meta.correlationId, { incident_id: payload.incident_id ?? null, match_status: result.match_status });
    return result;
  }

  async createPatient(payload, meta) {
    if (meta.idempotencyKey) {
      const existingId = this.idempotency.getResourceId("patient", meta.idempotencyKey);
      if (existingId) return { patient_id: existingId };
    }

    const created = await this.openemr.createPatient(payload);
    this.audit("patient", created.patient_id, "create_patient", meta.correlationId, undefined, created);
    this.event("PatientCreated", meta.correlationId, { patient_id: created.patient_id });

    if (meta.idempotencyKey) this.idempotency.save("patient", meta.idempotencyKey, created.patient_id, new Date().toISOString());
    return created;
  }

  linkPatientToIncidentContext(incidentId, payload, meta) {
    this.getIncident(incidentId);

    const now = new Date().toISOString();
    const existing = this.patientLinks.findByIncidentId(incidentId);
    const record = {
      incident_id: incidentId,
      openemr_patient_id: payload.openemr_patient_id ?? null,
      temporary_label: payload.temporary_label ?? null,
      verification_status: payload.verification_status,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      correlation_id: meta.correlationId
    };

    this.patientLinks.save(record);
    this.audit("patient_link", incidentId, "link_patient_to_incident", meta.correlationId, existing, record);
    this.event("PatientMatched", meta.correlationId, {
      incident_id: incidentId,
      patient_id: record.openemr_patient_id,
      verification_status: record.verification_status
    });
    return record;
  }

  getPatientLink(incidentId) {
    this.getIncident(incidentId);
    return this.patientLinks.findByIncidentId(incidentId);
  }


  async createEncounterForIncident(incidentId, payload, meta) {
    if (meta.idempotencyKey) {
      const existingEncounterId = this.idempotency.getResourceId("encounter", meta.idempotencyKey);
      if (existingEncounterId) {
        const existingByKey = this.encounterLinks.findByEncounterId(existingEncounterId);
        if (existingByKey) {
          return {
            encounter_id: existingByKey.openemr_encounter_id,
            status: existingByKey.encounter_status,
            linked_incident_id: existingByKey.incident_id
          };
        }
      }
    }

    this.getIncident(incidentId);
    const patientLink = this.patientLinks.findByIncidentId(incidentId);
    if (!patientLink?.openemr_patient_id) {
      throw new ApiError("CONFLICT", "Cannot create encounter without linked patient", 409);
    }
    if (!ENCOUNTER_ALLOWED_PATIENT_LINK_STATES.includes(patientLink.verification_status)) {
      throw new ApiError(
        "INVALID_STATUS_TRANSITION",
        `Cannot create encounter when patient link is ${patientLink.verification_status}`,
        409
      );
    }
    if (payload.patient_id !== patientLink.openemr_patient_id) {
      throw new ApiError("INVALID_PAYLOAD", "patient_id must match linked incident patient", 400);
    }

    const existing = this.encounterLinks.findByIncidentAndPatient(incidentId, payload.patient_id) ?? this.encounterLinks.findByIncidentId(incidentId);
    if (existing) {
      return {
        encounter_id: existing.openemr_encounter_id,
        status: existing.encounter_status,
        linked_incident_id: existing.incident_id
      };
    }

    const created = await this.openemr.createEncounter({ incident_id: incidentId, ...payload });
    const now = new Date().toISOString();
    const record = {
      incident_id: incidentId,
      openemr_patient_id: patientLink.openemr_patient_id,
      openemr_encounter_id: created.encounter_id,
      encounter_status: created.status,
      care_started_at: payload.care_started_at,
      created_at: now,
      updated_at: now,
      correlation_id: meta.correlationId
    };

    this.encounterLinks.save(record);
    this.audit("encounter_link", incidentId, "create_encounter", meta.correlationId, undefined, record);
    this.event("EncounterCreated", meta.correlationId, {
      incident_id: incidentId,
      encounter_id: record.openemr_encounter_id,
      status: record.encounter_status
    });

    if (meta.idempotencyKey) this.idempotency.save("encounter", meta.idempotencyKey, record.openemr_encounter_id, now);

    return {
      encounter_id: record.openemr_encounter_id,
      status: record.encounter_status,
      linked_incident_id: incidentId
    };
  }

  getEncounterByIncident(incidentId) {
    this.getIncident(incidentId);
    const record = this.encounterLinks.findByIncidentId(incidentId);
    if (!record) throw new ApiError("NOT_FOUND", `Encounter for incident ${incidentId} not found`, 404);
    return {
      incident_id: record.incident_id,
      openemr_encounter_id: record.openemr_encounter_id,
      encounter_id: record.openemr_encounter_id,
      openemr_patient_id: record.openemr_patient_id,
      encounter_status: record.encounter_status,
      care_started_at: record.care_started_at
    };
  }

  async createObservationForEncounter(encounterId, payload, meta) {
    const encounter = this.encounterLinks.findByEncounterId(encounterId);
    if (!encounter) throw new ApiError("NOT_FOUND", `Encounter ${encounterId} not found`, 404);

    const created = await this.openemr.createObservation({
      encounter_id: encounterId,
      incident_id: encounter.incident_id,
      patient_id: encounter.openemr_patient_id,
      ...payload
    });

    const normalized = {
      observation_id: created.observation_id,
      encounter_id: created.encounter_id ?? encounterId,
      status: created.status
    };

    this.audit("observation", normalized.observation_id, "create_observation", meta.correlationId, undefined, {
      ...normalized,
      incident_id: encounter.incident_id
    });
    this.event("ObservationCreated", meta.correlationId, {
      incident_id: encounter.incident_id,
      encounter_id: normalized.encounter_id,
      observation_id: normalized.observation_id
    });

    return normalized;
  }

  listOutboxEvents() {
    return this.events.listAll();
  }

  listSyncIntents() {
    return this.syncIntents.listAll();
  }
}

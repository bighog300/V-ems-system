import { PatientCaseRepository } from './repositories/patient-case-repository.mjs';
import { patientCaseMethods } from './patient-cases.mjs';
import { randomUUID } from "node:crypto";
import { ApiError, nextAssignmentStatus, nextIncidentStatus } from "@vems/shared";
import { SqliteClient, sqlValue } from "./db.mjs";
import { IncidentRepository } from "./repositories/incident-repository.mjs";
import { AssignmentRepository } from "./repositories/assignment-repository.mjs";
import { AuditLogRepository } from "./repositories/audit-log-repository.mjs";
import { EventOutboxRepository } from "./repositories/event-outbox-repository.mjs";
import { IdempotencyKeyRepository } from "./repositories/idempotency-key-repository.mjs";
import { SyncIntentRepository } from "./repositories/sync-intent-repository.mjs";
import { VtigerPayloadMapper } from "./adapters/vtiger/vtiger-payload-mapper.mjs";
import { OpenEmrAdapterClient } from "./adapters/openemr/openemr-adapter-client.mjs";
import { createOpenEmrTransportFromEnv } from "./adapters/transports.mjs";
import { PatientLinkRepository } from "./repositories/patient-link-repository.mjs";
import { EncounterLinkRepository } from "./repositories/encounter-link-repository.mjs";
import { VtigerLinkRepository } from "./repositories/vtiger-link-repository.mjs";
import { AssignmentVtigerLinkRepository } from "./repositories/assignment-vtiger-link-repository.mjs";
import { VehicleRepository } from "./repositories/vehicle-repository.mjs";
import { VehicleVtigerLinkRepository } from "./repositories/vehicle-vtiger-link-repository.mjs";
import { PersonnelRepository } from "./repositories/personnel-repository.mjs";
import { PersonnelVtigerLinkRepository } from "./repositories/personnel-vtiger-link-repository.mjs";
import { AssignmentPersonnelVtigerLinkRepository } from "./repositories/assignment-personnel-vtiger-link-repository.mjs";
import { StockItemRepository } from "./repositories/stock-item-repository.mjs";
import { StockItemVtigerLinkRepository } from "./repositories/stock-item-vtiger-link-repository.mjs";
import { VehicleStockRepository, normalizeDecimal, normalizeSignedDecimal, addDecimal } from "./repositories/vehicle-stock-repository.mjs";
import { VehicleStockVtigerLinkRepository } from "./repositories/vehicle-stock-vtiger-link-repository.mjs";
import { StockUsageRepository } from "./repositories/stock-usage-repository.mjs";
import { StockUsageVtigerLinkRepository } from "./repositories/stock-usage-vtiger-link-repository.mjs";

const ENCOUNTER_ALLOWED_PATIENT_LINK_STATES = ["verified", "provisional"];
const VEHICLE_OPERATIONAL_STATUSES = ["Available", "Reserved", "Assigned", "En Route", "On Scene", "Transporting", "At Destination", "Returning to Base", "Restocking"];
const VEHICLE_SERVICE_STATUSES = ["Serviceable", "Out of Service", "Maintenance", "Offline/Unknown"];
const PERSONNEL_STATUSES = ["Available", "Unavailable", "Off Duty", "Training", "Leave", "Suspended", "Inactive"];
const STOCK_ITEM_TYPES = ["Consumable", "Medication"];
const STOCK_ACTIVE_STATUSES = ["Active", "Inactive"];

export class OrchestrationService {
  constructor(options = {}) {
    this.db = options.db ?? new SqliteClient(options.dbPath);
    this.incidents = new IncidentRepository(this.db);
    this.assignments = new AssignmentRepository(this.db);
    this.audits = new AuditLogRepository(this.db);
    this.events = new EventOutboxRepository(this.db);
    this.idempotency = new IdempotencyKeyRepository(this.db);
    this.syncIntents = new SyncIntentRepository(this.db);
    this.patientCases = new PatientCaseRepository(this.db);
    this.patientLinks = new PatientLinkRepository(this.db);
    this.encounterLinks = new EncounterLinkRepository(this.db);
    this.vtigerLinks = new VtigerLinkRepository(this.db);
    this.assignmentVtigerLinks = new AssignmentVtigerLinkRepository(this.db);
    this.vehicles = new VehicleRepository(this.db);
    this.vehicleVtigerLinks = new VehicleVtigerLinkRepository(this.db);
    this.personnel = new PersonnelRepository(this.db);
    this.personnelVtigerLinks = new PersonnelVtigerLinkRepository(this.db);
    this.assignmentPersonnelVtigerLinks = new AssignmentPersonnelVtigerLinkRepository(this.db);
    this.stockItems = new StockItemRepository(this.db);
    this.stockItemVtigerLinks = new StockItemVtigerLinkRepository(this.db);
    this.vehicleStock = new VehicleStockRepository(this.db);
    this.vehicleStockVtigerLinks = new VehicleStockVtigerLinkRepository(this.db);
    this.stockUsage = new StockUsageRepository(this.db);
    this.stockUsageVtigerLinks = new StockUsageVtigerLinkRepository(this.db);
    this.vtigerMapper = options.vtigerMapper ?? new VtigerPayloadMapper({ sourceNamespace: options.vtigerSourceNamespace ?? process.env.VTIGER_SOURCE_NAMESPACE });
    this.openemr = options.openemr ?? new OpenEmrAdapterClient({ transport: options.openemrTransport ?? createOpenEmrTransportFromEnv() });
  }

  createIncident(payload, meta) {
    const normalized = {
      call: {
        call_source: payload.call.call_source,
        received_at: new Date(payload.call.received_at).toISOString()
      },
      incident: {
        status: payload.incident.status ?? "New",
        category: payload.incident.category,
        priority: payload.incident.priority,
        description: payload.incident.description,
        address: payload.incident.address,
        patient_count: payload.incident.patient_count
      }
    };
    const requestFingerprint = JSON.stringify(normalized);
    if (meta.idempotencyKey) {
      const existing = this.idempotency.get("incident", meta.idempotencyKey);
      if (existing) {
        if (existing.request_fingerprint && existing.request_fingerprint !== requestFingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409);
        return this.getIncident(existing.resource_id);
      }
    }
    return this.db.withTransaction(() => {
      const now = new Date().toISOString();
      const callId = this.incidents.nextCallId();
      const incidentId = this.incidents.nextIncidentId();
      const record = { incident_id: incidentId, call_id: callId, created_at: now, updated_at: now, correlation_id: meta.correlationId, ...normalized.incident, call_source: normalized.call.call_source, received_at: normalized.call.received_at };
      this.db.execute(`INSERT INTO calls (call_id,call_source,received_at,created_at,correlation_id) VALUES (${sqlValue(callId)},${sqlValue(normalized.call.call_source)},${sqlValue(normalized.call.received_at)},${sqlValue(now)},${sqlValue(meta.correlationId)});`);
      this.incidents.create(record);
      this.audit("incident", incidentId, "create_incident", meta.correlationId, undefined, record);
      this.event("IncidentCreated", meta.correlationId, { incident_id: incidentId, call_id: callId, status: record.status });
      this.syncIntent("incident", "createIncidentMirror", meta.correlationId, this.vtigerMapper.mapIncidentCreate(record, normalized.call));
      this.vtigerLinks.upsert({ incident_id: incidentId, external_key: `${this.vtigerMapper.sourceNamespace}:${incidentId}`, create_correlation_id: meta.correlationId, last_correlation_id: meta.correlationId, sync_status: "pending", last_error_code: null, last_synced_at: null, created_at: now, updated_at: now, remote_id: null, remote_number: null });
      if (meta.idempotencyKey) this.idempotency.save("incident", meta.idempotencyKey, incidentId, now, requestFingerprint);
      return record;
    });
  }

  getIncident(incidentId) {
    const incident = this.incidents.findById(incidentId);
    if (!incident) throw new ApiError("NOT_FOUND", `Incident ${incidentId} not found`, 404);
    const result = this.withClosureReadiness(incident);
    const link = this.vtigerLinks.findByIncidentId(incidentId);
    const intent = this.syncIntents.listAll().filter((item) => item.entity_type === "incident" && item.payload?.incident_id === incidentId).pop();
    return { ...result, vtiger: { record_id: link?.remote_id ?? null, record_number: link?.remote_number ?? null, external_key: link?.external_key ?? `${this.vtigerMapper.sourceNamespace}:${incidentId}`, sync_status: link?.sync_status ?? intent?.status ?? "pending", attempt_count: intent?.attempt_count ?? 0, last_error_code: link?.last_error_code ?? intent?.last_error_classification ?? null, last_synced_at: link?.last_synced_at ?? null } };
  }

  listIncidentsForBoard() {
    const incidents = this.incidents.listAll();
    return incidents.map((incident) => {
      const assignment = this.assignments.findByIncidentId(incident.incident_id)[0];
      const encounter = this.patientCases.list(incident.incident_id)[0];

      const summary = {
        incident_id: incident.incident_id,
        priority: incident.priority,
        status: incident.status,
        location_summary: incident.address,
        created_at: incident.created_at
      };

      if (encounter) {
        summary.closure_ready = this.withClosureReadiness(incident).closure_ready;
      }
      if (assignment) {
        summary.assignment_summary = {
          assignment_id: assignment.assignment_id,
          status: assignment.status,
          vehicle_id: assignment.vehicle_id
        };
      }

      return summary;
    });
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
      this.assertClosureAllowed(incidentId);
    }

    const updated = { ...current, status: nextStatus, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.incidents.updateStatus(incidentId, nextStatus, updated.updated_at, meta.correlationId);
    this.audit("incident", incidentId, `incident_action:${payload.action}`, meta.correlationId, current, updated);
    this.event("IncidentUpdated", meta.correlationId, { incident_id: incidentId, old_status: current.status, new_status: nextStatus });
    this.syncIntent("incident", "updateIncidentMirror", meta.correlationId, this.vtigerMapper.mapIncidentUpdate(updated));
    return this.withClosureReadiness(updated);
  }

  assertClosureAllowed(incidentId) {
    const hasActiveAssignments = this.assignments.findActiveByIncident(incidentId).length > 0;
    if (hasActiveAssignments) {
      throw new ApiError("INVALID_STATUS_TRANSITION", "Incident cannot close while active assignments exist", 409);
    }

    const cases = this.patientCases.list(incidentId);
    if (cases.some(c => !this.getPatientCase(c.patient_case_id).closure_ready)) {
      throw new ApiError("INVALID_STATUS_TRANSITION", "Incident cannot close without persisted encounter handover/disposition closure metadata", 409);
    }
  }

  withClosureReadiness(incident) {
    const cases = this.patientCases.list(incident.incident_id);
    if (!cases.length) return incident;
    return { ...incident, closure_ready: this.assignments.findActiveByIncident(incident.incident_id).length === 0
      && cases.every(c => this.getPatientCase(c.patient_case_id).closure_ready) };
  }

  createAssignment(incidentId, payload, meta) {
    this.getIncident(incidentId);
    const vehicleMasterActive = this.vehicles.list().length > 0;
    const vehicle = this.vehicles.findById(payload.vehicle_id);
    if (vehicleMasterActive && !vehicle) throw new ApiError("CONFLICT", `Vehicle ${payload.vehicle_id} is not registered`, 409);
    if (vehicle && (vehicle.operational_status !== "Available" || vehicle.service_status !== "Serviceable")) throw new ApiError("CONFLICT", `Vehicle ${payload.vehicle_id} is not assignable`, 409);
    const normalized = { vehicle_id: payload.vehicle_id, crew_ids: [...new Set(payload.crew_ids)].sort(), reason: payload.reason };
    const personnelMasterActive = this.personnel.list().length > 0;
    const crewRecords = normalized.crew_ids.map((staffId) => this.personnel.findById(staffId));
    if (personnelMasterActive && crewRecords.some((record) => !record)) throw new ApiError("CONFLICT", "Every crew member must exist in the personnel master", 409);
    if (personnelMasterActive && crewRecords.some((record) => record.operational_status !== "Available")) throw new ApiError("CONFLICT", "Every crew member must be Available", 409);
    const fingerprint = JSON.stringify(normalized);
    if (meta.idempotencyKey) {
      const existing = this.idempotency.get("assignment", meta.idempotencyKey);
      if (existing) {
        if (existing.request_fingerprint && existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409);
        return this.getAssignment(existing.resource_id);
      }
    }
    return this.db.withTransaction(() => {
      if (meta.idempotencyKey) {
        const existing = this.idempotency.get("assignment", meta.idempotencyKey);
        if (existing) {
          if (existing.request_fingerprint && existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409);
          return this.getAssignment(existing.resource_id);
        }
      }
      if (vehicle && this.vehicles.countActiveAssignments(vehicle.vehicle_id) > 0) throw new ApiError("CONFLICT", `Vehicle ${vehicle.vehicle_id} already has an active assignment`, 409);
      if (personnelMasterActive && normalized.crew_ids.some((staffId) => this.personnel.countActiveAssignments(staffId) > 0)) throw new ApiError("CONFLICT", "A crew member already has an active assignment", 409);
      const now = new Date().toISOString();
      const assignmentId = this.assignments.nextAssignmentId();
      const record = { assignment_id: assignmentId, incident_id: incidentId, status: "Proposed", vehicle_status: "Assigned", ...normalized, created_at: now, updated_at: now, correlation_id: meta.correlationId };
      this.assignments.create(record);
      this.audit("assignment", assignmentId, "create_assignment", meta.correlationId, undefined, record);
      this.event("AssignmentCreated", meta.correlationId, { assignment_id: assignmentId, incident_id: incidentId, status: record.status });
      this.syncIntent("assignment", "createAssignmentMirror", meta.correlationId, { ...this.vtigerMapper.mapAssignmentCreate(record), incident_id: incidentId, assignment_id: assignmentId });
      this.assignmentVtigerLinks.upsert({ assignment_id: assignmentId, incident_id: incidentId, external_key: `${this.vtigerMapper.sourceNamespace}:assignment:${assignmentId}`, create_correlation_id: meta.correlationId, last_correlation_id: meta.correlationId, sync_status: "pending", last_error_code: null, last_synced_at: null, remote_id: null, remote_number: null, incident_remote_id: null, created_at: now, updated_at: now });
      if (personnelMasterActive) for (const staffId of normalized.crew_ids) this.assignmentPersonnelVtigerLinks.ensure({ assignment_id: assignmentId, staff_id: staffId, external_key: `${this.vtigerMapper.sourceNamespace}:assignment-crew:${assignmentId}:${staffId}`, create_correlation_id: meta.correlationId, last_correlation_id: meta.correlationId, created_at: now, updated_at: now });
      if (meta.idempotencyKey) this.idempotency.save("assignment", meta.idempotencyKey, assignmentId, now, fingerprint);
      return record;
    });
  }

  createPersonnel(payload, meta) {
    const normalized = { staff_id: payload.staff_id, display_name: payload.display_name, role: payload.role, operational_status: payload.operational_status, home_station: payload.home_station, callsign: payload.callsign ?? null, phone: payload.phone ?? null, email: payload.email ?? null, notes: payload.notes ?? null };
    const fingerprint = JSON.stringify(normalized);
    if (meta.idempotencyKey) {
      const existing = this.idempotency.get("personnel", meta.idempotencyKey);
      if (existing) { if (existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409); return this.getPersonnel(existing.resource_id); }
    }
    return this.db.withTransaction(() => {
      if (meta.idempotencyKey) { const existing = this.idempotency.get("personnel", meta.idempotencyKey); if (existing) { if (existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409); return this.getPersonnel(existing.resource_id); } }
      const conflict = this.personnel.findById(normalized.staff_id);
      if (conflict) {
        const comparable = ["display_name", "role", "operational_status", "home_station", "callsign", "phone", "email", "notes"].every((key) => conflict[key] === normalized[key]);
        if (comparable) return this.getPersonnel(normalized.staff_id);
        throw new ApiError("CONFLICT", `Personnel ${normalized.staff_id} already exists with a different definition`, 409);
      }
      const now = new Date().toISOString();
      const record = { ...normalized, created_at: now, updated_at: now, correlation_id: meta.correlationId };
      this.personnel.create(record);
      this.audit("personnel", record.staff_id, "create_personnel", meta.correlationId, undefined, record);
      this.event("PersonnelCreated", meta.correlationId, { staff_id: record.staff_id, operational_status: record.operational_status });
      this.syncIntent("personnel", "createPersonnelMirror", meta.correlationId, this.vtigerMapper.mapPersonnelCreate(record));
      this.personnelVtigerLinks.upsert({ staff_id: record.staff_id, external_key: `${this.vtigerMapper.sourceNamespace}:personnel:${record.staff_id}`, create_correlation_id: meta.correlationId, last_correlation_id: meta.correlationId, sync_status: "pending", last_error_code: null, last_synced_at: null, remote_id: null, remote_number: null, created_at: now, updated_at: now });
      if (meta.idempotencyKey) this.idempotency.save("personnel", meta.idempotencyKey, record.staff_id, now, fingerprint);
      return this.getPersonnel(record.staff_id);
    });
  }

  getPersonnel(staffId) {
    const record = this.personnel.findById(staffId);
    if (!record) throw new ApiError("NOT_FOUND", `Personnel ${staffId} not found`, 404);
    const link = this.personnelVtigerLinks.findByStaffId(staffId);
    const intent = this.syncIntents.listAll().filter((item) => item.entity_type === "personnel" && item.payload?.staff_id === staffId).at(-1);
    return { ...record, vtiger: { record_id: link?.remote_id ?? null, record_number: link?.remote_number ?? null, external_key: link?.external_key ?? `${this.vtigerMapper.sourceNamespace}:personnel:${staffId}`, sync_status: link?.sync_status ?? intent?.status ?? "pending", attempt_count: intent?.attempt_count ?? 0, last_error_code: link?.last_error_code ?? intent?.last_error_classification ?? null, last_synced_at: link?.last_synced_at ?? null } };
  }

  listPersonnel() { return this.personnel.list().map((record) => this.getPersonnel(record.staff_id)); }

  updatePersonnel(staffId, payload, meta) {
    if (payload.staff_id !== undefined) throw new ApiError("INVALID_PAYLOAD", "staff_id is immutable", 400);
    const current = this.personnel.findById(staffId);
    if (!current) throw new ApiError("NOT_FOUND", `Personnel ${staffId} not found`, 404);
    if (payload.operational_status !== undefined && !PERSONNEL_STATUSES.includes(payload.operational_status)) throw new ApiError("INVALID_PAYLOAD", "Invalid operational_status", 400);
    const updated = { ...current, ...payload, staff_id: staffId, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.personnel.update(updated);
    this.audit("personnel", staffId, payload.operational_status ? "personnel_status_change" : "update_personnel", meta.correlationId, current, updated);
    this.event(payload.operational_status ? "PersonnelStatusChanged" : "PersonnelUpdated", meta.correlationId, { staff_id: staffId, operational_status: updated.operational_status });
    const link = this.personnelVtigerLinks.findByStaffId(staffId);
    this.syncIntent("personnel", "updatePersonnelMirror", meta.correlationId, { ...this.vtigerMapper.mapPersonnelUpdate({ ...updated, remote_id: link?.remote_id }), staff_id: staffId });
    return this.getPersonnel(staffId);
  }

  createVehicle(payload, meta) {
    if (!/^AMB-[0-9]{3,}$/.test(payload.vehicle_id)) throw new ApiError("INVALID_PAYLOAD", "Invalid vehicle_id", 400);
    if (!VEHICLE_OPERATIONAL_STATUSES.includes(payload.operational_status ?? "Available")) throw new ApiError("INVALID_PAYLOAD", "Invalid operational_status", 400);
    if (!VEHICLE_SERVICE_STATUSES.includes(payload.service_status ?? "Serviceable")) throw new ApiError("INVALID_PAYLOAD", "Invalid service_status", 400);
    const normalized = { vehicle_id: payload.vehicle_id, callsign: payload.callsign, vehicle_type: payload.vehicle_type, operational_status: payload.operational_status ?? "Available", service_status: payload.service_status ?? "Serviceable", home_station: payload.home_station, notes: payload.notes ?? null };
    const fingerprint = JSON.stringify(normalized);
    if (meta.idempotencyKey) {
      const existing = this.idempotency.get("vehicle", meta.idempotencyKey);
      if (existing) {
        if (existing.request_fingerprint && existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409);
        return this.getVehicle(existing.resource_id);
      }
    }
    return this.db.withTransaction(() => {
      if (meta.idempotencyKey) {
        const existing = this.idempotency.get("vehicle", meta.idempotencyKey);
        if (existing) {
          if (existing.request_fingerprint && existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409);
          return this.getVehicle(existing.resource_id);
        }
      }
      const conflict = this.vehicles.findById(normalized.vehicle_id);
      if (conflict) {
        if (JSON.stringify({ callsign: conflict.callsign, vehicle_type: conflict.vehicle_type, operational_status: conflict.operational_status, service_status: conflict.service_status, home_station: conflict.home_station, notes: conflict.notes }) === JSON.stringify({ callsign: normalized.callsign, vehicle_type: normalized.vehicle_type, operational_status: normalized.operational_status, service_status: normalized.service_status, home_station: normalized.home_station, notes: normalized.notes })) return this.getVehicle(normalized.vehicle_id);
        throw new ApiError("CONFLICT", `Vehicle ${normalized.vehicle_id} already exists with a different definition`, 409);
      }
      const now = new Date().toISOString();
      const record = { ...normalized, created_at: now, updated_at: now, correlation_id: meta.correlationId };
      this.vehicles.create(record);
      this.audit("vehicle", record.vehicle_id, "create_vehicle", meta.correlationId, undefined, record);
      this.event("VehicleCreated", meta.correlationId, { vehicle_id: record.vehicle_id, operational_status: record.operational_status, service_status: record.service_status });
      this.syncIntent("vehicle", "createVehicleMirror", meta.correlationId, this.vtigerMapper.mapVehicleCreate(record));
      this.vehicleVtigerLinks.upsert({ vehicle_id: record.vehicle_id, external_key: `${this.vtigerMapper.sourceNamespace}:vehicle:${record.vehicle_id}`, create_correlation_id: meta.correlationId, last_correlation_id: meta.correlationId, sync_status: "pending", last_error_code: null, last_synced_at: null, remote_id: null, remote_number: null, created_at: now, updated_at: now });
      if (meta.idempotencyKey) this.idempotency.save("vehicle", meta.idempotencyKey, record.vehicle_id, now, fingerprint);
      return record;
    });
  }

  getVehicle(vehicleId) {
    const vehicle = this.vehicles.findById(vehicleId);
    if (!vehicle) throw new ApiError("NOT_FOUND", `Vehicle ${vehicleId} not found`, 404);
    const link = this.vehicleVtigerLinks.findByVehicleId(vehicleId);
    const intent = this.syncIntents.listAll().filter((item) => item.entity_type === "vehicle" && item.payload?.vehicle_id === vehicleId).at(-1);
    return { ...vehicle, vtiger: { record_id: link?.remote_id ?? null, record_number: link?.remote_number ?? null, external_key: link?.external_key ?? `${this.vtigerMapper.sourceNamespace}:vehicle:${vehicleId}`, sync_status: link?.sync_status ?? intent?.status ?? "pending", attempt_count: intent?.attempt_count ?? 0, last_error_code: link?.last_error_code ?? intent?.last_error_classification ?? null, last_synced_at: link?.last_synced_at ?? null } };
  }

  listVehicles() { return this.vehicles.list().map((vehicle) => this.getVehicle(vehicle.vehicle_id)); }

  updateVehicle(vehicleId, payload, meta) {
    if (payload.vehicle_id !== undefined) throw new ApiError("INVALID_PAYLOAD", "vehicle_id is immutable", 400);
    if (payload.operational_status !== undefined && !VEHICLE_OPERATIONAL_STATUSES.includes(payload.operational_status)) throw new ApiError("INVALID_PAYLOAD", "Invalid operational_status", 400);
    if (payload.service_status !== undefined && !VEHICLE_SERVICE_STATUSES.includes(payload.service_status)) throw new ApiError("INVALID_PAYLOAD", "Invalid service_status", 400);
    const current = this.vehicles.findById(vehicleId);
    if (!current) throw new ApiError("NOT_FOUND", `Vehicle ${vehicleId} not found`, 404);
    const updated = { ...current, ...payload, vehicle_id: vehicleId, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
    if (payload.operational_status && payload.operational_status !== current.operational_status && this.vehicles.countActiveAssignments(vehicleId) > 0 && payload.operational_status === "Available") throw new ApiError("CONFLICT", `Vehicle ${vehicleId} has active assignments`, 409);
    this.vehicles.update(updated);
    this.audit("vehicle", vehicleId, payload.operational_status || payload.service_status ? "vehicle_status_change" : "update_vehicle", meta.correlationId, current, updated);
    this.event(payload.operational_status || payload.service_status ? "VehicleStatusChanged" : "VehicleUpdated", meta.correlationId, { vehicle_id: vehicleId, operational_status: updated.operational_status, service_status: updated.service_status });
    const link = this.vehicleVtigerLinks.findByVehicleId(vehicleId);
    this.syncIntent("vehicle", "updateVehicleMirror", meta.correlationId, { ...this.vtigerMapper.mapVehicleUpdate({ ...updated, remote_id: link?.remote_id }), vehicle_id: vehicleId });
    return this.getVehicle(vehicleId);
  }

  createStockItem(payload, meta) {
    const normalized = { stock_item_id: payload.stock_item_id, name: payload.name, category: payload.category, unit_of_measure: payload.unit_of_measure, item_type: payload.item_type, active_status: payload.active_status ?? "Active", description: payload.description ?? null };
    const fingerprint = JSON.stringify(normalized);
    if (meta.idempotencyKey) { const existing = this.idempotency.get("stock_item", meta.idempotencyKey); if (existing) { if (existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409); return this.getStockItem(existing.resource_id); } }
    return this.db.withTransaction(() => {
      if (meta.idempotencyKey) { const existing = this.idempotency.get("stock_item", meta.idempotencyKey); if (existing) { if (existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409); return this.getStockItem(existing.resource_id); } }
      const conflict = this.stockItems.findById(normalized.stock_item_id);
      if (conflict) { const comparable = ["name","category","unit_of_measure","item_type","active_status","description"].every((k) => conflict[k] === normalized[k]); if (comparable) return this.getStockItem(normalized.stock_item_id); throw new ApiError("CONFLICT", `Stock item ${normalized.stock_item_id} already exists with a different definition`, 409); }
      const now = new Date().toISOString(); const record = { ...normalized, created_at: now, updated_at: now, correlation_id: meta.correlationId };
      this.stockItems.create(record); this.audit("stock_item", record.stock_item_id, "create_stock_item", meta.correlationId, undefined, record); this.event("StockItemCreated", meta.correlationId, { stock_item_id: record.stock_item_id });
      this.syncIntent("stock_item", "createStockItemMirror", meta.correlationId, this.vtigerMapper.mapStockItemCreate(record));
      this.stockItemVtigerLinks.upsert({ stock_item_id: record.stock_item_id, external_key: `${this.vtigerMapper.sourceNamespace}:stock-item:${record.stock_item_id}`, create_correlation_id: meta.correlationId, last_correlation_id: meta.correlationId, sync_status: "pending", last_error_code: null, last_synced_at: null, remote_id: null, remote_number: null, created_at: now, updated_at: now });
      if (meta.idempotencyKey) this.idempotency.save("stock_item", meta.idempotencyKey, record.stock_item_id, now, fingerprint);
      return this.getStockItem(record.stock_item_id);
    });
  }

  getStockItem(id) { const item=this.stockItems.findById(id); if(!item) throw new ApiError("NOT_FOUND", `Stock item ${id} not found`, 404); const link=this.stockItemVtigerLinks.findByStockItemId(id); const intent=this.syncIntents.listAll().filter((x)=>x.entity_type==="stock_item"&&x.payload?.stock_item_id===id).at(-1); return { ...item, vtiger:{record_id:link?.remote_id??null,record_number:link?.remote_number??null,external_key:link?.external_key??`${this.vtigerMapper.sourceNamespace}:stock-item:${id}`,sync_status:link?.sync_status??intent?.status??"pending",attempt_count:intent?.attempt_count??0,last_error_code:link?.last_error_code??intent?.last_error_classification??null,last_synced_at:link?.last_synced_at??null} }; }
  listStockItems() { return this.stockItems.list().map((x)=>this.getStockItem(x.stock_item_id)); }
  updateStockItem(id, payload, meta) { if(payload.stock_item_id!==undefined) throw new ApiError("INVALID_PAYLOAD","stock_item_id is immutable",400); const current=this.stockItems.findById(id); if(!current) throw new ApiError("NOT_FOUND",`Stock item ${id} not found`,404); if(payload.item_type!==undefined&&!STOCK_ITEM_TYPES.includes(payload.item_type)) throw new ApiError("INVALID_PAYLOAD","Invalid item_type",400); if(payload.active_status!==undefined&&!STOCK_ACTIVE_STATUSES.includes(payload.active_status)) throw new ApiError("INVALID_PAYLOAD","Invalid active_status",400); const updated={...current,...payload,stock_item_id:id,updated_at:new Date().toISOString(),correlation_id:meta.correlationId}; this.stockItems.update(updated); this.audit("stock_item",id,"update_stock_item",meta.correlationId,current,updated); this.event("StockItemUpdated",meta.correlationId,{stock_item_id:id,active_status:updated.active_status}); const link=this.stockItemVtigerLinks.findByStockItemId(id); this.syncIntent("stock_item","updateStockItemMirror",meta.correlationId,{...this.vtigerMapper.mapStockItemUpdate({...updated,remote_id:link?.remote_id}),stock_item_id:id}); return this.getStockItem(id); }

  getVehicleStock(vehicleId) { if(!this.vehicles.findById(vehicleId)) throw new ApiError("NOT_FOUND",`Vehicle ${vehicleId} not found`,404); return this.vehicleStock.list(vehicleId).map((row)=>{const link=this.vehicleStockVtigerLinks.find(vehicleId,row.stock_item_id);const intent=this.syncIntents.listAll().filter((x)=>x.entity_type==="vehicle_stock"&&x.payload?.vehicle_id===vehicleId&&x.payload?.stock_item_id===row.stock_item_id).at(-1);return {...row,low_stock:Number(row.quantity_on_hand)<=Number(row.minimum_quantity),vtiger:{record_id:link?.remote_id??null,record_number:link?.remote_number??null,external_key:link?.external_key??`${this.vtigerMapper.sourceNamespace}:vehicle-stock:${vehicleId}:${row.stock_item_id}`,sync_status:link?.sync_status??intent?.status??"pending",attempt_count:intent?.attempt_count??0,last_error_code:link?.last_error_code??intent?.last_error_classification??null,last_synced_at:link?.last_synced_at??null}};}); }

  adjustVehicleStock(vehicleId, stockItemId, payload, meta) {
    const vehicle=this.vehicles.findById(vehicleId); const item=this.stockItems.findById(stockItemId); if(!vehicle||!item) throw new ApiError("NOT_FOUND","Vehicle or stock item not found",404); if(item.active_status!=="Active") throw new ApiError("CONFLICT","Inactive stock items cannot be loaded",409); if(!["restock","manual_correction"].includes(payload.type)) throw new ApiError("INVALID_PAYLOAD","type must be restock or manual_correction",400); const quantity=payload.type==="manual_correction"?normalizeSignedDecimal(payload.quantity_delta ?? payload.quantity):normalizeDecimal(payload.quantity_delta ?? payload.quantity); if(quantity==="0.000"||quantity==="-0.000") throw new ApiError("INVALID_PAYLOAD","quantity must be non-zero",400); if(payload.type==="restock"&&quantity.startsWith("-")) throw new ApiError("INVALID_PAYLOAD","restock quantity must be positive",400); const fingerprint=JSON.stringify({vehicle_id:vehicleId,stock_item_id:stockItemId,type:payload.type,quantity_delta:quantity,reason:payload.reason}); if(meta.idempotencyKey){const e=this.idempotency.get("stock_adjustment",meta.idempotencyKey);if(e){if(e.request_fingerprint!==fingerprint)throw new ApiError("CONFLICT","Idempotency key was reused with a different request",409);return this.getVehicleStock(vehicleId).find((x)=>x.stock_item_id===stockItemId);}}
    return this.db.withTransaction(()=>{const now=new Date().toISOString();const existing=this.vehicleStock.find(vehicleId,stockItemId);const delta=quantity;const next=addDecimal(existing?.quantity_on_hand??"0",delta);const row=existing?{...existing,quantity_on_hand:next,updated_at:now,correlation_id:meta.correlationId}:{vehicle_id:vehicleId,stock_item_id:stockItemId,quantity_on_hand:next,minimum_quantity:payload.minimum_quantity??"0",target_quantity:payload.target_quantity??next,created_at:now,updated_at:now,correlation_id:meta.correlationId};if(existing)this.vehicleStock.update(row);else this.vehicleStock.create(row);const txId=`STX-${randomUUID()}`;this.db.execute(`INSERT INTO stock_transactions (transaction_id,vehicle_id,stock_item_id,transaction_type,quantity_delta,source_reference,reason,correlation_id,actor_id,created_at) VALUES (${sqlValue(txId)},${sqlValue(vehicleId)},${sqlValue(stockItemId)},${sqlValue(payload.type)},${sqlValue(delta)},${sqlValue(meta.idempotencyKey??txId)},${sqlValue(payload.reason)},${sqlValue(meta.correlationId)},${sqlValue(meta.actorId??null)},${sqlValue(now)});`);this.audit("vehicle_stock",`${vehicleId}:${stockItemId}`,"adjust_stock",meta.correlationId,existing,row);this.event("VehicleStockAdjusted",meta.correlationId,{vehicle_id:vehicleId,stock_item_id:stockItemId,quantity_delta:delta,transaction_id:txId});this.syncIntent("vehicle_stock","createVehicleStockMirror",meta.correlationId,this.vtigerMapper.mapVehicleStockCreate(row));this.vehicleStockVtigerLinks.upsert({vehicle_id:vehicleId,stock_item_id:stockItemId,external_key:`${this.vtigerMapper.sourceNamespace}:vehicle-stock:${vehicleId}:${stockItemId}`,create_correlation_id:meta.correlationId,last_correlation_id:meta.correlationId,sync_status:"pending",last_error_code:null,last_synced_at:null,remote_id:this.vehicleStockVtigerLinks.find(vehicleId,stockItemId)?.remote_id??null,remote_number:null,created_at:existing?.created_at??now,updated_at:now});if(meta.idempotencyKey)this.idempotency.save("stock_adjustment",meta.idempotencyKey,txId,now,fingerprint);return this.getVehicleStock(vehicleId).find((x)=>x.stock_item_id===stockItemId);});
  }

  getAssignment(assignmentId) {
    const assignment = this.assignments.findById(assignmentId);
    if (!assignment) throw new ApiError("NOT_FOUND", `Assignment ${assignmentId} not found`, 404);
    const link = this.assignmentVtigerLinks.findByAssignmentId(assignmentId);
    const crewLinks = this.assignmentPersonnelVtigerLinks.listByAssignmentId(assignmentId);
    const intents = this.syncIntents.listAll().filter((item) => item.entity_type === "assignment" && item.payload?.assignment_id === assignmentId);
    const intent = intents.at(-1);
    return { ...assignment, vtiger: { record_id: link?.remote_id ?? null, record_number: link?.remote_number ?? null, external_key: link?.external_key ?? `${this.vtigerMapper.sourceNamespace}:assignment:${assignmentId}`, incident_record_id: link?.incident_remote_id ?? null, sync_status: link?.sync_status ?? intent?.status ?? "pending", attempt_count: intent?.attempt_count ?? 0, last_error_code: link?.last_error_code ?? intent?.last_error_classification ?? null, last_synced_at: link?.last_synced_at ?? null, crew_links: crewLinks.map((crew) => ({ staff_id: crew.staff_id, personnel_record_id: crew.personnel_remote_id ?? null, junction_record_id: crew.junction_remote_id ?? null, sync_status: crew.sync_status })) } };
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
    const link = this.assignmentVtigerLinks.findByAssignmentId(assignmentId);
    this.syncIntent("assignment", "updateAssignmentMirror", meta.correlationId, { ...this.vtigerMapper.mapAssignmentUpdate({ ...updated, remote_id: link?.remote_id, incident_remote_id: link?.incident_remote_id }), incident_id: current.incident_id, assignment_id: assignmentId });
    return this.getAssignment(assignmentId);
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
      intent_type: operation,
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
    return this.linkPatientToPatientCase(this.resolveLegacyPatientCase(incidentId, true, meta), payload, meta);
  }

  getPatientLink(incidentId) {
    this.getIncident(incidentId);
    if (!this.patientCases.list(incidentId).length) throw new ApiError('NOT_FOUND', `Patient link for incident ${incidentId} not found`, 404);
    return this.getPatientCasePatientLink(this.resolveLegacyPatientCase(incidentId, false));
  }

  getAssignmentsByIncident(incidentId) {
    this.getIncident(incidentId);
    const assignments = this.assignments.findByIncidentId(incidentId);
    if (assignments.length === 0) throw new ApiError("NOT_FOUND", `Assignments for incident ${incidentId} not found`, 404);
    return {
      incident_id: incidentId,
      assignments: assignments.map((assignment) => ({
        assignment_id: assignment.assignment_id,
        status: assignment.status,
        vehicle_status: assignment.vehicle_status,
        vehicle_id: assignment.vehicle_id,
        crew_ids: assignment.crew_ids,
        reason: assignment.reason,
        updated_at: assignment.updated_at,
        vtiger: this.getAssignment(assignment.assignment_id).vtiger
      }))
    };
  }

  getAssignmentById(assignmentId) { return this.getAssignment(assignmentId); }


  async createEncounterForIncident(incidentId, payload, meta) {
    this.getIncident(incidentId);
    if (!this.patientCases.list(incidentId).length) throw new ApiError('CONFLICT', 'Cannot create encounter without linked patient', 409);
    const record = await this.createEncounterForPatientCase(this.resolveLegacyPatientCase(incidentId, false), payload, { ...meta, legacy: true });
    return { encounter_id: record.encounter_id, status: record.status, linked_incident_id: incidentId };
  }

  getEncounterByIncident(incidentId) {
    const r = this.getPatientCaseEncounter(this.resolveLegacyPatientCase(incidentId, false));
    return { incident_id: r.incident_id, openemr_encounter_id: r.openemr_encounter_id, encounter_id: r.encounter_id,
      openemr_patient_id: r.openemr_patient_id, encounter_status: r.encounter_status, care_started_at: r.care_started_at };
  }

  async createObservationForEncounter(encounterId, payload, meta) {
    const encounter = this.encounterLinks.findByEncounterId(encounterId);
    if (!encounter) throw new ApiError("NOT_FOUND", `Encounter ${encounterId} not found`, 404);

    const created = await this.openemr.createObservation({
      ...payload,
      encounter_id: encounterId,
      incident_id: encounter.incident_id,
      patient_id: encounter.openemr_patient_id
    });

    const normalized = {
      observation_id: created.observation_id,
      encounter_id: created.encounter_id ?? encounterId,
      status: created.status
    };

    if (this.patientCases.find(encounter.patient_case_id)?.status === 'Encounter Open') this.setPatientCaseStatus(encounter.patient_case_id, 'Care In Progress', meta);
    this.audit("observation", normalized.observation_id, "create_observation", meta.correlationId, undefined, {
      ...normalized,
      incident_id: encounter.incident_id,
      patient_case_id: encounter.patient_case_id
    });
    this.event("ObservationCreated", meta.correlationId, {
      patient_case_id: encounter.patient_case_id,
      incident_id: encounter.incident_id,
      encounter_id: normalized.encounter_id,
      observation_id: normalized.observation_id
    });

    return normalized;
  }

  async createInterventionForEncounter(encounterId, payload, meta) {
    const encounter = this.encounterLinks.findByEncounterId(encounterId);
    if (!encounter) throw new ApiError("NOT_FOUND", `Encounter ${encounterId} not found`, 404);
    const fingerprint = JSON.stringify({ encounter_id: encounterId, ...payload });
    if (meta.idempotencyKey) {
      const existing = this.idempotency.get("intervention", meta.idempotencyKey);
      if (existing) {
        if (existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409);
        return { intervention_id: existing.resource_id, encounter_id: encounterId, status: "created", replayed: true };
      }
    }

    const created = await this.openemr.createIntervention({
      ...payload,
      encounter_id: encounterId,
      incident_id: encounter.incident_id,
      patient_id: encounter.openemr_patient_id
    });

    const normalized = {
      intervention_id: created.intervention_id,
      encounter_id: created.encounter_id ?? encounterId,
      status: created.status
    };

    if (this.patientCases.find(encounter.patient_case_id)?.status === 'Encounter Open') this.setPatientCaseStatus(encounter.patient_case_id, 'Care In Progress', meta);
    this.audit("intervention", normalized.intervention_id, "create_intervention", meta.correlationId, undefined, {
      ...normalized,
      incident_id: encounter.incident_id,
      patient_case_id: encounter.patient_case_id
    });
    this.event("InterventionCreated", meta.correlationId, {
      patient_case_id: encounter.patient_case_id,
      incident_id: encounter.incident_id,
      encounter_id: normalized.encounter_id,
      intervention_id: normalized.intervention_id
    });

    if (payload.stock_item_id) this.recordClinicalStockUsage({ ...payload, patient_case_id: encounter.patient_case_id, vehicle_id: this.getPatientCase(encounter.patient_case_id).vehicle_id ?? payload.vehicle_id, intervention_id: normalized.intervention_id, incident_id: encounter.incident_id, encounter_id: normalized.encounter_id }, meta);

    if (meta.idempotencyKey) this.idempotency.save("intervention", meta.idempotencyKey, normalized.intervention_id, new Date().toISOString(), fingerprint);

    return normalized;
  }

  recordClinicalStockUsage(payload, meta) {
    const item = this.stockItems.findById(payload.stock_item_id); if (!item) { const legacy = { patient_case_id: payload.patient_case_id ?? null, intervention_id: payload.intervention_id, incident_id: payload.incident_id, encounter_id: payload.encounter_id, stock_item_id: payload.stock_item_id, quantity_used: 1, usage_source: "clinical_event", performed_at: payload.performed_at, intervention_type: payload.type, intervention_name: payload.name }; this.syncIntent("stock_usage", "recordStockUsageMirror", meta.correlationId, Object.fromEntries(Object.entries(legacy).filter(([key]) => key !== "patient_case_id"))); return { discrepancy_status: "STOCK_ITEM_NOT_FOUND" }; }
    const usageId = `SU-${payload.intervention_id}-${payload.stock_item_id}`; const existing=this.stockUsage.find(usageId); if(existing)return existing;
    const candidates = payload.vehicle_id ? [payload.vehicle_id] : [...new Set(this.assignments.findByIncidentId(payload.incident_id).filter((a)=>a.status!=="Cancelled"&&a.status!=="Stood Down").map((a)=>a.vehicle_id))];
    const vehicleId = candidates.length===1 ? candidates[0] : null; const qty=normalizeDecimal(payload.quantity_used??"1"); const now=new Date().toISOString();
    return this.db.withTransaction(()=>{let discrepancy=vehicleId?null:"VEHICLE_SOURCE_UNRESOLVED";const loadout=vehicleId?this.vehicleStock.find(vehicleId,payload.stock_item_id):null;let next=loadout?.quantity_on_hand; if(vehicleId&&!loadout)discrepancy="LOADOUT_MISSING"; else if(vehicleId&&Number(qty)>Number(loadout.quantity_on_hand))discrepancy="INSUFFICIENT_STOCK"; else if(vehicleId){next=addDecimal(loadout.quantity_on_hand,`-${qty}`);this.vehicleStock.update({...loadout,quantity_on_hand:next,updated_at:now,correlation_id:meta.correlationId});this.db.execute(`INSERT INTO stock_transactions (transaction_id,vehicle_id,stock_item_id,transaction_type,quantity_delta,source_reference,reason,correlation_id,actor_id,created_at) VALUES (${sqlValue(`STX-${usageId}`)},${sqlValue(vehicleId)},${sqlValue(payload.stock_item_id)},'usage',${sqlValue(`-${qty}`)},${sqlValue(usageId)},${sqlValue("Clinical intervention")},${sqlValue(meta.correlationId)},${sqlValue(meta.actorId??null)},${sqlValue(now)});`);}const usage={stock_usage_id:usageId,intervention_id:payload.intervention_id,incident_id:payload.incident_id,patient_case_id:payload.patient_case_id??null,encounter_id:payload.encounter_id??null,stock_item_id:payload.stock_item_id,vehicle_id:vehicleId,quantity_used:qty,usage_source:"clinical_event",performed_at:payload.performed_at,intervention_type:payload.type,correlation_id:meta.correlationId,discrepancy_status:discrepancy,created_at:now};this.stockUsage.create(usage);this.audit("stock_usage",usageId,"record_stock_usage",meta.correlationId,undefined,usage);this.event(discrepancy?"StockDiscrepancyRecorded":"StockUsageRecorded",meta.correlationId,{patient_case_id:payload.patient_case_id??null,incident_id:payload.incident_id,stock_usage_id:usageId,stock_item_id:payload.stock_item_id,vehicle_id:vehicleId,discrepancy_status:discrepancy});this.syncIntent("stock_usage","recordStockUsageMirror",meta.correlationId,this.vtigerMapper.mapStockUsageRecord(Object.fromEntries(Object.entries(usage).filter(([key]) => key !== "patient_case_id"))));this.stockUsageVtigerLinks.upsert({stock_usage_id:usageId,external_key:`${this.vtigerMapper.sourceNamespace}:stock-usage:${usageId}`,create_correlation_id:meta.correlationId,last_correlation_id:meta.correlationId,sync_status:"pending",last_error_code:null,last_synced_at:null,remote_id:null,remote_number:null,created_at:now,updated_at:now});return usage;});
  }

  async getInterventionsForEncounter(encounterId) {
    const encounter = this.encounterLinks.findByEncounterId(encounterId);
    if (!encounter) throw new ApiError("NOT_FOUND", `Encounter ${encounterId} not found`, 404);

    const interventions = await this.openemr.getInterventions({
      encounter_id: encounterId,
      incident_id: encounter.incident_id,
      patient_id: encounter.openemr_patient_id
    });

    if (!Array.isArray(interventions) || interventions.length === 0) {
      throw new ApiError("NOT_FOUND", `Interventions for encounter ${encounterId} not found`, 404);
    }

    const stockIntents = this.syncIntents
      .listAll()
      .filter((intent) => intent.entity_type === "stock_usage" && intent.payload?.encounter_id === encounterId);

    return interventions.map((intervention) => {
      const normalized = {
        intervention_id: intervention.intervention_id,
        encounter_id: intervention.encounter_id ?? encounterId,
        status: intervention.status
      };

      if (!intervention.stock_item_id) return normalized;

      const matchingIntent = stockIntents.find((intent) => {
        if (intent.payload?.stock_item_id !== intervention.stock_item_id) return false;
        if (intervention.performed_at && intent.payload?.performed_at !== intervention.performed_at) return false;
        if (intervention.type && intent.payload?.intervention_type !== intervention.type) return false;
        if (intervention.name && intent.payload?.intervention_name !== intervention.name) return false;
        return true;
      });

      return {
        ...normalized,
        stock_item_id: intervention.stock_item_id,
        stock_sync_status: matchingIntent?.status ?? "not_queued",
        stock_sync_attempt_count: matchingIntent?.attempt_count ?? 0,
        stock_sync_last_error: matchingIntent?.last_error ?? null
      };
    });
  }

  async createHandoverForEncounter(encounterId, payload, meta) {
    const encounter = this.encounterLinks.findByEncounterId(encounterId);
    if (!encounter) throw new ApiError("NOT_FOUND", `Encounter ${encounterId} not found`, 404);

    const created = await this.openemr.createHandover({
      ...payload,
      encounter_id: encounterId,
      incident_id: encounter.incident_id,
      patient_id: encounter.openemr_patient_id
    });

    const now = new Date().toISOString();
    const closureReady = created.handover_status === "Handover Completed";
    const updatedEncounter = {
      ...encounter,
      encounter_status: closureReady ? "Handover Completed" : encounter.encounter_status,
      handover_time: created.handover_time,
      handover_status: created.handover_status,
      disposition: created.disposition,
      destination_facility: created.destination_facility ?? null,
      receiving_clinician: created.receiving_clinician ?? null,
      handover_notes: created.notes ?? null,
      closure_ready: closureReady,
      updated_at: now,
      correlation_id: meta.correlationId
    };
    this.encounterLinks.save(updatedEncounter);
    if (closureReady) this.setPatientCaseStatus(encounter.patient_case_id, "Handover Completed", meta);

    const normalized = {
      handover_id: created.handover_id,
      encounter_id: encounterId,
      handover_status: created.handover_status,
      disposition: created.disposition,
      closure_ready: closureReady
    };

    this.audit("handover", normalized.handover_id, "create_handover", meta.correlationId, undefined, {
      ...normalized,
      incident_id: encounter.incident_id,
      patient_case_id: encounter.patient_case_id
    });
    this.event("HandoverCompleted", meta.correlationId, {
      patient_case_id: encounter.patient_case_id,
      incident_id: encounter.incident_id,
      encounter_id: encounterId,
      handover_id: normalized.handover_id,
      disposition: normalized.disposition,
      handover_status: normalized.handover_status,
      closure_ready: normalized.closure_ready
    });

    return normalized;
  }

  async getHandoverForEncounter(encounterId) {
    const encounter = this.encounterLinks.findByEncounterId(encounterId);
    if (!encounter) throw new ApiError("NOT_FOUND", `Encounter ${encounterId} not found`, 404);

    const handover = await this.openemr.getHandover({
      encounter_id: encounterId,
      incident_id: encounter.incident_id,
      patient_id: encounter.openemr_patient_id
    });

    if (!handover || !handover.handover_status || !handover.disposition) {
      throw new ApiError("NOT_FOUND", `Handover for encounter ${encounterId} not found`, 404);
    }

    return {
      handover_id: handover.handover_id,
      encounter_id: encounterId,
      handover_status: handover.handover_status,
      disposition: handover.disposition,
      closure_ready: Boolean(handover.closure_ready ?? (handover.handover_status === "Handover Completed"))
    };
  }

  listOutboxEvents() {
    return this.events.listAll();
  }

  listSyncIntents() {
    return this.syncIntents.listAll();
  }

  replayDeadLetterIntent(intentId) {
    this.syncIntents.replayDeadLetter(intentId);
    return this.syncIntents.listAll().find((intent) => intent.intent_id === Number(intentId)) ?? null;
  }
}

Object.assign(OrchestrationService.prototype, patientCaseMethods);

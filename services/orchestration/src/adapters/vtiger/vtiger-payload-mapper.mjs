export class VtigerPayloadMapper {
  constructor({ sourceNamespace = process.env.VTIGER_SOURCE_NAMESPACE ?? "vems" } = {}) {
    this.sourceNamespace = sourceNamespace;
  }

  externalKey(incident) {
    return incident.external_key ?? `${this.sourceNamespace}:${incident.incident_id}`;
  }

  mapIncidentCreate(incident, call = {}) {
    return {
      elementType: "HelpDesk",
      ticket_title: `EMS incident ${incident.incident_id}`,
      description: incident.description,
      ticketpriorities: { critical: "Urgent", high: "High", medium: "Normal", low: "Low" }[incident.priority] ?? "Normal",
      ticketstatus: ["New", "Awaiting Dispatch"].includes(incident.status) ? "Open" : ["Closed", "Cancelled", "Stood Down"].includes(incident.status) ? "Closed" : "In Progress",
      assigned_user_id: process.env.VTIGER_ASSIGNED_USER_ID ?? incident.assigned_user_id,
      incident_id: incident.incident_id,
      vems_incident_id: incident.incident_id,
      vems_external_key: this.externalKey(incident),
      vems_call_id: incident.call_id,
      vems_call_source: call.call_source ?? incident.call_source,
      vems_received_at_utc: call.received_at ?? incident.received_at,
      vems_category: incident.category,
      vems_address: incident.address,
      vems_patient_count: incident.patient_count,
      vems_status: incident.status,
      vems_correlation_id: incident.correlation_id,
      vems_last_correlation_id: incident.correlation_id,
      vems_created_at_utc: incident.created_at,
      vems_updated_at_utc: incident.updated_at,
      vems_closed_at_utc: incident.status === "Closed" ? incident.updated_at : ""
      ,status: incident.status
    };
  }

  mapIncidentUpdate(incident) {
    const payload = this.mapIncidentCreate(incident, incident);
    delete payload.elementType;
    return {
      ...payload,
      id: incident.remote_id ?? incident.vtiger?.record_id,
      vems_last_correlation_id: incident.correlation_id
    };
  }

  mapAssignmentCreate(assignment) {
    const externalKey = assignment.external_key ?? `${this.sourceNamespace}:assignment:${assignment.assignment_id}`;
    const crewIds = Array.isArray(assignment.crew_ids) ? [...new Set(assignment.crew_ids)].sort().join(",") : (assignment.crew_ids ?? "");
    return {
      elementType: "VEMSAssignments",
      vems_assignment_id: assignment.assignment_id,
      vems_external_key: externalKey,
      vems_incident_id: assignment.incident_id,
      vems_incident_remote_id: assignment.incident_remote_id,
      incident_ref: assignment.incident_remote_id,
      vehicle_ref: assignment.vehicle_ref ?? assignment.vehicle_remote_id ?? null,
      vems_vehicle_id: assignment.vehicle_id,
      vems_crew_ids: crewIds,
      vems_status: assignment.status,
      vems_vehicle_status: assignment.vehicle_status,
      vems_reason: assignment.reason ?? "",
      vems_correlation_id: assignment.correlation_id,
      vems_last_correlation_id: assignment.correlation_id,
      vems_created_at_utc: assignment.created_at,
      vems_updated_at_utc: assignment.updated_at,
      assigned_user_id: assignment.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID
      ,assignment_id: assignment.assignment_id
      ,incident_id: assignment.incident_id
      ,status: assignment.status
    };
  }

  mapAssignmentUpdate(assignment) {
    const mapped = this.mapAssignmentCreate(assignment);
    delete mapped.elementType;
    mapped.vems_last_correlation_id = assignment.correlation_id;
    mapped.vehicle_ref = assignment.vehicle_ref ?? assignment.vehicle_remote_id ?? null;
    mapped.status = assignment.status;
    return { ...mapped, id: assignment.remote_id ?? assignment.vtiger?.record_id };
  }

  mapVehicleCreate(vehicle) {
    return {
      elementType: "VEMSVehicles",
      vems_vehicle_id: vehicle.vehicle_id,
      vems_external_key: vehicle.external_key ?? `${this.sourceNamespace}:vehicle:${vehicle.vehicle_id}`,
      vems_callsign: vehicle.callsign,
      vems_operational_status: vehicle.operational_status,
      vems_service_status: vehicle.service_status,
      vems_vehicle_type: vehicle.vehicle_type,
      vems_home_station: vehicle.home_station,
      vems_notes: vehicle.notes ?? "",
      vems_correlation_id: vehicle.correlation_id,
      vems_last_correlation_id: vehicle.correlation_id,
      vems_created_at_utc: vehicle.created_at,
      vems_updated_at_utc: vehicle.updated_at,
      assigned_user_id: vehicle.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID,
      vehicle_id: vehicle.vehicle_id
    };
  }

  mapVehicleUpdate(vehicle) {
    const mapped = this.mapVehicleCreate(vehicle);
    delete mapped.elementType;
    mapped.vems_last_correlation_id = vehicle.correlation_id;
    mapped.id = vehicle.remote_id ?? vehicle.vtiger?.record_id;
    return mapped;
  }

  mapStockUsageRecord(stockUsage) {
    return {
      stock_usage_ref: stockUsage.intervention_id ?? null,
      incident_id: stockUsage.incident_id,
      encounter_id: stockUsage.encounter_id ?? null,
      stock_item_id: stockUsage.stock_item_id,
      quantity_used: stockUsage.quantity_used ?? 1,
      usage_source: stockUsage.usage_source ?? "clinical_event",
      performed_at: stockUsage.performed_at,
      intervention_type: stockUsage.intervention_type,
      intervention_name: stockUsage.intervention_name
    };
  }
}

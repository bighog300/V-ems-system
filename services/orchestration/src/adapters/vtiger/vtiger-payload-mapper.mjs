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
    return {
      assignment_id: assignment.assignment_id,
      incident_id: assignment.incident_id,
      status: assignment.status,
      vehicle_status: assignment.vehicle_status,
      vehicle_id: assignment.vehicle_id,
      crew_ids: assignment.crew_ids,
      reason: assignment.reason,
      created_at: assignment.created_at,
      updated_at: assignment.updated_at,
      correlation_id: assignment.correlation_id
    };
  }

  mapAssignmentUpdate(assignment) {
    return {
      assignment_id: assignment.assignment_id,
      incident_id: assignment.incident_id,
      status: assignment.status,
      updated_at: assignment.updated_at,
      correlation_id: assignment.correlation_id
    };
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

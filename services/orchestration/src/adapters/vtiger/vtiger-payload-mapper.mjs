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

  mapPersonnelCreate(personnel) {
    return {
      elementType: "VEMSPersonnel",
      vems_staff_id: personnel.staff_id,
      vems_external_key: personnel.external_key ?? `${this.sourceNamespace}:personnel:${personnel.staff_id}`,
      vems_display_name: personnel.display_name,
      vems_role: personnel.role,
      vems_operational_status: personnel.operational_status,
      vems_home_station: personnel.home_station,
      vems_callsign: personnel.callsign ?? "",
      vems_phone: personnel.phone ?? "",
      vems_email: personnel.email ?? "",
      vems_notes: personnel.notes ?? "",
      vems_correlation_id: personnel.correlation_id,
      vems_last_correlation_id: personnel.correlation_id,
      vems_created_at_utc: personnel.created_at,
      vems_updated_at_utc: personnel.updated_at,
      assigned_user_id: personnel.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID,
      staff_id: personnel.staff_id
    };
  }

  mapPersonnelUpdate(personnel) {
    const mapped = this.mapPersonnelCreate(personnel);
    delete mapped.elementType;
    mapped.vems_last_correlation_id = personnel.correlation_id;
    mapped.id = personnel.remote_id ?? personnel.vtiger?.record_id;
    return mapped;
  }

  mapAssignmentCrewCreate(link) {
    return {
      elementType: "VEMSAssignmentCrew",
      vems_assignment_crew_id: link.assignment_crew_id ?? `${this.sourceNamespace}:assignment-crew:${link.assignment_id}:${link.staff_id}`,
      vems_external_key: link.external_key ?? `${this.sourceNamespace}:assignment-crew:${link.assignment_id}:${link.staff_id}`,
      vems_assignment_id: link.assignment_id,
      vems_staff_id: link.staff_id,
      assignment_ref: link.assignment_remote_id,
      personnel_ref: link.personnel_remote_id,
      vems_correlation_id: link.correlation_id,
      vems_last_correlation_id: link.correlation_id,
      vems_created_at_utc: link.created_at,
      vems_updated_at_utc: link.updated_at,
      assigned_user_id: link.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID
    };
  }

  mapStockUsageRecord(stockUsage) {
    const interventionId = stockUsage.intervention_id ?? stockUsage.vems_intervention_id;
    const incidentId = stockUsage.incident_id ?? stockUsage.vems_incident_id;
    const encounterId = stockUsage.encounter_id ?? stockUsage.vems_encounter_id;
    const stockItemId = stockUsage.stock_item_id ?? stockUsage.vems_stock_item_id;
    const vehicleId = stockUsage.vehicle_id ?? stockUsage.vems_vehicle_id;
    const quantityUsed = stockUsage.quantity_used ?? stockUsage.vems_quantity_used ?? "1.000";
    const usageSource = stockUsage.usage_source ?? stockUsage.vems_usage_source ?? "clinical_event";
    const performedAt = stockUsage.performed_at ?? stockUsage.vems_performed_at_utc;
    const correlationId = stockUsage.correlation_id ?? stockUsage.vems_correlation_id;
    return {
      elementType: "VEMSStockUsage",
      vems_stock_usage_id: stockUsage.stock_usage_id ?? stockUsage.vems_stock_usage_id ?? `${this.sourceNamespace}:stock-usage:${interventionId}:${stockItemId}`,
      vems_external_key: stockUsage.external_key ?? stockUsage.vems_external_key ?? `${this.sourceNamespace}:stock-usage:${stockUsage.stock_usage_id ?? stockUsage.vems_stock_usage_id ?? `${interventionId}:${stockItemId}`}`,
      vems_intervention_id: interventionId,
      vems_incident_id: incidentId,
      vems_encounter_id: encounterId ?? "",
      vems_stock_item_id: stockItemId,
      vems_vehicle_id: vehicleId ?? "",
      stock_item_ref: stockUsage.stock_item_remote_id ?? null,
      vehicle_ref: stockUsage.vehicle_remote_id ?? null,
      vems_quantity_used: quantityUsed,
      vems_usage_source: usageSource,
      vems_performed_at_utc: performedAt,
      vems_intervention_type: stockUsage.intervention_type ?? stockUsage.vems_intervention_type,
      vems_correlation_id: correlationId,
      vems_last_correlation_id: stockUsage.last_correlation_id ?? stockUsage.vems_last_correlation_id ?? correlationId,
      vems_created_at_utc: stockUsage.created_at ?? stockUsage.vems_created_at_utc ?? performedAt,
      assigned_user_id: stockUsage.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID,
      stock_usage_id: stockUsage.stock_usage_id ?? stockUsage.vems_stock_usage_id,
      stock_item_id: stockItemId,
      quantity_used: quantityUsed,
      usage_source: usageSource,
      performed_at: performedAt,
      intervention_type: stockUsage.intervention_type,
      intervention_name: stockUsage.intervention_name
    };
  }

  mapStockItemCreate(item) {
    if (item?.vems_stock_item_id) return { ...item, assigned_user_id: item.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID };
    return { elementType: "VEMSStockItems", vems_stock_item_id: item.stock_item_id, vems_external_key: item.external_key ?? `${this.sourceNamespace}:stock-item:${item.stock_item_id}`, vems_name: item.name, vems_category: item.category, vems_unit_of_measure: item.unit_of_measure, vems_item_type: item.item_type, vems_active_status: item.active_status, vems_description: item.description ?? "", vems_correlation_id: item.correlation_id, vems_last_correlation_id: item.correlation_id, vems_created_at_utc: item.created_at, vems_updated_at_utc: item.updated_at, assigned_user_id: item.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID, stock_item_id: item.stock_item_id };
  }

  mapStockItemUpdate(item) { const mapped = this.mapStockItemCreate(item); delete mapped.elementType; delete mapped.stock_item_id; mapped.id = item.remote_id ?? item.vtiger?.record_id; mapped.vems_last_correlation_id = item.correlation_id; return mapped; }

  mapVehicleStockCreate(row) {
    if (row?.vems_vehicle_stock_id) return { ...row, elementType: "VEMSVehicleStock", vems_vehicle_id: row.vems_vehicle_id ?? row.vehicle_id, vems_stock_item_id: row.vems_stock_item_id ?? row.stock_item_id, vehicle_ref: row.vehicle_ref ?? row.vehicle_remote_id, stock_item_ref: row.stock_item_ref ?? row.stock_item_remote_id, assigned_user_id: row.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID };
    const key = row.external_key ?? `${this.sourceNamespace}:vehicle-stock:${row.vehicle_id}:${row.stock_item_id}`;
    return { elementType: "VEMSVehicleStock", vems_vehicle_stock_id: row.vehicle_stock_id ?? `${row.vehicle_id}:${row.stock_item_id}`, vems_external_key: key, vems_vehicle_id: row.vehicle_id, vems_stock_item_id: row.stock_item_id, vehicle_ref: row.vehicle_remote_id, stock_item_ref: row.stock_item_remote_id, vems_quantity_on_hand: row.quantity_on_hand, vems_minimum_quantity: row.minimum_quantity, vems_target_quantity: row.target_quantity, vems_correlation_id: row.correlation_id, vems_last_correlation_id: row.correlation_id, vems_created_at_utc: row.created_at, vems_updated_at_utc: row.updated_at, assigned_user_id: row.assigned_user_id ?? process.env.VTIGER_ASSIGNED_USER_ID, vehicle_stock_id: row.vehicle_stock_id ?? `${row.vehicle_id}:${row.stock_item_id}` };
  }

  mapVehicleStockUpdate(row) { const mapped=this.mapVehicleStockCreate(row); delete mapped.elementType; delete mapped.vehicle_stock_id; mapped.id=row.remote_id ?? row.vtiger?.record_id; mapped.vems_last_correlation_id=row.correlation_id; return mapped; }
}

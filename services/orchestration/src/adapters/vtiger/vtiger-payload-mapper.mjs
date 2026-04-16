export class VtigerPayloadMapper {
  mapIncidentCreate(incident) {
    return {
      incident_id: incident.incident_id,
      call_id: incident.call_id,
      status: incident.status,
      category: incident.category,
      priority: incident.priority,
      description: incident.description,
      address: incident.address,
      patient_count: incident.patient_count,
      created_at: incident.created_at,
      updated_at: incident.updated_at,
      correlation_id: incident.correlation_id
    };
  }

  mapIncidentUpdate(incident) {
    return {
      incident_id: incident.incident_id,
      status: incident.status,
      updated_at: incident.updated_at,
      correlation_id: incident.correlation_id
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
      incident_id: stockUsage.incident_id,
      encounter_id: stockUsage.encounter_id ?? null,
      stock_item_id: stockUsage.stock_item_id,
      performed_at: stockUsage.performed_at,
      intervention_type: stockUsage.intervention_type,
      intervention_name: stockUsage.intervention_name
    };
  }
}

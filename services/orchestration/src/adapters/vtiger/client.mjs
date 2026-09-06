import { VtigerAuth } from "./auth.mjs";
import { VtigerError } from "./errors.mjs";

export function createVtigerWebserviceClient(env = process.env, options = {}) {
  const auth = new VtigerAuth({ baseUrl: env.VTIGER_BASE_URL, username: env.VTIGER_USERNAME, accessKey: env.VTIGER_ACCESS_KEY, timeoutMs: env.VTIGER_TIMEOUT_MS, fetchImpl: options.fetchImpl });
  return {
    auth,
    async healthCheck() {
      const result = await auth.call("describe", { elementType: "HelpDesk" });
      const required = ["ticket_title", "description", "ticketpriorities", "ticketstatus", "assigned_user_id", "ticket_no", "createdtime", "modifiedtime", "vems_incident_id", "vems_external_key", "vems_call_id", "vems_call_source", "vems_received_at_utc", "vems_category", "vems_address", "vems_patient_count", "vems_status", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "vems_closed_at_utc"];
      const names = new Set(result.fields?.map((field) => field.name));
      const missing = required.filter((name) => !names.has(name));
      if (missing.length) throw new VtigerError("VTIGER_SCHEMA_MISMATCH", `HelpDesk schema missing ${missing.join(",")}`, { operation: "describe" });
      const assignment = await auth.call("describe", { elementType: "VEMSAssignments" });
      const assignmentRequired = ["vems_assignment_id", "vems_external_key", "vems_incident_id", "vems_incident_remote_id", "incident_ref", "vehicle_ref", "vems_vehicle_id", "vems_crew_ids", "vems_status", "vems_vehicle_status", "vems_reason", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "assigned_user_id"];
      const assignmentNames = new Set(assignment.fields?.map((field) => field.name));
      const assignmentMissing = assignmentRequired.filter((name) => !assignmentNames.has(name));
      if (assignmentMissing.length) throw new VtigerError("VTIGER_SCHEMA_MISMATCH", `VEMSAssignments schema missing ${assignmentMissing.join(",")}`, { operation: "describe" });
      const vehicle = await auth.call("describe", { elementType: "VEMSVehicles" });
      const vehicleRequired = ["vems_vehicle_id", "vems_external_key", "vems_callsign", "vems_operational_status", "vems_service_status", "vems_vehicle_type", "vems_home_station", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "assigned_user_id"];
      const vehicleNames = new Set(vehicle.fields?.map((field) => field.name));
      const vehicleMissing = vehicleRequired.filter((name) => !vehicleNames.has(name));
      if (vehicleMissing.length) throw new VtigerError("VTIGER_SCHEMA_MISMATCH", `VEMSVehicles schema missing ${vehicleMissing.join(",")}`, { operation: "describe" });
      const personnel = await auth.call("describe", { elementType: "VEMSPersonnel" });
      const personnelRequired = ["vems_staff_id", "vems_external_key", "vems_display_name", "vems_role", "vems_operational_status", "vems_home_station", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "vems_personnel_no", "assigned_user_id"];
      const personnelNames = new Set(personnel.fields?.map((field) => field.name));
      const personnelMissing = personnelRequired.filter((name) => !personnelNames.has(name));
      if (personnelMissing.length) throw new VtigerError("VTIGER_SCHEMA_MISMATCH", `VEMSPersonnel schema missing ${personnelMissing.join(",")}`, { operation: "describe" });
      const junction = await auth.call("describe", { elementType: "VEMSAssignmentCrew" });
      const junctionRequired = ["assignment_ref", "personnel_ref", "vems_assignment_crew_id", "vems_external_key", "vems_assignment_id", "vems_staff_id", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "assigned_user_id"];
      const junctionNames = new Set(junction.fields?.map((field) => field.name));
      const junctionMissing = junctionRequired.filter((name) => !junctionNames.has(name));
      if (junctionMissing.length) throw new VtigerError("VTIGER_SCHEMA_MISMATCH", `VEMSAssignmentCrew schema missing ${junctionMissing.join(",")}`, { operation: "describe" });
      const stockSchemas = {
        VEMSStockItems: ["vems_stock_item_id", "vems_external_key", "vems_name", "vems_category", "vems_unit_of_measure", "vems_item_type", "vems_active_status", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "vems_stock_item_no", "assigned_user_id"],
        VEMSVehicleStock: ["vems_vehicle_stock_id", "vems_external_key", "vems_vehicle_id", "vems_stock_item_id", "vehicle_ref", "stock_item_ref", "vems_quantity_on_hand", "vems_minimum_quantity", "vems_target_quantity", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "vems_vehicle_stock_no", "assigned_user_id"],
        VEMSStockUsage: ["vems_stock_usage_id", "vems_external_key", "vems_intervention_id", "vems_incident_id", "vems_stock_item_id", "stock_item_ref", "vems_quantity_used", "vems_usage_source", "vems_performed_at_utc", "vems_intervention_type", "vems_correlation_id", "vems_created_at_utc", "vems_stock_usage_no", "assigned_user_id"]
      };
      for (const [moduleName, requiredFields] of Object.entries(stockSchemas)) {
        const metadata = await auth.call("describe", { elementType: moduleName });
        const available = new Set(metadata.fields?.map((field) => field.name));
        const missingFields = requiredFields.filter((name) => !available.has(name));
        if (missingFields.length) throw new VtigerError("VTIGER_SCHEMA_MISMATCH", `${moduleName} schema missing ${missingFields.join(",")}`, { operation: "describe" });
      }
      return { reachable: true, authenticated: true, schemaReady: true, vtigerVersion: undefined };
    },
    async query(query) { return auth.call("query", { query }); },
    async create(element, elementType = "HelpDesk") { return auth.call("create", { elementType, element: JSON.stringify(element) }, "POST"); },
    async retrieve(id, elementType = "HelpDesk") { return auth.call("retrieve", { id, elementType }); },
    async update(element, elementType = "HelpDesk") { return auth.call("update", { element: JSON.stringify(element), elementType }, "POST"); }
  };
}

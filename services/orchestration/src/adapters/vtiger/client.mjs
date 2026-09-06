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
      const assignmentRequired = ["vems_assignment_id", "vems_external_key", "vems_incident_id", "vems_incident_remote_id", "incident_ref", "vems_vehicle_id", "vems_crew_ids", "vems_status", "vems_vehicle_status", "vems_reason", "vems_correlation_id", "vems_last_correlation_id", "vems_created_at_utc", "vems_updated_at_utc", "assigned_user_id"];
      const assignmentNames = new Set(assignment.fields?.map((field) => field.name));
      const assignmentMissing = assignmentRequired.filter((name) => !assignmentNames.has(name));
      if (assignmentMissing.length) throw new VtigerError("VTIGER_SCHEMA_MISMATCH", `VEMSAssignments schema missing ${assignmentMissing.join(",")}`, { operation: "describe" });
      return { reachable: true, authenticated: true, schemaReady: true, vtigerVersion: undefined };
    },
    async query(query) { return auth.call("query", { query }); },
    async create(element, elementType = "HelpDesk") { return auth.call("create", { elementType, element: JSON.stringify(element) }, "POST"); },
    async retrieve(id, elementType = "HelpDesk") { return auth.call("retrieve", { id, elementType }); },
    async update(element, elementType = "HelpDesk") { return auth.call("update", { element: JSON.stringify(element), elementType }, "POST"); }
  };
}

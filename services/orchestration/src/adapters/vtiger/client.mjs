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
      return { reachable: true, authenticated: true, schemaReady: true, vtigerVersion: undefined };
    },
    async query(query) { return auth.call("query", { query }); },
    async create(element) { return auth.call("create", { elementType: "HelpDesk", element: JSON.stringify(element) }, "POST"); },
    async retrieve(id) { return auth.call("retrieve", { id }); },
    async update(element) { return auth.call("update", { element: JSON.stringify(element) }, "POST"); }
  };
}

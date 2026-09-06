import { PROVISIONAL_IDENTITY_LABEL, PROVISIONAL_IDENTITY_NOTE } from "../provisional-identity.mjs";

const DEFAULT_TIMEOUT_MS = 5000;
// OpenEMR Standard API tokens need the API scope plus resource CRUD scopes.
// Deployments may narrow/override this with OPENEMR_SCOPE.
const DEFAULT_STANDARD_API_SCOPE = "openid api:oemr user/patient.crus user/encounter.crus user/vital.crus user/soap_note.crus";

function createDownstreamError(target, method, status, bodyText = "") {
  const messageSuffix = bodyText ? `: ${bodyText.slice(0, 300)}` : "";
  const error = new Error(`${target}.${method} failed with HTTP ${status}${messageSuffix}`);
  error.code = status >= 500 ? "DOWNSTREAM_UNAVAILABLE" : "DOWNSTREAM_HTTP_ERROR";
  error.classification = status === 401 || status === 403
    ? "DOWNSTREAM_AUTH_FAILED"
    : status >= 500
      ? "DOWNSTREAM_UNAVAILABLE"
      : "DOWNSTREAM_HTTP_ERROR";
  error.status = status;
  return error;
}

function createTimeoutError(target, method, timeoutMs) {
  const error = new Error(`${target}.${method} timed out after ${timeoutMs}ms`);
  error.code = "DOWNSTREAM_TIMEOUT";
  error.classification = "DOWNSTREAM_TIMEOUT";
  return error;
}

function parseJsonBody(text, target, method) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(`${target}.${method} returned invalid JSON`);
    error.code = "DOWNSTREAM_INVALID_RESPONSE";
    error.classification = "DOWNSTREAM_INVALID_RESPONSE";
    throw error;
  }
}

async function requestJson(url, options, target, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw createDownstreamError(target, method, response.status, text);
    return parseJsonBody(text, target, method);
  } catch (error) {
    if (error?.name === "AbortError") throw createTimeoutError(target, method, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function requiredEnv(name, env = process.env) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalRoutePath(env, key, fallback) {
  const custom = env[key];
  if (!custom) return fallback;
  return custom.startsWith("/") ? custom : `/${custom}`;
}

export function createOpenEmrTransportFromEnv(env = process.env) {
  const baseUrl = env.OPENEMR_BASE_URL;
  if (!baseUrl) return undefined;

  // Native OpenEMR 8.x standard API mode. The domain adapter remains stable;
  // this transport translates its operations to OpenEMR's supported routes.
  if (env.OPENEMR_API_STYLE === "standard") {
    const timeoutMs = Number(env.OPENEMR_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    const site = env.OPENEMR_SITE ?? "default";
    const apiBase = `${baseUrl.replace(/\/$/, "")}/apis/${site}/api`;
    let tokenPromise;
    const accessToken = async () => {
      if (env.OPENEMR_API_TOKEN) return env.OPENEMR_API_TOKEN;
      if (!env.OPENEMR_TOKEN_URL || !env.OPENEMR_CLIENT_ID || !env.OPENEMR_CLIENT_SECRET) {
        const error = new Error("OpenEMR OAuth configuration is incomplete"); error.code = "DOWNSTREAM_AUTH_FAILED"; error.classification = error.code; throw error;
      }
      const form = {
        grant_type: env.OPENEMR_GRANT_TYPE ?? (env.OPENEMR_USERNAME && env.OPENEMR_PASSWORD ? "password" : "client_credentials"),
        client_id: env.OPENEMR_CLIENT_ID,
        client_secret: env.OPENEMR_CLIENT_SECRET,
        scope: env.OPENEMR_SCOPE ?? DEFAULT_STANDARD_API_SCOPE
      };
      if (form.grant_type === "password") {
        form.username = env.OPENEMR_USERNAME;
        form.password = env.OPENEMR_PASSWORD;
        form.user_role = env.OPENEMR_USER_ROLE ?? "users";
      }
      tokenPromise ??= requestJson(env.OPENEMR_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString()
      }, "openemr", "oauth", timeoutMs);
      let response;
      try { response = await tokenPromise; } catch (error) { tokenPromise = undefined; throw error; }
      if (!response?.access_token) { tokenPromise = undefined; const error = new Error("OpenEMR OAuth response did not include an access token"); error.code = "DOWNSTREAM_AUTH_FAILED"; error.classification = error.code; throw error; }
      return response.access_token;
    };
    const call = async (method, path, payload, httpMethod = "POST") => {
      const token = await accessToken();
      const headers = { accept: "application/json", authorization: `Bearer ${token}` };
      const options = { method: httpMethod, headers };
      if (httpMethod !== "GET") { headers["content-type"] = "application/json"; options.body = JSON.stringify(payload ?? {}); }
      return requestJson(`${apiBase}${path}`, options, "openemr", method, timeoutMs);
    };
    const standardData = (response) => response?.data ?? response;
    const patientId = (data) => data?.uuid ?? data?.id ?? data?.pid ?? null;
    return async ({ method, payload }) => {
      const patient = encodeURIComponent(payload?.patient_id ?? "");
      const encounter = encodeURIComponent(payload?.encounter_id ?? "");
      if (method === "searchPatient") {
        const query = new URLSearchParams(); if (payload?.first_name) query.set("fname", payload.first_name); if (payload?.last_name) query.set("lname", payload.last_name); if (payload?.dob) query.set("DOB", payload.dob); if (payload?.phone) query.set("phone", payload.phone);
        const response = await call(method, `/patient?${query}`, undefined, "GET");
        const candidates = Array.isArray(response?.data) ? response.data : [];
        return { match_status: candidates.length === 1 ? "matched" : candidates.length > 1 ? "ambiguous" : "not_found", match_confidence: candidates.length === 1 ? 1 : 0, patient_id: candidates.length === 1 ? patientId(candidates[0]) : null, candidates };
      }
      if (method === "createPatient") {
        const response = await call(method, "/patient", { fname: payload.first_name, lname: payload.last_name, DOB: payload.dob, sex: payload.sex, phone_contact: payload.phone, ...(payload.provisional_identity ? { genericname1: PROVISIONAL_IDENTITY_LABEL, genericval1: PROVISIONAL_IDENTITY_NOTE } : {}) });
        const data = standardData(response); return { patient_id: patientId(data), display_name: [data?.fname, data?.lname].filter(Boolean).join(" ") };
      }
      if (method === "createEncounter") {
        const response = await call(method, `/patient/${patient}/encounter`, { date: payload.care_started_at, reason: payload.presenting_complaint ?? "EMS encounter", pc_catid: "5", class_code: "AMB", external_id: payload.patient_case_id ?? payload.incident_id });
        const data = standardData(response); return { encounter_id: data?.euuid ?? data?.uuid ?? data?.id ?? data?.eid ?? null, status: "Open" };
      }
      if (method === "createObservation") {
        const vitals = payload.vital_signs ?? {};
        const response = await call(method, `/patient/${patient}/encounter/${encounter}/vital`, { ...vitals, note: payload.notes ?? undefined });
        const data = standardData(response); return { observation_id: data?.uuid ?? data?.id ?? data?.vid ?? null, encounter_id: payload.encounter_id, status: "created" };
      }
      if (method === "createIntervention") {
        const response = await call(method, `/patient/${patient}/encounter/${encounter}/soap_note`, { subjective: `${payload.type ?? "Intervention"}: ${payload.name ?? ""}`.trim(), objective: payload.response ?? "", assessment: payload.stock_item_id ? `V-EMS stock item ${payload.stock_item_id}` : "", plan: [payload.dose, payload.route].filter(Boolean).join(" via ") || "EMS treatment" });
        return { intervention_id: response?.sid ?? response?.id ?? null, encounter_id: payload.encounter_id, status: "created" };
      }
      if (method === "getInterventions") {
        const response = await call(method, `/patient/${patient}/encounter/${encounter}/soap_note`, undefined, "GET");
        const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
        return rows.map((row) => ({ intervention_id: row.sid ?? row.id ?? null, encounter_id: payload.encounter_id, status: "created", performed_at: row.date ?? null, type: "soap_note", name: row.title ?? null }));
      }
      if (method === "createHandover") {
        const response = await call(method, `/patient/${patient}/encounter/${encounter}/soap_note`, { subjective: `Handover to ${payload.destination_facility ?? ""}`.trim(), objective: payload.receiving_clinician ? `Receiving clinician: ${payload.receiving_clinician}` : "", assessment: payload.disposition ?? "", plan: payload.notes ?? payload.handover_status ?? "" });
        return { handover_id: response?.sid ?? response?.id ?? null, encounter_id: payload.encounter_id, handover_time: payload.handover_time, destination_facility: payload.destination_facility, receiving_clinician: payload.receiving_clinician, disposition: payload.disposition, handover_status: payload.handover_status, notes: payload.notes };
      }
      if (method === "getHandover") {
        const response = await call(method, `/patient/${patient}/encounter/${encounter}/soap_note`, undefined, "GET");
        return Array.isArray(response?.data) ? response.data[response.data.length - 1] ?? null : response ?? null;
      }
      throw new Error(`OpenEMR native route not configured for ${method}`);
    };
  }

  const token = env.OPENEMR_API_TOKEN;
  const timeoutMs = Number(env.OPENEMR_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const requireAuth = env.OPENEMR_AUTH_REQUIRED !== "false";
  if (requireAuth && !token) {
    throw new Error("OPENEMR_API_TOKEN is required when OPENEMR_BASE_URL is configured");
  }

  const routes = {
    searchPatient: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_SEARCH_PATIENT", "/api/v1/patients/search") },
    createPatient: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_CREATE_PATIENT", "/api/v1/patients") },
    createEncounter: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_CREATE_ENCOUNTER", "/api/v1/encounters") },
    createObservation: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_CREATE_OBSERVATION", "/api/v1/observations") },
    createIntervention: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_CREATE_INTERVENTION", "/api/v1/interventions") },
    getInterventions: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_GET_INTERVENTIONS", "/api/v1/interventions/query") },
    createHandover: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_CREATE_HANDOVER", "/api/v1/handover") },
    getHandover: { method: "POST", path: optionalRoutePath(env, "OPENEMR_ROUTE_GET_HANDOVER", "/api/v1/handover/query") }
  };

  return async ({ method, payload }) => {
    const route = routes[method];
    if (!route) throw new Error(`OpenEMR route not configured for method ${method}`);
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;

    return requestJson(`${baseUrl}${route.path}`, {
      method: route.method,
      headers,
      body: JSON.stringify(payload)
    }, "openemr", method, timeoutMs);
  };
}

export function createVtigerTransportFromEnv(env = process.env) {
  if (!env.VTIGER_BASE_URL) return undefined;
  const token = env.VTIGER_API_TOKEN;
  if (!env.VTIGER_USERNAME || !env.VTIGER_ACCESS_KEY) {
    if (token) {
      const timeoutMs = Number(env.VTIGER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
      const syncPathPrefix = optionalRoutePath(env, "VTIGER_SYNC_ROUTE_PREFIX", "/api/v1/sync");
      return async ({ method, payload }) => requestJson(`${env.VTIGER_BASE_URL}${syncPathPrefix}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      }, "vtiger", method, timeoutMs);
    }
    throw new Error("VTIGER_API_TOKEN is required for the legacy Vtiger transport configuration; set VTIGER_USERNAME and VTIGER_ACCESS_KEY for Web Services authentication");
  }
  // The real transport is intentionally lazy: authentication happens on the
  // first worker call and the session remains in memory only.
  let clientPromise;
  const getClient = () => clientPromise ??= import("./vtiger/client.mjs").then(({ createVtigerWebserviceClient }) => createVtigerWebserviceClient(env));
  return async ({ method, payload }) => {
    const client = await getClient();
    const externalKey = payload.vems_external_key;
    const module = payload.elementType ?? (method === "createPersonnelMirror" || method === "updatePersonnelMirror" ? "VEMSPersonnel" : method === "createAssignmentCrewMirror" || method === "updateAssignmentCrewMirror" ? "VEMSAssignmentCrew" : method === "createStockItemMirror" || method === "updateStockItemMirror" ? "VEMSStockItems" : method === "createVehicleStockMirror" || method === "updateVehicleStockMirror" ? "VEMSVehicleStock" : method === "recordStockUsageMirror" ? "VEMSStockUsage" : method.includes("Assignment") ? "VEMSAssignments" : "HelpDesk");
    const esc = (value) => String(value ?? "").replaceAll("'", "''");
    const numberField = module === "VEMSAssignments" ? "vems_assignment_no" : module === "VEMSVehicles" ? "vems_vehicle_no" : module === "VEMSPersonnel" ? "vems_personnel_no" : module === "VEMSAssignmentCrew" ? "vems_assignment_crew_no" : module === "VEMSStockItems" ? "vems_stock_item_no" : module === "VEMSVehicleStock" ? "vems_vehicle_stock_no" : module === "VEMSStockUsage" ? "vems_stock_usage_no" : "ticket_no";
    const query = `select id,${numberField},vems_external_key from ${module} where vems_external_key='${esc(externalKey)}';`;
    if (module === "VEMSAssignments" && !payload.vems_incident_remote_id) {
      const error = new Error("Vtiger incident linkage is pending"); error.code = "VTIGER_DEPENDENCY_PENDING"; error.classification = error.code; error.retryable = true; throw error;
    }
    if (module === "VEMSAssignments" && method === "createAssignmentMirror" && payload.incident_remote_id) payload.vems_incident_remote_id = payload.incident_remote_id;
    if (method === "createIncidentMirror") {
      const matches = await client.query(query);
      if (matches.length > 1) {
        const error = new Error("Multiple Vtiger records match the incident external key"); error.code = "VTIGER_DUPLICATE_CONFLICT"; error.classification = error.code; throw error;
      }
      if (matches.length === 1) return { remote_id: matches[0].id, remote_number: matches[0].ticket_no, external_key: externalKey, outcome: "existing" };
      const element = { ...payload }; delete element.elementType; delete element.incident_id; delete element.status;
      const created = await client.create(element);
      if (!created?.id) { const error = new Error("Vtiger create response did not include a record ID"); error.code = "VTIGER_PROTOCOL_ERROR"; error.classification = error.code; throw error; }
      return { remote_id: created.id, remote_number: created.ticket_no ?? null, external_key: externalKey, outcome: "created" };
    }
    if (method === "createAssignmentMirror") {
      const matches = await client.query(query);
      if (matches.length > 1) { const error = new Error("Multiple Vtiger assignment records match the external key"); error.code = "VTIGER_DUPLICATE_CONFLICT"; error.classification = error.code; throw error; }
      const assignmentRemoteId = matches.length === 1 ? matches[0].id : null;
      const element = { ...payload }; delete element.elementType; delete element.assignment_id; delete element.incident_id; delete element.status; delete element.personnel_links;
      const created = assignmentRemoteId ? null : await client.create(element, "VEMSAssignments");
      const remoteId = assignmentRemoteId ?? created?.id;
      if (!remoteId) { const error = new Error("Vtiger assignment create response did not include a record ID"); error.code = "VTIGER_PROTOCOL_ERROR"; error.classification = error.code; throw error; }
      const junctions = [];
      for (const member of payload.personnel_links ?? []) {
        const key = member.external_key;
        const found = await client.query(`select id,vems_assignment_crew_no from VEMSAssignmentCrew where vems_external_key='${esc(key)}';`);
        if (found.length > 1) { const error = new Error("Multiple Vtiger assignment crew records match the external key"); error.code = "VTIGER_DUPLICATE_CONFLICT"; error.classification = error.code; throw error; }
        if (found.length === 1) { junctions.push({ remote_id: found[0].id, remote_number: found[0].vems_assignment_crew_no ?? null, external_key: key, staff_id: member.staff_id }); continue; }
        const relation = { vems_assignment_crew_id: member.assignment_crew_id, vems_external_key: key, vems_assignment_id: payload.vems_assignment_id, vems_staff_id: member.staff_id, assignment_ref: remoteId, personnel_ref: member.personnel_remote_id, vems_correlation_id: payload.vems_correlation_id, vems_last_correlation_id: payload.vems_last_correlation_id, vems_created_at_utc: payload.vems_created_at_utc, vems_updated_at_utc: payload.vems_updated_at_utc, assigned_user_id: payload.assigned_user_id };
        const jr = await client.create(relation, "VEMSAssignmentCrew");
        if (!jr?.id) { const error = new Error("Vtiger assignment crew create response did not include a record ID"); error.code = "VTIGER_PROTOCOL_ERROR"; error.classification = error.code; throw error; }
        junctions.push({ remote_id: jr.id, remote_number: jr.vems_assignment_crew_no ?? null, external_key: key, staff_id: member.staff_id });
      }
      return { remote_id: remoteId, remote_number: created?.vems_assignment_no ?? matches[0]?.vems_assignment_no ?? null, external_key: externalKey, incident_remote_id: payload.vems_incident_remote_id, junctions, outcome: assignmentRemoteId ? "existing" : "created" };
    }
    if (method === "createVehicleMirror") {
      const matches = await client.query(query);
      if (matches.length > 1) { const error = new Error("Multiple Vtiger vehicle records match the external key"); error.code = "VTIGER_DUPLICATE_CONFLICT"; error.classification = error.code; throw error; }
      if (matches.length === 1) return { remote_id: matches[0].id, remote_number: matches[0].vems_vehicle_no ?? null, external_key: externalKey, outcome: "existing" };
      const element = { ...payload }; delete element.elementType; delete element.vehicle_id;
      const created = await client.create(element, "VEMSVehicles");
      if (!created?.id) { const error = new Error("Vtiger vehicle create response did not include a record ID"); error.code = "VTIGER_PROTOCOL_ERROR"; error.classification = error.code; throw error; }
      return { remote_id: created.id, remote_number: created.vems_vehicle_no ?? null, external_key: externalKey, outcome: "created" };
    }
    if (method === "createPersonnelMirror") {
      const matches = await client.query(query);
      if (matches.length > 1) { const error = new Error("Multiple Vtiger personnel records match the external key"); error.code = "VTIGER_DUPLICATE_CONFLICT"; error.classification = error.code; throw error; }
      if (matches.length === 1) return { remote_id: matches[0].id, remote_number: matches[0].vems_personnel_no ?? null, external_key: externalKey, outcome: "existing" };
      const element = { ...payload }; delete element.elementType; delete element.staff_id;
      const created = await client.create(element, "VEMSPersonnel");
      if (!created?.id) { const error = new Error("Vtiger personnel create response did not include a record ID"); error.code = "VTIGER_PROTOCOL_ERROR"; error.classification = error.code; throw error; }
      return { remote_id: created.id, remote_number: created.vems_personnel_no ?? null, external_key: externalKey, outcome: "created" };
    }
    if (method === "createStockItemMirror" || method === "recordStockUsageMirror" || method === "createVehicleStockMirror") {
      if (method === "createVehicleStockMirror") {
        const vehicleLink = payload.vehicle_remote_id;
        const itemLink = payload.stock_item_remote_id;
        if (!vehicleLink || !itemLink) { const error = new Error("Vtiger vehicle stock dependencies are pending"); error.code = "VTIGER_DEPENDENCY_PENDING"; error.classification = error.code; error.retryable = true; throw error; }
      }
      const matches = await client.query(query);
      if (matches.length > 1) { const error = new Error(`Multiple Vtiger ${module} records match the external key`); error.code = "VTIGER_DUPLICATE_CONFLICT"; error.classification = error.code; throw error; }
      if (matches.length === 1) return { remote_id: matches[0].id, remote_number: matches[0][numberField] ?? null, external_key: externalKey, outcome: "existing" };
      const element = { ...payload }; delete element.elementType; delete element.stock_item_id; delete element.vehicle_stock_id; delete element.stock_usage_id; delete element.vehicle_remote_id; delete element.stock_item_remote_id; delete element.quantity_used; delete element.usage_source; delete element.performed_at; delete element.intervention_type; delete element.intervention_name;
      if (!element.assigned_user_id && env.VTIGER_ASSIGNED_USER_ID) element.assigned_user_id = env.VTIGER_ASSIGNED_USER_ID;
      if (!element.assigned_user_id) { const error = new Error(`Vtiger ${module} create requires VTIGER_ASSIGNED_USER_ID`); error.code = "VTIGER_CONFIG_MISSING"; error.classification = "VTIGER_AUTH_FAILED"; throw error; }
      const created = await client.create(element, module);
      if (!created?.id) { const error = new Error(`Vtiger ${module} create response did not include a record ID`); error.code = "VTIGER_PROTOCOL_ERROR"; error.classification = error.code; throw error; }
      return { remote_id: created.id, remote_number: created[numberField] ?? null, external_key: externalKey, outcome: "created" };
    }
    if (method === "createAssignmentCrewMirror") {
      const matches = await client.query(query);
      if (matches.length > 1) { const error = new Error("Multiple Vtiger assignment crew records match the external key"); error.code = "VTIGER_DUPLICATE_CONFLICT"; error.classification = error.code; throw error; }
      if (matches.length === 1) return { remote_id: matches[0].id, remote_number: matches[0].vems_assignment_crew_no ?? null, external_key: externalKey, outcome: "existing" };
      const element = { ...payload }; delete element.elementType;
      const created = await client.create(element, "VEMSAssignmentCrew");
      if (!created?.id) { const error = new Error("Vtiger assignment crew create response did not include a record ID"); error.code = "VTIGER_PROTOCOL_ERROR"; error.classification = error.code; throw error; }
      return { remote_id: created.id, remote_number: created.vems_assignment_crew_no ?? null, external_key: externalKey, outcome: "created" };
    }
    if (method === "updateVehicleMirror") {
      const remoteId = payload.id;
      if (!remoteId) { const error = new Error("Vtiger vehicle update requires a remote record ID"); error.code = "VTIGER_REMOTE_NOT_FOUND"; error.classification = error.code; throw error; }
      const current = await client.retrieve(remoteId, "VEMSVehicles");
      const merged = { ...current, ...payload, id: remoteId }; delete merged.elementType; delete merged.vehicle_id;
      const updated = await client.update(merged, "VEMSVehicles");
      return { remote_id: updated?.id ?? remoteId, remote_number: updated?.vems_vehicle_no ?? current.vems_vehicle_no ?? null, external_key: externalKey, outcome: "updated" };
    }
    if (method === "updatePersonnelMirror") {
      const remoteId = payload.id;
      if (!remoteId) { const error = new Error("Vtiger personnel update requires a remote record ID"); error.code = "VTIGER_REMOTE_NOT_FOUND"; error.classification = error.code; throw error; }
      const current = await client.retrieve(remoteId, "VEMSPersonnel");
      const merged = { ...current, ...payload, id: remoteId }; delete merged.elementType; delete merged.staff_id;
      const updated = await client.update(merged, "VEMSPersonnel");
      return { remote_id: updated?.id ?? remoteId, remote_number: updated?.vems_personnel_no ?? current.vems_personnel_no ?? null, external_key: externalKey, outcome: "updated" };
    }
    if (method === "updateStockItemMirror" || method === "updateVehicleStockMirror") {
      const remoteId = payload.id;
      if (!remoteId) { const error = new Error("Vtiger stock update requires a remote record ID"); error.code = "VTIGER_REMOTE_NOT_FOUND"; error.classification = error.code; throw error; }
      const current = await client.retrieve(remoteId, module);
      const merged = { ...current, ...payload, id: remoteId }; delete merged.elementType; delete merged.stock_item_id; delete merged.vehicle_stock_id; delete merged.vehicle_remote_id; delete merged.stock_item_remote_id;
      const updated = await client.update(merged, module);
      return { remote_id: updated?.id ?? remoteId, remote_number: updated?.[numberField] ?? current[numberField] ?? null, external_key: externalKey, outcome: "updated" };
    }
    if (method === "updateAssignmentMirror") {
      const remoteId = payload.id;
      if (!remoteId) { const error = new Error("Vtiger assignment update requires a remote record ID"); error.code = "VTIGER_REMOTE_NOT_FOUND"; error.classification = error.code; throw error; }
      const current = await client.retrieve(remoteId, "VEMSAssignments");
      const merged = { ...current, ...payload, id: remoteId }; delete merged.elementType; delete merged.assignment_id; delete merged.incident_id; delete merged.status;
      const updated = await client.update(merged, "VEMSAssignments");
      return { remote_id: updated?.id ?? remoteId, remote_number: updated?.vems_assignment_no ?? current.vems_assignment_no ?? null, external_key: externalKey, incident_remote_id: payload.vems_incident_remote_id, outcome: "updated" };
    }
    if (method === "updateAssignmentCrewMirror") {
      const remoteId = payload.id;
      if (!remoteId) { const error = new Error("Vtiger assignment crew update requires a remote record ID"); error.code = "VTIGER_REMOTE_NOT_FOUND"; error.classification = error.code; throw error; }
      const current = await client.retrieve(remoteId, "VEMSAssignmentCrew");
      const merged = { ...current, ...payload, id: remoteId }; delete merged.elementType;
      const updated = await client.update(merged, "VEMSAssignmentCrew");
      return { remote_id: updated?.id ?? remoteId, remote_number: updated?.vems_assignment_crew_no ?? current.vems_assignment_crew_no ?? null, external_key: externalKey, outcome: "updated" };
    }
    if (method === "updateIncidentMirror") {
      const remoteId = payload.id;
      if (!remoteId) { const error = new Error("Vtiger update requires a remote record ID"); error.code = "VTIGER_REMOTE_NOT_FOUND"; error.classification = error.code; throw error; }
      const current = await client.retrieve(remoteId);
      const updateElement = { ...current, ...payload, id: remoteId };
      delete updateElement.elementType;
      delete updateElement.incident_id;
      delete updateElement.status;
      const updated = await client.update(updateElement);
      return { remote_id: updated?.id ?? remoteId, remote_number: updated?.ticket_no ?? current.ticket_no ?? null, external_key: externalKey, outcome: "updated" };
    }
    throw new Error(`Unsupported Vtiger operation ${method}`);
  };
}

export { requiredEnv };

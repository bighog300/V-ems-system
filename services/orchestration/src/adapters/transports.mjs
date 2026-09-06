const DEFAULT_TIMEOUT_MS = 5000;

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
    const module = payload.elementType ?? (method === "createPersonnelMirror" || method === "updatePersonnelMirror" ? "VEMSPersonnel" : method === "createAssignmentCrewMirror" ? "VEMSAssignmentCrew" : method.includes("Assignment") ? "VEMSAssignments" : "HelpDesk");
    const esc = (value) => String(value ?? "").replaceAll("'", "''");
    const numberField = module === "VEMSAssignments" ? "vems_assignment_no" : module === "VEMSVehicles" ? "vems_vehicle_no" : module === "VEMSPersonnel" ? "vems_personnel_no" : module === "VEMSAssignmentCrew" ? "vems_assignment_crew_no" : "ticket_no";
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

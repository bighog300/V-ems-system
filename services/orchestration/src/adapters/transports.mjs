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
  const baseUrl = env.VTIGER_BASE_URL;
  if (!baseUrl) return undefined;

  const token = env.VTIGER_API_TOKEN;
  const timeoutMs = Number(env.VTIGER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const syncPathPrefix = optionalRoutePath(env, "VTIGER_SYNC_ROUTE_PREFIX", "/api/v1/sync");
  const requireAuth = env.VTIGER_AUTH_REQUIRED !== "false";
  if (requireAuth && !token) {
    throw new Error("VTIGER_API_TOKEN is required when VTIGER_BASE_URL is configured");
  }

  return async ({ method, payload }) => {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    return requestJson(`${baseUrl}${syncPathPrefix}/${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, "vtiger", method, timeoutMs);
  };
}

export { requiredEnv };

function ensureOk(response, target, method) {
  if (response.ok) return;
  const error = new Error(`${target}.${method} failed with HTTP ${response.status}`);
  error.code = "DOWNSTREAM_HTTP_ERROR";
  error.classification = "DOWNSTREAM_HTTP_ERROR";
  throw error;
}

async function requestJson(url, options, target, method) {
  const response = await fetch(url, options);
  ensureOk(response, target, method);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export function createOpenEmrTransportFromEnv(env = process.env) {
  const baseUrl = env.OPENEMR_BASE_URL;
  const token = env.OPENEMR_API_TOKEN;
  if (!baseUrl) return undefined;

  const routes = {
    searchPatient: { method: "POST", path: "/api/v1/patients/search" },
    createPatient: { method: "POST", path: "/api/v1/patients" },
    createEncounter: { method: "POST", path: "/api/v1/encounters" },
    createObservation: { method: "POST", path: "/api/v1/observations" },
    createIntervention: { method: "POST", path: "/api/v1/interventions" },
    getInterventions: { method: "POST", path: "/api/v1/interventions/query" },
    createHandover: { method: "POST", path: "/api/v1/handover" },
    getHandover: { method: "POST", path: "/api/v1/handover/query" }
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
    }, "openemr", method);
  };
}

export function createVtigerTransportFromEnv(env = process.env) {
  const baseUrl = env.VTIGER_BASE_URL;
  const token = env.VTIGER_API_TOKEN;
  if (!baseUrl) return undefined;

  return async ({ method, payload }) => {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    return requestJson(`${baseUrl}/api/v1/sync/${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }, "vtiger", method);
  };
}

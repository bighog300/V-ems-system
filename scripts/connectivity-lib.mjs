const DEFAULT_TIMEOUT_MS = 4000;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function splitCsv(value, fallback = []) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function createActionableError(message, details = {}) {
  const error = new Error(message);
  error.classification = details.classification ?? "CONNECTIVITY_VALIDATION_FAILED";
  error.code = details.code ?? error.classification;
  error.details = details;
  return error;
}

function resolveTimeoutMs(value, fallback = DEFAULT_TIMEOUT_MS) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createActionableError(`Request timed out after ${timeoutMs}ms for ${url}`, {
        classification: "DOWNSTREAM_TIMEOUT",
        timeout_ms: timeoutMs,
        url
      });
    }
    throw createActionableError(`Request failed for ${url}: ${error?.message ?? "Unknown error"}`, {
      classification: "DOWNSTREAM_UNAVAILABLE",
      url,
      reason: error?.message
    });
  } finally {
    clearTimeout(timer);
  }
}

function joinUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

function assertRequired(value, envName, hint) {
  if (!value || String(value).trim().length === 0) {
    throw createActionableError(`Missing required environment value: ${envName}. ${hint}`.trim(), {
      classification: "CONFIGURATION_ERROR",
      env_name: envName
    });
  }
}

export async function validateVtigerConnectivity(env = process.env, options = {}) {
  const timeoutMs = resolveTimeoutMs(env.VALIDATION_TIMEOUT_MS);
  const logger = options.logger ?? console;
  const baseUrl = env.VTIGER_BASE_URL;
  assertRequired(baseUrl, "VTIGER_BASE_URL", "Set this to the Vtiger base URL before running connectivity checks.");

  const pingPath = env.VTIGER_CONNECTIVITY_PING_PATH ?? "/";
  const pingUrl = joinUrl(baseUrl, pingPath);
  const pingResponse = await fetchWithTimeout(pingUrl, { method: "GET" }, timeoutMs);
  if (!pingResponse.ok) {
    throw createActionableError(`Vtiger ping failed with status ${pingResponse.status} at ${pingUrl}`, {
      classification: "DOWNSTREAM_HTTP_ERROR",
      status: pingResponse.status,
      url: pingUrl,
      hint: "Confirm upstream URL and any network ACL/firewall rules for this environment."
    });
  }

  const authCheckEnabled = parseBoolean(env.VTIGER_CONNECTIVITY_CHECK_AUTH, false);
  if (!authCheckEnabled) {
    logger.info(`[connectivity] vtiger ping ok (${pingResponse.status}) at ${pingUrl}; auth check skipped`);
    return {
      target: "vtiger",
      ping: { ok: true, status: pingResponse.status, url: pingUrl },
      auth: { checked: false }
    };
  }

  assertRequired(env.VTIGER_USERNAME, "VTIGER_USERNAME", "Set an integration username for auth challenge validation.");
  const challengePath = env.VTIGER_CONNECTIVITY_CHALLENGE_PATH
    ?? `/webservice.php?operation=getchallenge&username=${encodeURIComponent(env.VTIGER_USERNAME)}`;
  const challengeUrl = joinUrl(baseUrl, challengePath);
  const authResponse = await fetchWithTimeout(challengeUrl, { method: "GET" }, timeoutMs);

  let body;
  try {
    body = await authResponse.json();
  } catch {
    body = null;
  }

  if (!authResponse.ok) {
    throw createActionableError(`Vtiger auth challenge failed with status ${authResponse.status} at ${challengeUrl}`, {
      classification: "DOWNSTREAM_HTTP_ERROR",
      status: authResponse.status,
      url: challengeUrl,
      hint: "Verify VTIGER_USERNAME and that webservice challenge endpoint is reachable."
    });
  }

  if (!body?.success || !body?.result?.token) {
    throw createActionableError("Vtiger challenge response missing expected token payload", {
      classification: "DOWNSTREAM_PROTOCOL_ERROR",
      url: challengeUrl,
      hint: "Ensure Vtiger webservice API is enabled and integration user is active."
    });
  }

  logger.info(`[connectivity] vtiger auth challenge ok at ${challengeUrl}`);
  return {
    target: "vtiger",
    ping: { ok: true, status: pingResponse.status, url: pingUrl },
    auth: { checked: true, ok: true, url: challengeUrl }
  };
}

export async function validateOpenEmrConnectivity(env = process.env, options = {}) {
  const timeoutMs = resolveTimeoutMs(env.VALIDATION_TIMEOUT_MS);
  const logger = options.logger ?? console;

  const baseUrl = env.OPENEMR_BASE_URL;
  assertRequired(baseUrl, "OPENEMR_BASE_URL", "Set this to the OpenEMR base URL before running connectivity checks.");

  const pingPath = env.OPENEMR_CONNECTIVITY_PING_PATH ?? "/";
  const pingUrl = joinUrl(baseUrl, pingPath);
  const pingResponse = await fetchWithTimeout(pingUrl, { method: "GET" }, timeoutMs);

  if (!pingResponse.ok) {
    throw createActionableError(`OpenEMR ping failed with status ${pingResponse.status} at ${pingUrl}`, {
      classification: "DOWNSTREAM_HTTP_ERROR",
      status: pingResponse.status,
      url: pingUrl,
      hint: "Confirm OPENEMR_BASE_URL and OPENEMR_CONNECTIVITY_PING_PATH for this environment."
    });
  }

  const authCheckEnabled = parseBoolean(env.OPENEMR_CONNECTIVITY_CHECK_AUTH, false);
  if (!authCheckEnabled) {
    logger.info(`[connectivity] openemr ping ok (${pingResponse.status}) at ${pingUrl}; auth check skipped`);
    return {
      target: "openemr",
      ping: { ok: true, status: pingResponse.status, url: pingUrl },
      auth: { checked: false }
    };
  }

  assertRequired(env.OPENEMR_TOKEN_URL, "OPENEMR_TOKEN_URL", "Set this to a valid OpenEMR OAuth token endpoint.");
  assertRequired(env.OPENEMR_CLIENT_ID, "OPENEMR_CLIENT_ID", "Set OpenEMR integration OAuth client id.");
  assertRequired(env.OPENEMR_CLIENT_SECRET, "OPENEMR_CLIENT_SECRET", "Set OpenEMR integration OAuth client secret.");

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.OPENEMR_CLIENT_ID,
    client_secret: env.OPENEMR_CLIENT_SECRET
  });

  const tokenResponse = await fetchWithTimeout(env.OPENEMR_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  }, timeoutMs);

  let tokenBody;
  try {
    tokenBody = await tokenResponse.json();
  } catch {
    tokenBody = null;
  }

  if (!tokenResponse.ok) {
    throw createActionableError(`OpenEMR token request failed with status ${tokenResponse.status} at ${env.OPENEMR_TOKEN_URL}`, {
      classification: "DOWNSTREAM_HTTP_ERROR",
      status: tokenResponse.status,
      url: env.OPENEMR_TOKEN_URL,
      hint: "Confirm OAuth client credentials and token URL for OpenEMR."
    });
  }

  if (!tokenBody?.access_token) {
    throw createActionableError("OpenEMR token response missing access_token", {
      classification: "DOWNSTREAM_PROTOCOL_ERROR",
      url: env.OPENEMR_TOKEN_URL,
      hint: "Ensure OpenEMR OAuth app supports client_credentials grant and returns JSON access_token."
    });
  }

  logger.info(`[connectivity] openemr auth token acquired from ${env.OPENEMR_TOKEN_URL}`);
  return {
    target: "openemr",
    ping: { ok: true, status: pingResponse.status, url: pingUrl },
    auth: { checked: true, ok: true, token_type: tokenBody.token_type ?? "bearer" }
  };
}

export async function runConfiguredConnectivityValidation(env = process.env, options = {}) {
  const logger = options.logger ?? console;
  const includeChecks = parseBoolean(env.SMOKE_INCLUDE_UPSTREAM_CONNECTIVITY, false)
    || parseBoolean(env.UPSTREAM_CONNECTIVITY_CHECKS_ENABLED, false);

  if (!includeChecks) {
    logger.info("[connectivity] upstream connectivity checks disabled by environment");
    return { skipped: true, results: [] };
  }

  const targets = splitCsv(env.UPSTREAM_CONNECTIVITY_TARGETS, ["vtiger", "openemr"]);
  const handlers = {
    vtiger: () => validateVtigerConnectivity(env, { logger }),
    openemr: () => validateOpenEmrConnectivity(env, { logger })
  };

  const results = [];
  for (const target of targets) {
    const validate = handlers[target];
    if (!validate) {
      throw createActionableError(`Unsupported connectivity target: ${target}`, {
        classification: "CONFIGURATION_ERROR",
        target,
        hint: "Set UPSTREAM_CONNECTIVITY_TARGETS to comma-separated values from: vtiger,openemr."
      });
    }
    logger.info(`[connectivity] validating target=${target}`);
    results.push(await validate());
  }

  return { skipped: false, results };
}

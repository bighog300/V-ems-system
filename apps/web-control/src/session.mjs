const SESSION_KEY = "vems.web.session";
const AUTH_MODE_DEV = "dev";
const AUTH_MODE_PRODUCTION = "production";

function readStoredSession() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(SESSION_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function persistSession(session) {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // no-op for non-browser test environments
  }
}

export function readSessionFromDom({ includeIncidentId = true } = {}) {
  const query = (selector) => {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  };
  const stored = readStoredSession();
  const apiBaseUrl = query("#apiBaseUrl")?.value?.trim().replace(/\/$/, "") || stored.apiBaseUrl || "";
  const authToken = query("#authToken")?.value?.trim() || stored.authToken || "";
  const actorId = query("#actorId")?.value?.trim() || stored.actorId || "";
  const actorRole = query("#actorRole")?.value?.trim() || stored.actorRole || "";
  const incidentId = includeIncidentId ? (query("#incidentId")?.value?.trim() || "") : undefined;
  const authMode = resolveAuthMode(window.location.search);
  const allowLegacyAuthHeaders = authMode === AUTH_MODE_DEV;

  const next = { apiBaseUrl, authToken, actorId, actorRole, authMode, allowLegacyAuthHeaders, ...(includeIncidentId ? { incidentId } : {}) };
  persistSession(next);
  return next;
}

function resolveAuthMode(search) {
  const params = new URLSearchParams(search);
  if (params.get("authMode") === AUTH_MODE_DEV) return AUTH_MODE_DEV;
  if (params.get("authMode") === AUTH_MODE_PRODUCTION) return AUTH_MODE_PRODUCTION;
  if (params.get("debug") === "1") return AUTH_MODE_DEV;
  return AUTH_MODE_PRODUCTION;
}

export function isProductionUiMode() {
  if (resolveAuthMode(window.location.search) === AUTH_MODE_DEV) return false;
  const host = window.location.hostname ?? "localhost";
  return host !== "localhost" && host !== "127.0.0.1";
}

export function applyProductionUiMode() {
  if (!isProductionUiMode()) return;
  document.querySelectorAll("[data-dev-only]").forEach((node) => {
    node.hidden = true;
  });
}

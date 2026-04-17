import { ApiError } from "./api-error.mjs";

export class UnauthorizedError extends ApiError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "UnauthorizedError";
  }
}

function mergeAbortSignals(signals = []) {
  const valid = signals.filter(Boolean);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  valid.forEach((signal) => signal.addEventListener("abort", onAbort, { once: true }));
  return controller.signal;
}

function buildApiError(status, body = {}, response = undefined) {
  const error = body?.error ?? {};
  const message = error.message ?? `Request failed: ${status}`;
  const details = {
    status,
    code: error.code,
    retryable: error.retryable,
    correlationId: error.correlation_id ?? response?.headers?.get("x-correlation-id") ?? undefined,
    requestId: response?.headers?.get("x-request-id") ?? undefined,
    details: error.details
  };
  if (status === 401 || status === 403) {
    return new UnauthorizedError(message, details);
  }
  return new ApiError(message, details);
}

export function buildRequestHeaders(config, headers = {}) {
  const authToken = config.authToken?.trim();
  const actorId = config.actorId?.trim();
  const actorRole = config.actorRole?.trim();

  return {
    "content-type": "application/json",
    ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    ...(!authToken && actorId ? { "x-actor-id": actorId } : {}),
    ...(!authToken && actorRole ? { "x-user-role": actorRole } : {}),
    ...headers
  };
}

export async function requestJson(fetchImpl, url, {
  method = "GET",
  payload,
  config = {},
  headers = {},
  timeoutMs = 10000,
  signal
} = {}) {
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), timeoutMs);
  const mergedSignal = mergeAbortSignals([signal, timeoutController.signal]);

  try {
    const response = await fetchImpl(url, {
      method,
      headers: buildRequestHeaders(config, headers),
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: mergedSignal
    });

    if (response.status === 404) return { notFound: true, data: null };
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw buildApiError(response.status, body, response);
    }

    return { notFound: false, data: body };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("Request timed out or was canceled.", { code: "REQUEST_ABORTED", retryable: true });
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

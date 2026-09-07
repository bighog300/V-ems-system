import { ApiError, ForbiddenError, UnauthorizedError } from "./apiError.ts";

export interface RequestConfig {
  authToken?: string;
}

export interface RequestOptions {
  method?: string;
  payload?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface JsonResult<T = unknown> {
  notFound: boolean;
  data: T | null;
}

function mergeAbortSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const valid = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  valid.forEach((signal) => signal.addEventListener("abort", onAbort, { once: true }));
  return controller.signal;
}

function buildApiError(status: number, body: any = {}, response?: Response): ApiError {
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
  if (status === 401) return new UnauthorizedError(message, details);
  if (status === 403) return new ForbiddenError(message, details);
  return new ApiError(message, details);
}

export function buildRequestHeaders(config: RequestConfig, headers: Record<string, string> = {}): Record<string, string> {
  const authToken = config.authToken?.trim();
  if (!authToken) {
    throw new UnauthorizedError("Authentication token is required.", {
      status: 401,
      code: "AUTH_TOKEN_REQUIRED",
      retryable: false
    });
  }

  return {
    "content-type": "application/json",
    authorization: `Bearer ${authToken}`,
    ...headers
  };
}

type FetchImpl = typeof fetch;

export async function requestJson<T = unknown>(
  fetchImpl: FetchImpl,
  url: string,
  { method = "GET", payload, config = {}, headers = {}, timeoutMs = 10000, signal }: RequestOptions & { config?: RequestConfig } = {}
): Promise<JsonResult<T>> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
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

    return { notFound: false, data: body as T };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new ApiError("Request timed out or was canceled.", { code: "REQUEST_ABORTED", retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

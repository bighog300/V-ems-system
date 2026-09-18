import { ApiError } from "../api/apiError.ts";

export const STAGE14_TEST_ACTOR = Object.freeze({ actorId: "STAFF-001", role: "field_crew" });

export function developmentTestAuthEnabled(devMode: boolean = typeof __DEV__ !== "undefined" && __DEV__, publicFlag: string | undefined = process.env.EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH): boolean {
  return devMode === true && publicFlag === "true";
}
export function normalizeApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/$/, "");
  try {
    const parsed = new URL(normalized);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) throw new Error("invalid");
  } catch {
    throw new ApiError("Enter a valid HTTP API URL before using the Stage 14 test login.", { code: "INVALID_API_URL" });
  }
  return normalized;
}

export interface DevelopmentTestSessionResponse {
  token: string;
  token_type: "Bearer";
  expires_at: string;
  actor_id: "STAFF-001";
  role: "field_crew";
  synthetic_test_session: true;
}

function errorForStatus(status: number): ApiError {
  if (status === 404) return new ApiError("Stage 14 test login is unavailable on this API.", { status, code: "NOT_FOUND" });
  if (status === 429) return new ApiError("Stage 14 test login is temporarily rate limited.", { status, code: "RATE_LIMITED", retryable: true });
  return new ApiError("Stage 14 test login was rejected by the development API.", { status, code: "DEVELOPMENT_TEST_AUTH_REJECTED" });
}

export async function requestDevelopmentTestSession(apiBaseUrl: string, fetchImpl: typeof fetch = fetch): Promise<DevelopmentTestSessionResponse> {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/api/development/test-session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
  } catch {
    throw new ApiError("Stage 14 test login could not reach the development API.", { code: "NETWORK_ERROR", retryable: true });
  }
  if (!response.ok) throw errorForStatus(response.status);
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object") throw new ApiError("The development API returned an invalid test-session response.", { code: "INVALID_RESPONSE" });
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.token !== "string" || candidate.token.length === 0 || candidate.token_type !== "Bearer" || typeof candidate.expires_at !== "string" || candidate.actor_id !== STAGE14_TEST_ACTOR.actorId || candidate.role !== STAGE14_TEST_ACTOR.role || candidate.synthetic_test_session !== true) {
    throw new ApiError("The development API returned an invalid test-session response.", { code: "INVALID_RESPONSE" });
  }
  return candidate as unknown as DevelopmentTestSessionResponse;
}

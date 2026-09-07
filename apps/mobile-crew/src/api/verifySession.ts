import { requestJson } from "./httpClient.ts";

export interface VerifySessionArgs {
  apiBaseUrl: string;
  authToken: string;
  fetchImpl?: typeof fetch;
}

/**
 * There is no dedicated login/whoami endpoint yet (production OIDC issuance is
 * Stage 12 work) — crews obtain a bearer token out of band, the same way
 * web-control's dev token entry works. This pings an authenticated,
 * role-unrestricted read endpoint to confirm the pasted token/API base URL
 * actually work before persisting them.
 */
export async function verifySession({ apiBaseUrl, authToken, fetchImpl = fetch }: VerifySessionArgs): Promise<void> {
  const trimmedBaseUrl = apiBaseUrl.trim().replace(/\/$/, "");
  await requestJson(fetchImpl, `${trimmedBaseUrl}/api/support/readiness`, {
    config: { authToken }
  });
}

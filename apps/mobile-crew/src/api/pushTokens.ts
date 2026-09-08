import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export type PushTokenPlatform = "ios" | "android";

export interface RegisterPushTokenArgs extends ApiConfig {
  expoPushToken: string;
  platform: PushTokenPlatform;
}

/**
 * Registers this device's push token against the signed-in crew member.
 * Never routed through the offline outbox — a token is only ever useful
 * while online, and a queued/replayed registration has no clinical
 * significance worth retry semantics for.
 */
export async function registerPushToken({ apiBaseUrl, authToken, fetchImpl = fetch, expoPushToken, platform }: RegisterPushTokenArgs): Promise<void> {
  await requestJson(fetchImpl, `${apiBaseUrl}/api/push-tokens`, {
    method: "POST",
    payload: { expo_push_token: expoPushToken, platform },
    config: { authToken }
  });
}

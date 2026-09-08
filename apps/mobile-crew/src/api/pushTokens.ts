import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export type PushTokenPlatform = "ios" | "android";

export interface RegisterPushTokenArgs extends ApiConfig {
  expoPushToken: string;
  platform: PushTokenPlatform;
  deviceId?: string;
}

/**
 * Registers this device's push token against the signed-in crew member.
 * Never routed through the offline outbox — a token is only ever useful
 * while online, and a queued/replayed registration has no clinical
 * significance worth retry semantics for. deviceId is optional here only
 * because a session restored from before device identity existed might not
 * carry one yet; new sign-ins always attach it (see LoginScreen).
 */
export async function registerPushToken({ apiBaseUrl, authToken, fetchImpl = fetch, expoPushToken, platform, deviceId }: RegisterPushTokenArgs): Promise<void> {
  await requestJson(fetchImpl, `${apiBaseUrl}/api/push-tokens`, {
    method: "POST",
    payload: { expo_push_token: expoPushToken, platform, device_id: deviceId },
    config: { authToken }
  });
}

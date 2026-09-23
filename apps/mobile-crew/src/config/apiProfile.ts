const ANDROID_EMULATOR_DEVELOPMENT_URL = "http://10.0.2.2:3001";

export type ApiProfile = "android-emulator-development" | "explicit";

export function resolveApiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const profile = env.EXPO_PUBLIC_API_PROFILE;
  const isProduction = env.APP_ENV === "production" || env.NODE_ENV === "production" || env.EAS_BUILD_PROFILE === "production";
  if (profile === "android-emulator-development") {
    if (isProduction) {
      throw new Error("The Android emulator development API profile is not valid for a release build.");
    }
    return ANDROID_EMULATOR_DEVELOPMENT_URL;
  }
  const explicitUrl = env.EXPO_PUBLIC_API_URL?.trim();
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");
  return "";
}

export function apiProfileFromEnvironment(env: Record<string, string | undefined> = process.env): ApiProfile {
  return env.EXPO_PUBLIC_API_PROFILE === "android-emulator-development" ? "android-emulator-development" : "explicit";
}

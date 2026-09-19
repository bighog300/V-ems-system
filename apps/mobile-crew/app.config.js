import appJson from "./app.json" with { type: "json" };

function resolveApiBaseUrl(env) {
  if (env.EXPO_PUBLIC_API_PROFILE === "android-emulator-development") {
    if (env.APP_ENV === "production" || env.NODE_ENV === "production" || env.EAS_BUILD_PROFILE === "production") {
      throw new Error("The Android emulator development API profile is not valid for a release build.");
    }
    return "http://10.0.2.2:3001";
  }
  const explicitUrl = (env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if ((env.APP_ENV === "production" || env.NODE_ENV === "production" || env.EAS_BUILD_PROFILE === "production") && !explicitUrl) {
    throw new Error("Release configuration requires EXPO_PUBLIC_API_URL.");
  }
  return explicitUrl;
}

const enabled = process.env.EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH === "true" && process.env.APP_ENV !== "production" && process.env.EAS_BUILD_PROFILE !== "production";

export default ({ config }) => ({
  ...appJson.expo,
  ...config,
  extra: {
    ...(config?.extra ?? {}),
    enableDevelopmentTestAuth: enabled,
    apiBaseUrl: resolveApiBaseUrl(process.env),
    apiProfile: process.env.EXPO_PUBLIC_API_PROFILE ?? "explicit"
  }
});

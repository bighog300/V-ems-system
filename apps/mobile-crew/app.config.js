import appJson from "./app.json" with { type: "json" };

const enabled = process.env.EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH === "true" && process.env.APP_ENV !== "production" && process.env.EAS_BUILD_PROFILE !== "production";

export default ({ config }) => ({
  ...appJson.expo,
  ...config,
  extra: {
    ...(config?.extra ?? {}),
    enableDevelopmentTestAuth: enabled
  }
});

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const expoCli = resolve(projectRoot, "../../node_modules/expo/bin/cli");
const appConfigPath = join(projectRoot, "app.config.js");
const appJsonPath = join(projectRoot, "app.json");

function fail(message) {
  throw new Error(message);
}

function runPrebuild() {
  try {
    execFileSync(process.execPath, [expoCli, "prebuild", "--platform", "android", "--no-install"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit"
    });
  } catch (error) {
    const detail = String(error?.stderr ?? "").replace(/\s+/g, " ").trim();
    throw new Error(`expo prebuild failed${detail ? `: ${detail.slice(0, 240)}` : ""}`);
  }
}

let expoConfigCall = 0;
async function withEnvironment(extraEnv, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(extraEnv)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function expoConfig(extraEnv = {}) {
  expoConfigCall += 1;
  try {
    return await withEnvironment(extraEnv, async () => {
      const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
      const module = await import(`${pathToFileURL(appConfigPath).href}?validation=${expoConfigCall}`);
      return module.default({ config: appJson.expo });
    });
  } catch {
    throw new Error(`Expo config failed on check ${expoConfigCall}.`);
  }
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function developmentEnv(values = {}) {
  return { NODE_ENV: "development", APP_ENV: "development", ...values };
}

function productionEnv(values = {}) {
  return { NODE_ENV: "production", APP_ENV: "production", ...values };
}

async function expectConfigFailure(env, message, forbiddenText = null) {
  try {
    await expoConfig(env);
  } catch (error) {
    if (forbiddenText && String(error.message).includes(forbiddenText)) fail(message);
    return;
  }
  fail(message);
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (["node_modules", "android", ".expo"].includes(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function validateNoSecretLikeMobileSource() {
  const forbidden = /JWT_HS256_SECRET|JWT_ISSUER|JWT_AUDIENCE|OPENEMR_CLIENT_SECRET|OPENEMR_PASSWORD|BEGIN (RSA|EC|OPENSSH) PRIVATE KEY/i;
  for (const path of walkFiles(projectRoot)) {
    const name = relative(projectRoot, path).replaceAll("\\", "/");
    if (name.endsWith(".test.ts") || name.endsWith(".test.tsx") || name.endsWith("validate-mobile-config.mjs") || name.endsWith("validate-mobile-config.sh")) continue;
    if (forbidden.test(readFileSync(path, "utf8"))) fail(`secret-like configuration found in mobile source: ${name}`);
  }
}

function validateGeneratedAndroidProject() {
  runPrebuild();
  const manifestPath = join(projectRoot, "android", "app", "src", "main", "AndroidManifest.xml");
  const gradlePath = join(projectRoot, "android", "app", "build.gradle");
  assert(existsSync(manifestPath), "generated Android manifest is missing");
  assert(existsSync(gradlePath), "generated Android Gradle configuration is missing");
  const manifest = readFileSync(manifestPath, "utf8");
  const gradle = readFileSync(gradlePath, "utf8");
  assert(manifest.includes('android:name=".MainActivity"'), "Android MainActivity is missing");
  assert(/applicationId ['"]org\.vems\.mobilecrew['"]/.test(gradle), "Android application ID mismatch");
  assert(manifest.includes('android:name="android.intent.action.VIEW"'), "deep-link VIEW action is missing");
  assert(manifest.includes('android:name="android.intent.category.BROWSABLE"'), "deep-link BROWSABLE category is missing");
  assert(manifest.includes('android:scheme="vems-mobilecrew"'), "vems-mobilecrew scheme is missing");
  assert(manifest.includes('android:scheme="exp+mobile-crew"'), "Expo development scheme is missing");
}

async function main() {
  const defaultConfig = await expoConfig();
  assert(defaultConfig.scheme === "vems-mobilecrew", "scheme mismatch");
  assert(defaultConfig.android?.package === "org.vems.mobilecrew", "Android package mismatch");
  assert(defaultConfig.extra?.enableDevelopmentTestAuth === false, "development test auth must default off");

  const enabledConfig = await expoConfig(developmentEnv({ EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH: "true" }));
  assert(enabledConfig.extra?.enableDevelopmentTestAuth === true, "development test auth flag was not exposed in explicit development config");

  const emulatorConfig = await expoConfig(developmentEnv({ EXPO_PUBLIC_API_PROFILE: "android-emulator-development" }));
  assert(emulatorConfig.extra?.apiProfile === "android-emulator-development", "emulator API profile was not exposed");
  assert(emulatorConfig.extra?.apiBaseUrl === "http://10.0.2.2:3001", "emulator API profile URL mismatch");

  await expectConfigFailure(productionEnv({ EXPO_PUBLIC_API_PROFILE: "android-emulator-development" }), "release configuration accepted the emulator API profile", "10.0.2.2:3001");
  await expectConfigFailure(productionEnv({ EXPO_PUBLIC_API_PROFILE: "explicit" }), "release configuration accepted an omitted explicit API URL");

  const explicitReleaseConfig = await expoConfig(productionEnv({ EXPO_PUBLIC_API_URL: "https://api.example.test", EXPO_PUBLIC_ENABLE_DEVELOPMENT_TEST_AUTH: "true" }));
  assert(explicitReleaseConfig.extra?.apiBaseUrl === "https://api.example.test", "explicit release API URL mismatch");
  assert(explicitReleaseConfig.extra?.enableDevelopmentTestAuth === false, "release config exposed development test auth");
  validateNoSecretLikeMobileSource();
  validateGeneratedAndroidProject();
  console.log("mobile config: cross-platform scheme/package/API/release/generated-manifest validation PASS");
}

try {
  await main();
} catch (error) {
  console.error(`mobile config validation failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}

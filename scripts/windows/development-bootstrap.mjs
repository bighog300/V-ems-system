import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SECRET_KEYS = [
  "DB_ROOT_PASSWORD", "VTIGER_DB_PASSWORD", "VTIGER_ADMIN_PASSWORD", "VTIGER_PASSWORD",
  "OPENEMR_DB_PASSWORD", "OPENEMR_ADMIN_PASSWORD", "OPENEMR_PASSWORD",
  "OPENEMR_CLIENT_ID", "OPENEMR_CLIENT_SECRET", "VTIGER_ACCESS_KEY", "JWT_HS256_SECRET"
];

const PLACEHOLDER = /(?:replace-with|change_me|change-me|your_|placeholder|example|set-me|secret-here|development-only|__set_in_local_env__)/i;
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

export function parseEnvText(text, source = "environment file") {
  const values = new Map();
  const duplicates = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.includes("\r")) throw new Error(`${source} contains a carriage return at line ${index + 1}`);
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(ASSIGNMENT);
    if (!match || match[2].includes("\n")) throw new Error(`${source} has a malformed assignment at line ${index + 1}`);
    if (values.has(match[1])) duplicates.push(match[1]);
    values.set(match[1], match[2]);
  }
  if (duplicates.length) throw new Error(`Duplicate environment keys: ${[...new Set(duplicates)].join(", ")}`);
  return values;
}

export function validateEnvValues(values, requiredKeys) {
  const missing = [];
  const placeholders = [];
  for (const key of requiredKeys) {
    const value = values.get(key);
    if (value === undefined || !value.trim()) missing.push(key);
    else if (PLACEHOLDER.test(value)) placeholders.push(key);
    else if (/[\r\n]/.test(value)) throw new Error(`Invalid multiline value for ${key}`);
  }
  if (missing.length) throw new Error(`Missing required environment keys: ${missing.join(", ")}`);
  if (placeholders.length) throw new Error(`Placeholder values are not permitted for: ${placeholders.join(", ")}`);
}

export function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function generateDevelopmentIdentity(prefix) {
  return `${prefix}_${randomBytes(9).toString("hex")}`;
}

export function buildDevelopmentValues(templateText, overrides = {}) {
  const values = parseEnvText(templateText, "Windows environment template");
  for (const key of SECRET_KEYS) values.set(key, generateSecret());
  // Vtiger 8.3 stores access keys in VARCHAR(36); 24 random bytes encode to 32 characters.
  values.set('VTIGER_ACCESS_KEY', generateSecret(24));
  values.set("OPENEMR_USERNAME", generateDevelopmentIdentity("vems_dev_openemr"));
  values.set("VTIGER_USERNAME", generateDevelopmentIdentity("vems_dev_vtiger"));
  values.set("VEMS_ENABLE_DEVELOPMENT_TEST_AUTH", "true");
  values.set("VEMS_DB_INIT_MODE", "fresh-development");
  values.set("VEMS_REQUIRE_EXISTING_DB", "false");
  for (const [key, value] of Object.entries(overrides)) values.set(key, String(value));
  return values;
}

export function serializeEnv(values) {
  const keys = [...values.keys()];
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate environment keys cannot be serialized");
  for (const [key, value] of values) {
    if (!ASSIGNMENT.test(`${key}=${value}`) || /[\r\n]/.test(value)) throw new Error(`Invalid value for ${key}`);
  }
  return `${keys.map((key) => `${key}=${values.get(key)}`).join("\n")}\n`;
}

export function atomicWriteEnvFile(destination, values, requiredKeys) {
  validateEnvValues(values, requiredKeys);
  const target = resolve(destination);
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    writeFileSync(temporary, serializeEnv(values), { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return target;
}

export function freshDatabasePathGuard(path) {
  const normalized = resolve(path).replaceAll("\\", "/").toLowerCase();
  if (!normalized.endsWith(".sqlite")) throw new Error("Fresh development database must end in .sqlite");
  if (normalized.endsWith("/platform.sqlite") || normalized.endsWith("/platform.development.sqlite")) throw new Error("Fresh development database filename is reserved");
  if (normalized.includes("/services/api-gateway/.data/") || normalized.includes("/services/orchestration/.data/")) throw new Error("Fresh development database must be outside the repository runtime data directories");
  return resolve(path);
}

export function provisioningDecision(existing, rotate = false) {
  if (existing === "working" && !rotate) return "reuse";
  if (existing === "missing") return "provision";
  if (rotate) return "rotate";
  throw new Error("Existing development credential state is not proven working; refusing to guess or rotate");
}

export function redactText(text, sensitiveValues) {
  let result = String(text);
  for (const value of sensitiveValues) {
    if (value) result = result.replaceAll(String(value), "[REDACTED]");
  }
  return result;
}

// `npm ci` deletes and recreates node_modules. While Metro watches that tree it pins Metro's main thread and grows its
// heap toward an out-of-memory crash (see the Stage 14 execution report), so a reinstall is skipped when the lockfile is
// unchanged and refused while something listens on the Metro port. Line endings are normalized so a CRLF checkout of the
// same lockfile hashes identically.
export function lockfileHash(path) {
  return createHash("sha256").update(readFileSync(path, "utf8").replaceAll("\r\n", "\n"), "utf8").digest("hex");
}

export function installDecision({ lockHash, stampHash, installed, metroRunning }) {
  if (installed && stampHash === lockHash) return "skip";
  if (metroRunning) {
    throw new Error("Dependencies need to be reinstalled, but Metro (or another process) is listening on port 8081. "
      + "A reinstall floods Metro's file watcher and can crash it. Stop Metro, run the bootstrap again, then start Metro. Nothing was changed.");
  }
  return "install";
}

export function loadTemplate(path) {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

export function templateDirectory(path) {
  return dirname(resolve(path));
}

// Non-secret configuration that must follow the template in an existing runtime environment.
// Credentials are never touched.
export function syncTemplateScope(templatePath, environmentPath) {
  const wanted = parseEnvText(loadTemplate(templatePath), "Windows environment template").get("OPENEMR_SCOPE");
  const values = parseEnvText(readFileSync(environmentPath, "utf8").replaceAll("\r\n", "\n"), "runtime environment");
  if (!wanted || values.get("OPENEMR_SCOPE") === wanted) return false;
  values.set("OPENEMR_SCOPE", wanted);
  atomicWriteEnvFile(environmentPath, values, ["OPENEMR_SCOPE"]);
  return true;
}

export function mergeOAuthCapture(environmentPath, capturePath) {
  const values = parseEnvText(readFileSync(environmentPath, "utf8"), "runtime environment");
  const capture = readFileSync(capturePath, "utf8");
  const id = capture.match(/(?:OPENEMR_)?CLIENT_ID\s*[:=]\s*([^\s]+)/i)?.[1];
  const secret = capture.match(/(?:OPENEMR_)?CLIENT_SECRET\s*[:=]\s*([^\s]+)/i)?.[1];
  if (!id || !secret || PLACEHOLDER.test(id) || PLACEHOLDER.test(secret)) throw new Error("OAuth registration output was not machine-readable");
  values.set("OPENEMR_CLIENT_ID", id);
  values.set("OPENEMR_CLIENT_SECRET", secret);
  atomicWriteEnvFile(environmentPath, values, ["OPENEMR_CLIENT_ID", "OPENEMR_CLIENT_SECRET"]);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "generate") {
    const options = Object.fromEntries(args.reduce((result, value, index) => {
      if (value.startsWith("--")) result.push([value.slice(2), args[index + 1]]);
      return result;
    }, []));
    if (!options.template || !options.destination || !options["db-host-path"]) throw new Error("generate requires template, destination and db-host-path");
    if (existsSync(options.destination)) {
      const existing = parseEnvText(readFileSync(options.destination, 'utf8').replaceAll('\r\n', '\n'));
      const present = SECRET_KEYS.filter(key => existing.has(key));
      if (!present.length || !present.every(key => PLACEHOLDER.test(existing.get(key)))) {
        throw new Error('Existing populated environment will not be replaced');
      }
      // Preserve the unused template for review; never back up populated secrets here.
      writeFileSync(`${options.destination}.unconfigured`, readFileSync(options.destination), {flag:'wx', mode:0o600});
    }
    const values = buildDevelopmentValues(loadTemplate(options.template), {
      VEMS_DB_HOST_PATH: options["db-host-path"],
      VEMS_DB_PATH: "/var/lib/vems/data/windows-development.sqlite"
    });
    atomicWriteEnvFile(options.destination, values, ["API_PORT", "API_HOST", "VEMS_DB_PATH", "VEMS_DB_INIT_MODE", "VEMS_REQUIRE_EXISTING_DB", ...SECRET_KEYS, "OPENEMR_USERNAME", "VTIGER_USERNAME"]);
    console.log("development runtime environment generated");
  } else if (command === "merge-oauth") {
    const options = Object.fromEntries(args.reduce((result, value, index) => {
      if (value.startsWith("--")) result.push([value.slice(2), args[index + 1]]);
      return result;
    }, []));
    mergeOAuthCapture(options.environment, options.capture);
    console.log("OpenEMR OAuth credentials merged");
  } else if (command === "install-decision" || command === "write-install-stamp") {
    const options = Object.fromEntries(args.reduce((result, value, index) => {
      if (value.startsWith("--")) result.push([value.slice(2), args[index + 1]]);
      return result;
    }, []));
    const lockHash = lockfileHash(options.lock);
    if (command === "write-install-stamp") {
      writeFileSync(options.stamp, `${lockHash}\n`, "utf8");
      console.log("install stamp written");
    } else {
      const stampHash = existsSync(options.stamp) ? readFileSync(options.stamp, "utf8").trim() : null;
      try {
        console.log(installDecision({ lockHash, stampHash, installed: options.installed === "true", metroRunning: options.metro === "true" }));
      } catch (error) {
        console.error(error.message);
        process.exitCode = 3;
      }
    }
  } else if (command === "sync-scope") {
    const options = Object.fromEntries(args.reduce((result, value, index) => {
      if (value.startsWith("--")) result.push([value.slice(2), args[index + 1]]);
      return result;
    }, []));
    console.log(syncTemplateScope(options.template, options.environment) ? "OpenEMR client scope updated" : "OpenEMR client scope already current");
  } else if (command === "validate") {
    const options = Object.fromEntries(args.reduce((result, value, index) => {
      if (value.startsWith("--")) result.push([value.slice(2), args[index + 1]]);
      return result;
    }, []));
    const values = parseEnvText(readFileSync(options.environment, "utf8"), "runtime environment");
    validateEnvValues(values, [
      "API_PORT", "API_HOST", "VEMS_DB_HOST_PATH", "VEMS_DB_PATH", "VEMS_DB_INIT_MODE", "VEMS_REQUIRE_EXISTING_DB",
      "DB_ROOT_PASSWORD", "VTIGER_DB_PASSWORD", "VTIGER_PASSWORD", "VTIGER_ADMIN_USER", "VTIGER_ADMIN_PASSWORD", "VTIGER_USERNAME", "VTIGER_ACCESS_KEY",
      "OPENEMR_DB_PASSWORD", "OPENEMR_ADMIN_USER", "OPENEMR_ADMIN_PASSWORD", "OPENEMR_USERNAME", "OPENEMR_PASSWORD",
      "REDIS_URL", "REDIS_HOST", "OPENEMR_BASE_URL", "OPENEMR_TOKEN_URL", "OPENEMR_API_STYLE", "OPENEMR_GRANT_TYPE", "OPENEMR_SCOPE", "OPENEMR_USER_ROLE",
      "VTIGER_BASE_URL", "JWT_HS256_SECRET", "JWT_ISSUER", "JWT_AUDIENCE", "VEMS_ENABLE_DEVELOPMENT_TEST_AUTH", "VEMS_DEVELOPMENT_TEST_SESSION_TTL_SECONDS"
    ]);
    if (values.get("VEMS_DB_INIT_MODE") !== "fresh-development" || values.get("VEMS_REQUIRE_EXISTING_DB") !== "false") throw new Error("Windows bootstrap requires explicit fresh-development SQLite mode");
    console.log("development runtime environment validated");
  } else {
    throw new Error("Usage: node development-bootstrap.mjs generate|merge-oauth|validate ...");
  }
}

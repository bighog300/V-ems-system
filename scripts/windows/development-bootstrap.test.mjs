import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  atomicWriteEnvFile,
  buildDevelopmentValues,
  freshDatabasePathGuard,
  parseEnvText,
  provisioningDecision,
  redactText,
  serializeEnv,
  validateEnvValues
} from "./development-bootstrap.mjs";

const template = "API_PORT=3001\nAPI_HOST=0.0.0.0\nVEMS_DB_PATH=/var/lib/vems/data/windows-development.sqlite\nVEMS_REQUIRE_EXISTING_DB=false\nOPENEMR_CLIENT_ID=placeholder\nOPENEMR_CLIENT_SECRET=placeholder\n";

test("secret generation produces non-placeholder values without logging them", () => {
  const values = buildDevelopmentValues(template, { VEMS_DB_HOST_PATH: "C:/Users/test/AppData/Local/VEMS/data" });
  assert.notEqual(values.get("JWT_HS256_SECRET"), undefined);
  assert.notEqual(values.get("OPENEMR_PASSWORD"), undefined);
  assert.equal(values.get('VTIGER_ACCESS_KEY').length, 32);
  validateEnvValues(values, ["JWT_HS256_SECRET", "OPENEMR_PASSWORD", "OPENEMR_USERNAME", "VTIGER_USERNAME"]);
});

test("duplicate, placeholder, malformed and multiline values are rejected", () => {
  assert.throws(() => parseEnvText("A=1\nA=2\n"), /Duplicate/);
  assert.throws(() => validateEnvValues(new Map([["A", "replace-with-secret"]]), ["A"]), /Placeholder/);
  assert.throws(() => parseEnvText("A=one\r\n"), /carriage return/);
  assert.throws(() => serializeEnv(new Map([["A", "one\ntwo"]])), /Invalid value/);
});

test("environment construction replaces atomically and keeps a final newline", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-bootstrap-env-"));
  const destination = join(dir, "development.env");
  atomicWriteEnvFile(destination, new Map([["A", "safe"]]), ["A"]);
  assert.equal(readFileSync(destination, "utf8"), "A=safe\n");
});

test("idempotent provisioning reuses working state and never rotates implicitly", () => {
  assert.equal(provisioningDecision("working"), "reuse");
  assert.equal(provisioningDecision("missing"), "provision");
  assert.throws(() => provisioningDecision("unknown"), /refusing to guess/);
  assert.equal(provisioningDecision("working", true), "rotate");
});

test("redaction removes supplied sensitive values from diagnostics", () => {
  assert.equal(redactText("authorization secret-value", ["secret-value"]), "authorization [REDACTED]");
});

test("fresh database guard rejects retained paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-bootstrap-db-"));
  assert.doesNotThrow(() => freshDatabasePathGuard(join(dir, "windows-development.sqlite")));
  assert.throws(() => freshDatabasePathGuard(join(dir, "platform.sqlite")), /reserved/);
  assert.throws(() => freshDatabasePathGuard(join(process.cwd(), "services/api-gateway/.data/fresh.sqlite")), /outside/);
});

test("Vtiger provisioner creates module classes, language files and entity identifiers", () => {
  const source = readFileSync(new URL("../../infra/services/vtiger/development/provision-development.php", import.meta.url), "utf8");
  assert.match(source, /function vemsEnsureModuleFiles/);
  assert.match(source, /modules\/\$module\/\$module\.php|"\$directory\/\$module\.php"/);
  assert.match(source, /setEntityIdentifier\(\$identifier\)/);
  const modules = JSON.parse(readFileSync(new URL("../../infra/services/vtiger/development/modules.json", import.meta.url), "utf8"));
  for (const [name, fields] of Object.entries(modules)) assert.ok(fields.includes("vems_external_key"), `${name} needs an entity identifier field`);
});

test("API port is published on loopback only", () => {
  const compose = readFileSync(new URL("../../infra/docker-compose.dev.yml", import.meta.url), "utf8");
  assert.match(compose, /"127\.0\.0\.1:\$\{API_PORT:-3001\}:3001"/);
});

test("service validator rejects an unregistered OpenEMR client id, not a password-grant secret", () => {
  const source = readFileSync(new URL("./validate-services.mjs", import.meta.url), "utf8");
  assert.match(source, /deliberately-unregistered-client-id/);
  assert.doesNotMatch(source, /deliberately-invalid-client-secret/);
});
test("development API readiness exercises OpenEMR and Vtiger reachability", () => {
  const compose = readFileSync(new URL("../../infra/docker-compose.dev.yml", import.meta.url), "utf8");
  assert.match(compose, /UPSTREAM_CONNECTIVITY_CHECKS_ENABLED: "true"/);
});
test("development readiness pings service endpoints that do not redirect to the host-only site URL", () => {
  const compose = readFileSync(new URL("../../infra/docker-compose.dev.yml", import.meta.url), "utf8");
  assert.match(compose, /VTIGER_CONNECTIVITY_PING_PATH: \/webservice\.php\?operation=getchallenge/);
  assert.match(compose, /OPENEMR_CONNECTIVITY_PING_PATH: \/oauth2\/default\/\.well-known\/openid-configuration/);
});
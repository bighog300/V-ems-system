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

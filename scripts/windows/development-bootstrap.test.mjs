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
  syncTemplateScope,
  installDecision,
  lockfileHash,
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

test("Vtiger provisioner creates a default \"All\" list view for every module, matching a standard module's system view", () => {
  const source = readFileSync(new URL("../../infra/services/vtiger/development/provision-development.php", import.meta.url), "utf8");
  // vtlib module creation ships no default view; without one, List is a fatal error for every account.
  assert.match(source, /INSERT INTO vtiger_customview \(cvid, viewname, setdefault, setmetrics, entitytype, status, userid\) VALUES \(\?,\?,1,0,\?,0,1\)/);
  assert.match(source, /SELECT cvid FROM vtiger_customview WHERE viewname=\? AND entitytype=\?/);
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
test("scope synchronization updates only OPENEMR_SCOPE and preserves credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-scope-sync-"));
  const templatePath = join(dir, "template.env");
  const environmentPath = join(dir, "development.env");
  writeFileSync(templatePath, "OPENEMR_SCOPE=openid user/patient.read user/patient.write\nOPENEMR_PASSWORD=placeholder\n");
  writeFileSync(environmentPath, "OPENEMR_SCOPE=openid user/patient.read\nOPENEMR_PASSWORD=keep-this-secret\n");
  assert.equal(syncTemplateScope(templatePath, environmentPath), true);
  const values = parseEnvText(readFileSync(environmentPath, "utf8"));
  assert.equal(values.get("OPENEMR_SCOPE"), "openid user/patient.read user/patient.write");
  assert.equal(values.get("OPENEMR_PASSWORD"), "keep-this-secret");
  assert.equal(syncTemplateScope(templatePath, environmentPath), false);
});

test("development OpenEMR client scope covers the adapter's write routes and provisioning syncs it", () => {
  const template = readFileSync(new URL("../../infra/env/development.windows.example.env", import.meta.url), "utf8");
  for (const scope of ["patient", "encounter", "vital", "soap_note"]) {
    assert.match(template, new RegExp(`user/${scope}\\.read`));
    assert.match(template, new RegExp(`user/${scope}\\.write`));
  }
  const provisioner = readFileSync(new URL("../../infra/services/openemr/development/provision-development.php", import.meta.url), "utf8");
  assert.match(provisioner, /UPDATE oauth_clients SET scope/);
  // Patient history reads the medication list.
  assert.match(template, /user\/medication\.read/);
});
test("OpenEMR integration user is provisioned into the Physicians ACL group", () => {
  const provisioner = readFileSync(new URL("../../infra/services/openemr/development/provision-development.php", import.meta.url), "utf8");
  assert.match(provisioner, /setUserAro\(\['Physicians'\]/);
  assert.doesNotMatch(provisioner, /setUserAro\(\['Clinicians'\]/);
});

test("workflow seed replays idempotently and only advances dispatch state once", async () => {
  const { createServer } = await import("node:http");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const state = { incident: "New", assignment: "Proposed", calls: [] };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const path = req.url;
      state.calls.push(`${req.method} ${path}`);
      const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
      if (path === "/api/development/test-session") return send(200, { token: "t" });
      if (path === "/api/incidents" && req.method === "POST") return send(201, { incident_id: "INC-000001" });
      if (path === "/api/incidents/INC-000001/assignments") return send(201, { assignment_id: "ASN-000001", status: state.assignment });
      if (path === "/api/assignments/ASN-000001" && req.method === "PATCH") { state.assignment = "Assigned"; return send(200, {}); }
      if (path === "/api/incidents/INC-000001" && req.method === "PATCH") { state.incident = state.incident === "New" ? "Awaiting Dispatch" : "Assigned"; return send(200, {}); }
      if (path === "/api/incidents/INC-000001") return send(200, { status: state.incident });
      if (path === "/api/incidents/INC-000001/patient-cases") return send(201, { patient_case_id: "PCR-000001" });
      if (path === "/api/patients") return send(201, { patient_id: "patient-1" });
      return send(201, {});
    });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  try {
    const env = { ...process.env, VEMS_API_URL: `http://127.0.0.1:${server.address().port}` };
    const script = new URL("./seed-development-workflow.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    await run(process.execPath, [script], { env });
    await run(process.execPath, [script], { env });
    assert.equal(state.calls.filter((c) => c.startsWith("PATCH")).length, 3);
    assert.equal(state.incident, "Assigned");
  } finally { server.close(); }
});
test("dependency reinstall is skipped when the lockfile is unchanged, even while Metro is running", () => {
  assert.equal(installDecision({ lockHash: "a", stampHash: "a", installed: true, metroRunning: true }), "skip");
  assert.equal(installDecision({ lockHash: "a", stampHash: "a", installed: true, metroRunning: false }), "skip");
});

test("dependency reinstall runs when needed and Metro is stopped, and is refused while Metro is running", () => {
  for (const state of [{ stampHash: "old", installed: true }, { stampHash: null, installed: true }, { stampHash: "a", installed: false }]) {
    assert.equal(installDecision({ lockHash: "a", metroRunning: false, ...state }), "install");
    assert.throws(() => installDecision({ lockHash: "a", metroRunning: true, ...state }), /listening on port 8081.*Nothing was changed/s);
  }
});

test("lockfile hashing ignores CRLF checkouts", () => {
  const dir = mkdtempSync(join(tmpdir(), "vems-lock-hash-"));
  writeFileSync(join(dir, "lf.json"), '{\n  "a": 1\n}\n');
  writeFileSync(join(dir, "crlf.json"), '{\r\n  "a": 1\r\n}\r\n');
  assert.equal(lockfileHash(join(dir, "lf.json")), lockfileHash(join(dir, "crlf.json")));
});

test("install-decision CLI reports skip or install, refuses with exit 3 while Metro runs, and writes the stamp", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const script = new URL("./development-bootstrap.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const dir = mkdtempSync(join(tmpdir(), "vems-install-cli-"));
  const lock = join(dir, "package-lock.json"); const stamp = join(dir, ".stamp");
  writeFileSync(lock, '{"lockfileVersion":3}\n');
  const decide = (installed, metro) => run(process.execPath, [script, "install-decision", "--lock", lock, "--stamp", stamp, "--installed", String(installed), "--metro", String(metro)]);
  assert.equal((await decide(true, false)).stdout.trim(), "install");
  await assert.rejects(() => decide(true, true), (error) => error.code === 3 && /Nothing was changed/.test(error.stderr));
  await run(process.execPath, [script, "write-install-stamp", "--lock", lock, "--stamp", stamp]);
  assert.equal((await decide(true, true)).stdout.trim(), "skip");
  writeFileSync(lock, '{"lockfileVersion":3,"changed":true}\n');
  assert.equal((await decide(true, false)).stdout.trim(), "install");
});

test("bootstrap installs dependencies only through the guarded helper", () => {
  const bootstrap = readFileSync(new URL("./bootstrap-development.ps1", import.meta.url), "utf8");
  assert.match(bootstrap, /Invoke-LockedInstall/);
  assert.doesNotMatch(bootstrap, /npm\.cmd'\s*@\('ci'/);
  const common = readFileSync(new URL("./common.ps1", import.meta.url), "utf8");
  assert.match(common, /function Invoke-LockedInstall/);
  assert.match(common, /LocalPort 8081/);
});
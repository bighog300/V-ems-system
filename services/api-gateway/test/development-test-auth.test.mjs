import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/server.mjs";
import { authenticateRequest, issueHs256Token } from "../src/auth.mjs";
import { validateDevelopmentTestAuthConfig } from "../src/development-test-auth.mjs";

const ENV_KEYS = [
  "NODE_ENV", "APP_ENV", "APP_PROFILE", "DEPLOYMENT_ENV", "RELEASE_CHANNEL",
  "VEMS_ENABLE_DEVELOPMENT_TEST_AUTH", "VEMS_DEVELOPMENT_TEST_SESSION_TTL_SECONDS",
  "VEMS_SECURE_STARTUP", "JWT_HS256_SECRET", "JWT_ISSUER", "JWT_AUDIENCE",
  "AUTH_TRUST_HEADERS", "RATE_LIMIT_ENABLED"
];
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

function setEnv(values) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv.get(key) === undefined) delete process.env[key];
    else process.env[key] = originalEnv.get(key);
  }
});

function fakeOrchestration() {
  const audits = [];
  return {
    audits,
    personnel: { findById: async (id) => id === "STAFF-001" ? { staff_id: id, role: "field_crew", operational_status: "Available" } : null },
    db: { dialect: "test", queryOne: async () => ({ value: 1 }) },
    objectStorage: { putObject: async () => ({ key: "probe" }), getObject: async () => ({ content: Buffer.from("vems-readiness-probe") }) },
    audit: async (...args) => audits.push(args),
    isAccessRevoked: async () => false,
    listIncidentsForBoard: async () => [],
    getAssignmentsForCrewMember: async () => [],
    listSyncIntents: async () => []
  };
}

async function start(orchestration) {
  const server = createApp(orchestration);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
  return { response, body: await response.json() };
}

function enabledEnv(extra = {}) {
  return {
    NODE_ENV: "development",
    APP_ENV: "development",
    VEMS_ENABLE_DEVELOPMENT_TEST_AUTH: "true",
    JWT_HS256_SECRET: "stage14-test-secret-that-is-not-a-default",
    JWT_ISSUER: "vems-test",
    JWT_AUDIENCE: "vems-mobile",
    AUTH_TRUST_HEADERS: "false",
    ...extra
  };
}

test("disabled development test auth is unavailable without changing normal auth", async () => {
  setEnv({ NODE_ENV: "development", APP_ENV: "development", JWT_HS256_SECRET: "stage14-test-secret-that-is-not-a-default", JWT_ISSUER: "vems-test", JWT_AUDIENCE: "vems-mobile" });
  const orchestration = fakeOrchestration();
  const { server, base } = await start(orchestration);
  try {
    const disabled = await request(base, "/api/development/test-session", { method: "POST", body: "{}" });
    assert.equal(disabled.response.status, 404);
    const normal = await request(base, "/api/assignments/mine");
    assert.equal(normal.response.status, 401);
  } finally { server.close(); }
});

test("enabled endpoint issues fixed synthetic claims and audit without token material", async () => {
  setEnv(enabledEnv({ VEMS_DEVELOPMENT_TEST_SESSION_TTL_SECONDS: "1800" }));
  const orchestration = fakeOrchestration();
  const { server, base } = await start(orchestration);
  try {
    const issued = await request(base, "/api/development/test-session", { method: "POST", body: JSON.stringify({ actor_id: "OTHER", role: "admin", tenant: "other" }) });
    assert.equal(issued.response.status, 200);
    assert.equal(issued.body.actor_id, "STAFF-001");
    assert.equal(issued.body.role, "field_crew");
    assert.equal(issued.body.synthetic_test_session, true);
    assert.equal(issued.body.token_type, "Bearer");
    const verified = await authenticateRequest({ headers: { authorization: `Bearer ${issued.body.token}` } }, { jwtSecret: process.env.JWT_HS256_SECRET, issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE });
    assert.deepEqual(verified, { actorId: "STAFF-001", role: "field_crew" });
    const claims = JSON.parse(Buffer.from(issued.body.token.split(".")[1], "base64url").toString("utf8"));
    assert.equal(claims.synthetic_test_session, true);
    assert.equal(claims.authentication_method, "development_test_session");
    assert.equal(claims.purpose, "stage14_android_acceptance");
    assert.equal(claims.exp - claims.iat, 1800);
    const auditText = JSON.stringify(orchestration.audits);
    assert.equal(auditText.includes(issued.body.token), false);
    assert.equal(auditText.includes(process.env.JWT_HS256_SECRET), false);
    const assignments = await request(base, "/api/assignments/mine", { headers: { authorization: `Bearer ${issued.body.token}` } });
    assert.equal(assignments.response.status, 200);
  } finally { server.close(); }
});

test("enabled endpoint applies the five-per-minute issuance limit", async () => {
  setEnv(enabledEnv());
  const { server, base } = await start(fakeOrchestration());
  try {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(base, "/api/development/test-session", { method: "POST", body: "{}" })).response.status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
  } finally { server.close(); }
});

test("invalid TTL and release profiles fail closed", () => {
  assert.throws(() => validateDevelopmentTestAuthConfig(enabledEnv({ VEMS_DEVELOPMENT_TEST_SESSION_TTL_SECONDS: "899" })), /integer from 900/);
  assert.throws(() => validateDevelopmentTestAuthConfig(enabledEnv({ NODE_ENV: "staging", APP_ENV: "staging" })), /requires NODE_ENV=development/);
  assert.throws(() => validateDevelopmentTestAuthConfig(enabledEnv({ NODE_ENV: "production", APP_ENV: "production" })), /requires NODE_ENV=development/);
  assert.equal(validateDevelopmentTestAuthConfig({ NODE_ENV: "production", VEMS_ENABLE_DEVELOPMENT_TEST_AUTH: "false" }).enabled, false);
});

test("issuer preserves normal claims while adding configured issuer and audience", () => {
  const token = issueHs256Token({ sub: "STAFF-001", role: "field_crew", iat: 1, exp: 2 }, "secret", { issuer: "issuer", audience: "audience" });
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  assert.deepEqual(claims, { sub: "STAFF-001", role: "field_crew", iat: 1, exp: 2, iss: "issuer", aud: "audience" });
});

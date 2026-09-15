import test from "node:test";
import assert from "node:assert/strict";
import { isProductionEnv, isInsecureSecret, connectionStringHasInsecurePassword } from "../src/secure-startup.mjs";

test("isProductionEnv only true for APP_ENV=production", () => {
  assert.equal(isProductionEnv({ APP_ENV: "production" }), true);
  assert.equal(isProductionEnv({ APP_ENV: "staging" }), false);
  assert.equal(isProductionEnv({ APP_ENV: "development" }), false);
  assert.equal(isProductionEnv({}), false);
});

test("isInsecureSecret flags missing, empty, and common placeholder values", () => {
  assert.equal(isInsecureSecret(undefined), true);
  assert.equal(isInsecureSecret(null), true);
  assert.equal(isInsecureSecret(""), true);
  assert.equal(isInsecureSecret("   "), true);
  assert.equal(isInsecureSecret("__set_in_local_env__"), true);
  assert.equal(isInsecureSecret("changeme"), true);
  assert.equal(isInsecureSecret("CHANGEME"), true);
  assert.equal(isInsecureSecret("password"), true);
  assert.equal(isInsecureSecret("postgres"), true);
});

test("isInsecureSecret accepts a real-looking secret", () => {
  assert.equal(isInsecureSecret("a".repeat(64)), false);
  assert.equal(isInsecureSecret("k3y-8f2a91c7-9d4b-4e11-b6a2-7c5d0e1f2a3b"), false);
});

test("connectionStringHasInsecurePassword detects a default password embedded in the URL", () => {
  assert.equal(connectionStringHasInsecurePassword("postgresql://app:changeme@db.internal:5432/vems"), true);
  assert.equal(connectionStringHasInsecurePassword("postgresql://postgres:postgres@localhost:5432/vems"), true);
});

test("connectionStringHasInsecurePassword accepts a real-looking password", () => {
  assert.equal(connectionStringHasInsecurePassword("postgresql://app:kx92-9d4b4e11b6a2@db.internal:5432/vems"), false);
});

test("connectionStringHasInsecurePassword is false for a malformed/missing connection string", () => {
  assert.equal(connectionStringHasInsecurePassword(undefined), false);
  assert.equal(connectionStringHasInsecurePassword(""), false);
  assert.equal(connectionStringHasInsecurePassword("not-a-url"), false);
});

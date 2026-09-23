import test from "node:test";
import assert from "node:assert/strict";
import { developmentTestAuthEnabled, requestDevelopmentTestSession } from "../src/auth/developmentTestSession.ts";

const valid = { token: "synthetic-token", token_type: "Bearer", expires_at: "2026-09-18T17:00:00.000Z", actor_id: "STAFF-001", role: "field_crew", synthetic_test_session: true };

test("development test auth requires both debug mode and exact public flag", () => {
  assert.equal(developmentTestAuthEnabled(false, "true"), false);
  assert.equal(developmentTestAuthEnabled(true, undefined), false);
  assert.equal(developmentTestAuthEnabled(true, "TRUE"), false);
  assert.equal(developmentTestAuthEnabled(true, "true"), true);
});

test("valid response is accepted without logging or exposing token", async () => {
  const calls: RequestInit[] = [];
  const response = await requestDevelopmentTestSession("http://127.0.0.1:3001", async (_url, init) => { calls.push(init ?? {}); return new Response(JSON.stringify(valid), { status: 200 }); });
  assert.deepEqual(response, valid);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, "{}");
});

test("404, 429, server and malformed responses are sanitized", async () => {
  for (const [status, code] of [[404, "NOT_FOUND"], [429, "RATE_LIMITED"], [500, "DEVELOPMENT_TEST_AUTH_REJECTED"]] as const) {
    await assert.rejects(() => requestDevelopmentTestSession("http://127.0.0.1:3001", async () => new Response("{}", { status })), (error: Error & { code?: string }) => error.code === code && !error.message.includes("token"));
  }
  await assert.rejects(() => requestDevelopmentTestSession("http://127.0.0.1:3001", async () => new Response(JSON.stringify({ ...valid, actor_id: "other" }), { status: 200 })), /invalid test-session response/);
});

test("network failures are sanitized", async () => {
  await assert.rejects(() => requestDevelopmentTestSession("http://127.0.0.1:3001", async () => { throw new Error("secret token should not escape"); }), /could not reach/);
});

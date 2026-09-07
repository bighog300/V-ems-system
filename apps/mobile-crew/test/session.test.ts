import assert from "node:assert/strict";
import { test } from "node:test";

import type { Session, SecureStoreLike } from "../src/auth/session.ts";
import { clearSession, loadSession, saveSession } from "../src/auth/session.ts";

function createFakeStore(): SecureStoreLike {
  const backing = new Map<string, string>();
  return {
    async getItemAsync(key) {
      return backing.has(key) ? backing.get(key)! : null;
    },
    async setItemAsync(key, value) {
      backing.set(key, value);
    },
    async deleteItemAsync(key) {
      backing.delete(key);
    }
  };
}

const SAMPLE_SESSION: Session = {
  apiBaseUrl: "https://api.example.test",
  authToken: "token-123",
  actorId: "STAFF-001",
  actorRole: "field_crew"
};

test("loadSession returns null when nothing is stored", async () => {
  const store = createFakeStore();
  assert.equal(await loadSession(store), null);
});

test("saveSession then loadSession round-trips the session", async () => {
  const store = createFakeStore();
  await saveSession(SAMPLE_SESSION, store);
  assert.deepEqual(await loadSession(store), SAMPLE_SESSION);
});

test("clearSession removes the stored session", async () => {
  const store = createFakeStore();
  await saveSession(SAMPLE_SESSION, store);
  await clearSession(store);
  assert.equal(await loadSession(store), null);
});

test("loadSession ignores malformed stored data", async () => {
  const store = createFakeStore();
  await store.setItemAsync("vems.mobile.session", "not valid json");
  assert.equal(await loadSession(store), null);
});

test("loadSession ignores a stored value missing required fields", async () => {
  const store = createFakeStore();
  await store.setItemAsync("vems.mobile.session", JSON.stringify({ apiBaseUrl: "https://x" }));
  assert.equal(await loadSession(store), null);
});

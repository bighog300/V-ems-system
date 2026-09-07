import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import { decryptJson, encryptJson, getOrCreateEncryptionKey } from "../../src/offline/crypto.ts";

function fakeCryptoModule() {
  return { getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count)) };
}

function fakeSecureStore(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    store,
    getItemAsync: async (key: string) => store[key] ?? null,
    setItemAsync: async (key: string, value: string) => {
      store[key] = value;
    }
  };
}

test("getOrCreateEncryptionKey generates and persists a 32-byte key on first use", async () => {
  const secureStore = fakeSecureStore();
  const key = await getOrCreateEncryptionKey({ secureStore, cryptoModule: fakeCryptoModule() });
  assert.equal(key.length, 32);
  assert.equal(Object.keys(secureStore.store).length, 1);
});

test("getOrCreateEncryptionKey returns the same key on subsequent calls", async () => {
  const secureStore = fakeSecureStore();
  const cryptoModule = fakeCryptoModule();
  const first = await getOrCreateEncryptionKey({ secureStore, cryptoModule });
  const second = await getOrCreateEncryptionKey({ secureStore, cryptoModule });
  assert.deepEqual(first, second);
});

test("encryptJson then decryptJson round-trips arbitrary JSON values", async () => {
  const cryptoModule = fakeCryptoModule();
  const key = new Uint8Array(randomBytes(32));
  const value = { vital_signs: { heart_rate_bpm: 88 }, notes: "unremarkable", nested: [1, 2, { ok: true }] };
  const encrypted = await encryptJson(value, key, { cryptoModule });
  assert.equal(typeof encrypted, "string");
  assert.match(encrypted, /^[0-9a-f]+:[0-9a-f]+$/);
  assert.deepEqual(decryptJson(encrypted, key), value);
});

test("decryptJson rejects a payload encrypted with a different key", async () => {
  const cryptoModule = fakeCryptoModule();
  const key = new Uint8Array(randomBytes(32));
  const otherKey = new Uint8Array(randomBytes(32));
  const encrypted = await encryptJson({ a: 1 }, key, { cryptoModule });
  assert.throws(() => decryptJson(encrypted, otherKey));
});

test("decryptJson rejects a malformed payload", () => {
  const key = new Uint8Array(randomBytes(32));
  assert.throws(() => decryptJson("not-a-valid-payload", key), /Malformed encrypted payload/);
});

test("encryptJson produces different ciphertext for the same value on each call", async () => {
  const cryptoModule = fakeCryptoModule();
  const key = new Uint8Array(randomBytes(32));
  const first = await encryptJson({ a: 1 }, key, { cryptoModule });
  const second = await encryptJson({ a: 1 }, key, { cryptoModule });
  assert.notEqual(first, second);
});

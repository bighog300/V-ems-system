import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { getOrCreateDeviceId } from "../src/auth/deviceIdentity.ts";

function fakeCryptoModule() {
  let counter = 0;
  return { randomUUID: () => `test-device-id-${(counter += 1)}` };
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

test("getOrCreateDeviceId generates and persists an id on first use", async () => {
  const secureStore = fakeSecureStore();
  const deviceId = await getOrCreateDeviceId({ secureStore, cryptoModule: fakeCryptoModule() });
  assert.equal(deviceId, "test-device-id-1");
  assert.equal(Object.keys(secureStore.store).length, 1);
});

test("getOrCreateDeviceId returns the same id on subsequent calls, without generating a new one", async () => {
  const secureStore = fakeSecureStore();
  const cryptoModule = fakeCryptoModule();
  const first = await getOrCreateDeviceId({ secureStore, cryptoModule });
  const second = await getOrCreateDeviceId({ secureStore, cryptoModule });
  assert.equal(first, second);
});

test("getOrCreateDeviceId returns a previously persisted id without touching the crypto module", async () => {
  const secureStore = fakeSecureStore({ "vems.mobile.device_id": randomUUID() });
  const persisted = secureStore.store["vems.mobile.device_id"];
  const deviceId = await getOrCreateDeviceId({
    secureStore,
    cryptoModule: {
      randomUUID: () => {
        throw new Error("should not generate a new id when one already exists");
      }
    }
  });
  assert.equal(deviceId, persisted);
});

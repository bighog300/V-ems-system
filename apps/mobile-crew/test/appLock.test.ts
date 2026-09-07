import assert from "node:assert/strict";
import { test } from "node:test";

import { authenticateWithAppLock, getAppLockAvailability, type LocalAuthenticationModule } from "../src/auth/appLock.ts";

function fakeModule(overrides: Partial<LocalAuthenticationModule> = {}): LocalAuthenticationModule {
  return {
    hasHardwareAsync: async () => true,
    isEnrolledAsync: async () => true,
    authenticateAsync: async () => ({ success: true }),
    ...overrides
  };
}

test("getAppLockAvailability reports hardware and enrollment", async () => {
  const availability = await getAppLockAvailability(fakeModule());
  assert.deepEqual(availability, { hasHardware: true, isEnrolled: true });
});

test("authenticateWithAppLock succeeds when the module reports success", async () => {
  const result = await authenticateWithAppLock(fakeModule());
  assert.equal(result, true);
});

test("authenticateWithAppLock fails when the module reports failure", async () => {
  const result = await authenticateWithAppLock(fakeModule({ authenticateAsync: async () => ({ success: false, error: "user_cancel" }) }));
  assert.equal(result, false);
});

test("authenticateWithAppLock allows through when there is no biometric hardware", async () => {
  const result = await authenticateWithAppLock(
    fakeModule({
      hasHardwareAsync: async () => false,
      authenticateAsync: async () => {
        throw new Error("should not be called without hardware");
      }
    })
  );
  assert.equal(result, true);
});

test("authenticateWithAppLock allows through when nothing is enrolled", async () => {
  const result = await authenticateWithAppLock(
    fakeModule({
      isEnrolledAsync: async () => false,
      authenticateAsync: async () => {
        throw new Error("should not be called without enrollment");
      }
    })
  );
  assert.equal(result, true);
});

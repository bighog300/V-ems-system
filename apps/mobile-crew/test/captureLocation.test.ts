import assert from "node:assert/strict";
import { test } from "node:test";

import { captureLocation, getLocationPermissionStatus, requestLocationPermission, type LocationModule } from "../src/location/captureLocation.ts";

function fakeModule(overrides: Partial<LocationModule> = {}): LocationModule {
  return {
    getForegroundPermissionsAsync: async () => ({ status: "granted" }),
    requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
    getCurrentPositionAsync: async () => ({ coords: { latitude: 51.5074, longitude: -0.1278, accuracy: 10 } }),
    ...overrides
  };
}

test("captureLocation returns coordinates when permission is already granted", async () => {
  const result = await captureLocation(fakeModule());
  assert.deepEqual(result, { location_lat: 51.5074, location_lng: -0.1278, location_accuracy_m: 10 });
});

test("captureLocation returns null without requesting a fix when permission is denied", async () => {
  const result = await captureLocation(
    fakeModule({
      getForegroundPermissionsAsync: async () => ({ status: "denied" }),
      getCurrentPositionAsync: async () => {
        throw new Error("should not fetch a position without permission");
      }
    })
  );
  assert.equal(result, null);
});

test("captureLocation returns null when permission has never been decided", async () => {
  const result = await captureLocation(fakeModule({ getForegroundPermissionsAsync: async () => ({ status: "undetermined" }) }));
  assert.equal(result, null);
});

test("captureLocation returns null (never throws) when the position fetch fails", async () => {
  const result = await captureLocation(
    fakeModule({
      getCurrentPositionAsync: async () => {
        throw new Error("timed out");
      }
    })
  );
  assert.equal(result, null);
});

test("captureLocation reports a null accuracy as null, not undefined", async () => {
  const result = await captureLocation(fakeModule({ getCurrentPositionAsync: async () => ({ coords: { latitude: 1, longitude: 2, accuracy: null } }) }));
  assert.deepEqual(result, { location_lat: 1, location_lng: 2, location_accuracy_m: null });
});

test("getLocationPermissionStatus normalizes an unexpected status string to undetermined", async () => {
  const status = await getLocationPermissionStatus(fakeModule({ getForegroundPermissionsAsync: async () => ({ status: "granted-once" }) }));
  assert.equal(status, "undetermined");
});

test("getLocationPermissionStatus passes through granted and denied", async () => {
  assert.equal(await getLocationPermissionStatus(fakeModule({ getForegroundPermissionsAsync: async () => ({ status: "granted" }) })), "granted");
  assert.equal(await getLocationPermissionStatus(fakeModule({ getForegroundPermissionsAsync: async () => ({ status: "denied" }) })), "denied");
});

test("requestLocationPermission returns the resulting status", async () => {
  const status = await requestLocationPermission(fakeModule({ requestForegroundPermissionsAsync: async () => ({ status: "denied" }) }));
  assert.equal(status, "denied");
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  __resetVitalsDeviceDriverRegistryForTests,
  findVitalsDeviceDriver,
  listRegisteredVitalsDeviceDrivers,
  registerVitalsDeviceDriver
} from "../../src/devices/driverRegistry.ts";
import type { VitalsDeviceDriver } from "../../src/devices/bleTypes.ts";

function fakeDriver(id: string, matchesLocalName: string): VitalsDeviceDriver {
  return {
    id,
    label: id,
    matches: (advertisement) => advertisement.localName === matchesLocalName,
    startStreaming: () => () => {}
  };
}

test("registerVitalsDeviceDriver adds a driver, and findVitalsDeviceDriver matches it by advertisement", () => {
  __resetVitalsDeviceDriverRegistryForTests();
  const driver = fakeDriver("driver-a", "Monitor A");
  registerVitalsDeviceDriver(driver);

  const found = findVitalsDeviceDriver({ deviceId: "dev-1", localName: "Monitor A", serviceUuids: [] });
  assert.equal(found?.id, "driver-a");
});

test("findVitalsDeviceDriver returns null when nothing matches", () => {
  __resetVitalsDeviceDriverRegistryForTests();
  registerVitalsDeviceDriver(fakeDriver("driver-a", "Monitor A"));

  assert.equal(findVitalsDeviceDriver({ deviceId: "dev-1", localName: "Unrelated device", serviceUuids: [] }), null);
});

test("findVitalsDeviceDriver returns the first registered match, in registration order", () => {
  __resetVitalsDeviceDriverRegistryForTests();
  registerVitalsDeviceDriver({ id: "always-matches-1", label: "1", matches: () => true, startStreaming: () => () => {} });
  registerVitalsDeviceDriver({ id: "always-matches-2", label: "2", matches: () => true, startStreaming: () => () => {} });

  const found = findVitalsDeviceDriver({ deviceId: "dev-1", localName: null, serviceUuids: [] });
  assert.equal(found?.id, "always-matches-1");
});

test("registerVitalsDeviceDriver ignores a second registration of the same driver id", () => {
  __resetVitalsDeviceDriverRegistryForTests();
  registerVitalsDeviceDriver(fakeDriver("driver-a", "Monitor A"));
  registerVitalsDeviceDriver(fakeDriver("driver-a", "Different name"));

  assert.equal(listRegisteredVitalsDeviceDrivers().length, 1);
  assert.equal(findVitalsDeviceDriver({ deviceId: "dev-1", localName: "Monitor A", serviceUuids: [] })?.id, "driver-a");
});

test("__resetVitalsDeviceDriverRegistryForTests clears every registered driver", () => {
  __resetVitalsDeviceDriverRegistryForTests();
  registerVitalsDeviceDriver(fakeDriver("driver-a", "Monitor A"));
  assert.equal(listRegisteredVitalsDeviceDrivers().length, 1);

  __resetVitalsDeviceDriverRegistryForTests();
  assert.equal(listRegisteredVitalsDeviceDrivers().length, 0);
});

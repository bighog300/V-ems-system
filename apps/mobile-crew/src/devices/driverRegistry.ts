import type { BleAdvertisement, VitalsDeviceDriver } from "./bleTypes.ts";

// A plain module-level array, matching the pattern already established for
// other small in-app registries in this codebase (see
// history/patientHistoryStore.ts's module-level Map) -- no persistence,
// rebuilt fresh every app start from whichever drivers
// registerBuiltInDrivers() (or a future vendor driver's own registration
// call) puts into it.
const drivers: VitalsDeviceDriver[] = [];

export function registerVitalsDeviceDriver(driver: VitalsDeviceDriver): void {
  if (drivers.some((existing) => existing.id === driver.id)) return;
  drivers.push(driver);
}

/** First registered driver that matches this advertisement, in registration order, or null if none does. */
export function findVitalsDeviceDriver(advertisement: BleAdvertisement): VitalsDeviceDriver | null {
  return drivers.find((driver) => driver.matches(advertisement)) ?? null;
}

export function listRegisteredVitalsDeviceDrivers(): VitalsDeviceDriver[] {
  return [...drivers];
}

export function __resetVitalsDeviceDriverRegistryForTests(): void {
  drivers.length = 0;
}

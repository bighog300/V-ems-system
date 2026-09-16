import { genericIeee11073HdpDriver } from "./drivers/genericIeee11073HdpDriver.ts";
import { registerVitalsDeviceDriver } from "./driverRegistry.ts";

/**
 * Registers every built-in vitals driver this app ships with. A future
 * named-vendor driver (Stage 15 milestone 15g) registers itself here too
 * -- the scan/connect/normalize pipeline (blePipeline.ts,
 * driverRegistry.ts) never changes to add one.
 */
export function registerBuiltInVitalsDrivers(): void {
  registerVitalsDeviceDriver(genericIeee11073HdpDriver);
}

export { connectAndStreamVitals, type VitalsStreamHandle } from "./blePipeline.ts";
export type { BleAdvertisement, BleConnection, BleTransport, VitalsDeviceDriver, VitalsReading } from "./bleTypes.ts";
export { findVitalsDeviceDriver, listRegisteredVitalsDeviceDrivers, registerVitalsDeviceDriver } from "./driverRegistry.ts";

import type { BleAdvertisement, BleTransport, VitalsReading } from "./bleTypes.ts";
import { findVitalsDeviceDriver } from "./driverRegistry.ts";

export interface VitalsStreamHandle {
  stop: () => Promise<void>;
}

/**
 * Connects to a device and streams normalized vitals readings from it,
 * proving the driver framework end-to-end: registry match -> connect ->
 * driver-specific subscribe -> normalized reading, all the way out to the
 * caller, without any vendor-specific code above this function.
 */
export async function connectAndStreamVitals(
  transport: BleTransport,
  advertisement: BleAdvertisement,
  onReading: (reading: VitalsReading) => void
): Promise<VitalsStreamHandle> {
  const driver = findVitalsDeviceDriver(advertisement);
  if (!driver) throw new Error(`No registered vitals driver matches device ${advertisement.deviceId}`);

  const connection = await transport.connect(advertisement.deviceId);
  const stopStreaming = driver.startStreaming(connection, advertisement, onReading);

  return {
    stop: async () => {
      stopStreaming();
      await connection.disconnect();
    }
  };
}

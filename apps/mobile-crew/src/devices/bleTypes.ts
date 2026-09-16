import type { VitalSigns } from "../api/observations.ts";

/**
 * The boundary this app depends on for BLE, deliberately not yet
 * implemented against a real native BLE stack (react-native-ble-plx or
 * similar). Scoped to Stage 15 milestone 15e: the driver framework and a
 * generic standards-compliant driver need to be provable end-to-end
 * against a fake transport, exactly like the OpenEMR/Vtiger
 * adapter/mapper/transport pattern this mirrors is already tested against
 * fake transports rather than live systems. Wiring a real native BLE
 * library (an Expo config plugin, platform permissions, a genuine
 * scan/connect flow) is real, physical-hardware-validated work that
 * belongs with 15g's first named-vendor driver -- the only point at which
 * it can actually be tested against a real device.
 */
export interface BleAdvertisement {
  deviceId: string;
  localName: string | null;
  /** Advertised service UUIDs, in whatever form the platform reports them (short or full 128-bit) -- use normalizeUuid() before comparing. */
  serviceUuids: string[];
}

export interface BleConnection {
  /**
   * Subscribes to notifications on a GATT characteristic. Returns an
   * unsubscribe function. `serviceUuid`/`characteristicUuid` may be
   * short-form (e.g. "180d") or full 128-bit -- a real transport
   * implementation is responsible for resolving whichever form the
   * platform's BLE stack expects.
   */
  subscribeToCharacteristic(serviceUuid: string, characteristicUuid: string, onValue: (value: Uint8Array) => void): () => void;
  disconnect(): Promise<void>;
}

export interface BleTransport {
  /** Starts scanning for nearby BLE peripherals. Returns a function that stops the scan. */
  startScan(onAdvertisement: (advertisement: BleAdvertisement) => void): () => void;
  connect(deviceId: string): Promise<BleConnection>;
}

/**
 * The normalized reading shape every driver, regardless of vendor wire
 * format, must resolve to -- the same shape
 * clinical_observations.vital_signs already uses server-side (see
 * api/observations.ts's VitalSigns, which is this app's existing client
 * type for that same shape). No vendor-specific data exists above the
 * driver boundary.
 */
export interface VitalsReading {
  vitalSigns: Partial<VitalSigns>;
  recordedAt: string;
  /** Which characteristic produced this reading, for diagnostics/provenance -- not part of the clinical shape itself. */
  sourceCharacteristicUuid: string;
}

export interface VitalsDeviceDriver {
  id: string;
  label: string;
  /** Whether this driver can handle the device that sent this advertisement. */
  matches(advertisement: BleAdvertisement): boolean;
  /**
   * Subscribes to whatever characteristics this driver understands and
   * normalizes their notifications into VitalsReadings. `advertisement`
   * is the same advertisement matches() was called with, so a driver that
   * supports several optional services (e.g. the generic driver's heart
   * rate/blood pressure/pulse oximeter trio) only subscribes to the ones
   * this specific device actually exposes. Returns a function that stops
   * all streaming for this driver.
   */
  startStreaming(connection: BleConnection, advertisement: BleAdvertisement, onReading: (reading: VitalsReading) => void): () => void;
}

import type { VitalSigns } from "../api/observations.ts";

/**
 * A vendor-neutral seam for importing structured vital-sign readings from
 * an external monitor/defibrillator. No vendor SDK is integrated yet —
 * Bluetooth/USB pairing, vendor-specific wire protocols, and any
 * regulatory considerations are all out of scope for Stage 11 (see the
 * Stage 11 plan's design decisions). This interface exists so that when a
 * specific device integration is scoped later, it plugs in behind a
 * contract `VitalsScreen` already knows how to consume, rather than that
 * screen being rewritten around whichever vendor comes first.
 *
 * `VitalSigns`'s field names are reused directly (rather than a parallel
 * "parameter" enum) so a `DeviceImportResult` maps onto the existing
 * `createPatientCaseObservation` payload with no translation step.
 */
export interface DeviceImportMetadata {
  deviceVendor: string;
  deviceModel: string | null;
  deviceSerial: string | null;
  /** The device's own capture timestamp, ISO 8601, when the device reports one. */
  capturedAt: string | null;
}

export interface DeviceImportResult {
  vitalSigns: VitalSigns;
  metadata: DeviceImportMetadata;
}

export interface DeviceImportProvider {
  /** Human-readable name for a device picker, e.g. "Zoll X Series". */
  readonly displayName: string;
  /** Whether this provider is currently usable (paired, in range, etc.) — checked before offering it as an option. */
  isAvailable(): Promise<boolean>;
  /** Performs the import. Rejects if the device is unreachable or the read fails. */
  importReading(): Promise<DeviceImportResult>;
}

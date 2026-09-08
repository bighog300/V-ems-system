import assert from "node:assert/strict";
import { test } from "node:test";

import type { DeviceImportProvider, DeviceImportResult } from "../src/integrations/deviceImport.ts";

// No vendor implementation exists yet (Stage 11 design decision — this is a
// seam, not a feature). This fake exists only to guard the interface shape
// against an accidental breaking change, exercised the same way a future
// real provider would be.
function fakeProvider(available: boolean, result: DeviceImportResult): DeviceImportProvider {
  return {
    displayName: "Fake Monitor",
    isAvailable: async () => available,
    importReading: async () => result
  };
}

test("a DeviceImportProvider reports availability before importing", async () => {
  const provider = fakeProvider(true, { vitalSigns: { heart_rate_bpm: 88 }, metadata: { deviceVendor: "Acme", deviceModel: "M1", deviceSerial: "SN-1", capturedAt: "2026-09-08T10:00:00.000Z" } });
  assert.equal(await provider.isAvailable(), true);
});

test("a DeviceImportProvider's importReading resolves to vitals mapping directly onto the observation payload shape", async () => {
  const provider = fakeProvider(true, {
    vitalSigns: { heart_rate_bpm: 92, spo2_pct: 97, blood_pressure_systolic: 118, blood_pressure_diastolic: 76 },
    metadata: { deviceVendor: "Acme", deviceModel: null, deviceSerial: null, capturedAt: null }
  });
  const result = await provider.importReading();
  assert.deepEqual(result.vitalSigns, { heart_rate_bpm: 92, spo2_pct: 97, blood_pressure_systolic: 118, blood_pressure_diastolic: 76 });
  assert.equal(result.metadata.deviceVendor, "Acme");
});

test("a DeviceImportProvider can report unavailable without importReading ever being called", async () => {
  let called = false;
  const provider: DeviceImportProvider = {
    displayName: "Fake Monitor",
    isAvailable: async () => false,
    importReading: async () => {
      called = true;
      throw new Error("should not be called when unavailable");
    }
  };
  assert.equal(await provider.isAvailable(), false);
  assert.equal(called, false);
});

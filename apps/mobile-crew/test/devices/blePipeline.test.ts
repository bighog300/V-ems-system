import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

import { connectAndStreamVitals } from "../../src/devices/blePipeline.ts";
import { __resetVitalsDeviceDriverRegistryForTests, registerVitalsDeviceDriver } from "../../src/devices/driverRegistry.ts";
import { genericIeee11073HdpDriver } from "../../src/devices/drivers/genericIeee11073HdpDriver.ts";
import type { BleConnection, BleTransport } from "../../src/devices/bleTypes.ts";

beforeEach(() => {
  __resetVitalsDeviceDriverRegistryForTests();
  registerVitalsDeviceDriver(genericIeee11073HdpDriver);
});

function fakeTransport() {
  let pushValue: ((characteristicUuid: string, value: Uint8Array) => void) | null = null;
  let disconnected = false;
  const transport: BleTransport = {
    startScan: () => () => {},
    connect: async () => {
      const subscriptions = new Map<string, (value: Uint8Array) => void>();
      const connection: BleConnection = {
        subscribeToCharacteristic: (serviceUuid, characteristicUuid, onValue) => {
          subscriptions.set(characteristicUuid, onValue);
          return () => subscriptions.delete(characteristicUuid);
        },
        disconnect: async () => {
          disconnected = true;
        }
      };
      pushValue = (characteristicUuid, value) => subscriptions.get(characteristicUuid)?.(value);
      return connection;
    }
  };
  return {
    transport,
    push: (characteristicUuid: string, value: Uint8Array) => pushValue?.(characteristicUuid, value),
    isDisconnected: () => disconnected
  };
}

test("connectAndStreamVitals wires registry match -> connect -> driver subscribe -> normalized reading end-to-end", async () => {
  const { transport, push } = fakeTransport();
  const readings: unknown[] = [];

  const handle = await connectAndStreamVitals(transport, { deviceId: "dev-1", localName: "Generic Monitor", serviceUuids: ["180d"] }, (reading) =>
    readings.push(reading)
  );

  push("2a37", new Uint8Array([0x00, 72]));

  assert.equal(readings.length, 1);
  assert.deepEqual((readings[0] as any).vitalSigns, { heart_rate_bpm: 72 });

  await handle.stop();
});

test("connectAndStreamVitals's stop() disconnects the underlying connection", async () => {
  const { transport, isDisconnected } = fakeTransport();

  const handle = await connectAndStreamVitals(transport, { deviceId: "dev-1", localName: null, serviceUuids: ["180d"] }, () => {});
  assert.equal(isDisconnected(), false);

  await handle.stop();
  assert.equal(isDisconnected(), true);
});

test("connectAndStreamVitals rejects when no registered driver matches the advertisement", async () => {
  const { transport } = fakeTransport();

  await assert.rejects(
    () => connectAndStreamVitals(transport, { deviceId: "dev-1", localName: "Unknown device", serviceUuids: ["ffff"] }, () => {}),
    /No registered vitals driver matches device dev-1/
  );
});

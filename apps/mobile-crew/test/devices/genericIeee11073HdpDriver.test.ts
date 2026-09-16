import assert from "node:assert/strict";
import { test } from "node:test";

import { genericIeee11073HdpDriver } from "../../src/devices/drivers/genericIeee11073HdpDriver.ts";
import type { BleConnection } from "../../src/devices/bleTypes.ts";

function fakeConnection() {
  const subscriptions = new Map<string, (value: Uint8Array) => void>();
  const unsubscribed = new Set<string>();
  const connection: BleConnection = {
    subscribeToCharacteristic: (serviceUuid, characteristicUuid, onValue) => {
      const key = `${serviceUuid}/${characteristicUuid}`;
      subscriptions.set(key, onValue);
      return () => {
        unsubscribed.add(key);
        subscriptions.delete(key);
      };
    },
    disconnect: async () => {}
  };
  return {
    connection,
    push: (characteristicUuid: string, value: Uint8Array) => {
      for (const [key, onValue] of subscriptions) {
        if (key.endsWith(`/${characteristicUuid}`)) onValue(value);
      }
    },
    subscriptionCount: () => subscriptions.size,
    wasUnsubscribed: (serviceUuid: string, characteristicUuid: string) => unsubscribed.has(`${serviceUuid}/${characteristicUuid}`)
  };
}

test("matches() is true when the advertisement includes any of the three supported services", () => {
  assert.ok(genericIeee11073HdpDriver.matches({ deviceId: "dev-1", localName: null, serviceUuids: ["180d"] }));
  assert.ok(genericIeee11073HdpDriver.matches({ deviceId: "dev-1", localName: null, serviceUuids: ["1810"] }));
  assert.ok(genericIeee11073HdpDriver.matches({ deviceId: "dev-1", localName: null, serviceUuids: ["1822"] }));
  assert.ok(genericIeee11073HdpDriver.matches({ deviceId: "dev-1", localName: null, serviceUuids: ["0000180d-0000-1000-8000-00805f9b34fb"] }));
});

test("matches() is false when the advertisement has none of the supported services", () => {
  assert.equal(genericIeee11073HdpDriver.matches({ deviceId: "dev-1", localName: null, serviceUuids: ["180f"] }), false);
  assert.equal(genericIeee11073HdpDriver.matches({ deviceId: "dev-1", localName: null, serviceUuids: [] }), false);
});

test("startStreaming only subscribes to the services this specific device actually advertised", () => {
  const { connection, subscriptionCount } = fakeConnection();
  const stop = genericIeee11073HdpDriver.startStreaming(connection, { deviceId: "dev-1", localName: null, serviceUuids: ["180d"] }, () => {});
  assert.equal(subscriptionCount(), 1);
  stop();
});

test("a heart rate notification produces a normalized heart_rate_bpm reading", () => {
  const { connection, push } = fakeConnection();
  const readings: unknown[] = [];
  genericIeee11073HdpDriver.startStreaming(connection, { deviceId: "dev-1", localName: null, serviceUuids: ["180d"] }, (reading) => readings.push(reading));

  push("2a37", new Uint8Array([0x00, 72]));

  assert.equal(readings.length, 1);
  assert.deepEqual((readings[0] as any).vitalSigns, { heart_rate_bpm: 72 });
  assert.equal((readings[0] as any).sourceCharacteristicUuid, "00002a37-0000-1000-8000-00805f9b34fb");
});

test("a blood pressure notification produces normalized systolic/diastolic readings", () => {
  const { connection, push } = fakeConnection();
  const readings: unknown[] = [];
  genericIeee11073HdpDriver.startStreaming(connection, { deviceId: "dev-1", localName: null, serviceUuids: ["1810"] }, (reading) => readings.push(reading));

  // flags=mmHg, systolic 120 (SFLOAT mantissa 120 exp 0 = 0x0078), diastolic 80 (0x0050), MAP 93 (0x005D)
  push("2a35", new Uint8Array([0x00, 0x78, 0x00, 0x50, 0x00, 0x5d, 0x00]));

  assert.deepEqual((readings[0] as any).vitalSigns, { blood_pressure_systolic: 120, blood_pressure_diastolic: 80 });
});

test("a pulse oximeter notification produces a normalized spo2_pct reading", () => {
  const { connection, push } = fakeConnection();
  const readings: unknown[] = [];
  genericIeee11073HdpDriver.startStreaming(connection, { deviceId: "dev-1", localName: null, serviceUuids: ["1822"] }, (reading) => readings.push(reading));

  // spo2 97 (0x0061), pulse rate 88 (0x0058) -- pulse rate itself isn't surfaced by this driver
  push("2a5f", new Uint8Array([0x00, 0x61, 0x00, 0x58, 0x00]));

  assert.deepEqual((readings[0] as any).vitalSigns, { spo2_pct: 97 });
});

test("an unparseable notification (too short) never calls onReading", () => {
  const { connection, push } = fakeConnection();
  const readings: unknown[] = [];
  genericIeee11073HdpDriver.startStreaming(connection, { deviceId: "dev-1", localName: null, serviceUuids: ["180d"] }, (reading) => readings.push(reading));

  push("2a37", new Uint8Array([]));

  assert.equal(readings.length, 0);
});

test("stop() unsubscribes every characteristic this driver subscribed to", () => {
  const { connection, wasUnsubscribed } = fakeConnection();
  const stop = genericIeee11073HdpDriver.startStreaming(
    connection,
    { deviceId: "dev-1", localName: null, serviceUuids: ["180d", "1810", "1822"] },
    () => {}
  );

  stop();

  assert.ok(wasUnsubscribed("180d", "2a37"));
  assert.ok(wasUnsubscribed("1810", "2a35"));
  assert.ok(wasUnsubscribed("1822", "2a5f"));
});

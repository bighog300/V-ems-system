import test from "node:test";
import assert from "node:assert/strict";
import { LifenetAdapterClient } from "../src/adapters/lifenet/lifenet-adapter-client.mjs";

test("fetchCaseVitals rejects when no transport is configured", async () => {
  const client = new LifenetAdapterClient();
  await assert.rejects(() => client.fetchCaseVitals("LP15-CASE-1"), /LIFENET adapter fetchCaseVitals failed/);
});

test("fetchCaseVitals calls the transport with the case reference and normalizes each reading", async () => {
  let capturedPayload;
  const client = new LifenetAdapterClient({
    transport: async ({ method, payload }) => {
      capturedPayload = payload;
      assert.equal(method, "fetchCaseVitals");
      return [
        { recorded_at: "2026-09-17T10:05:00.000Z", heart_rate_bpm: 92, spo2_pct: 96 },
        { recorded_at: "2026-09-17T10:00:00.000Z", heart_rate_bpm: 88 }
      ];
    }
  });

  const readings = await client.fetchCaseVitals("LP15-CASE-1");
  assert.deepEqual(capturedPayload, { case_reference: "LP15-CASE-1" });
  // sorted oldest first, regardless of transport order
  assert.deepEqual(readings, [
    { recordedAt: "2026-09-17T10:00:00.000Z", vitalSigns: { heart_rate_bpm: 88 } },
    { recordedAt: "2026-09-17T10:05:00.000Z", vitalSigns: { heart_rate_bpm: 92, spo2_pct: 96 } }
  ]);
});

test("fetchCaseVitals accepts a { readings: [...] } wrapper shape", async () => {
  const client = new LifenetAdapterClient({
    transport: async () => ({ readings: [{ recorded_at: "2026-09-17T10:00:00.000Z", spo2_pct: 97 }] })
  });

  const readings = await client.fetchCaseVitals("LP15-CASE-1");
  assert.equal(readings.length, 1);
  assert.equal(readings[0].vitalSigns.spo2_pct, 97);
});

test("fetchCaseVitals drops a reading with no valid recorded_at", async () => {
  const client = new LifenetAdapterClient({
    transport: async () => [{ heart_rate_bpm: 88 }, { recorded_at: "not-a-date", heart_rate_bpm: 90 }]
  });

  assert.deepEqual(await client.fetchCaseVitals("LP15-CASE-1"), []);
});

test("fetchCaseVitals drops a reading with no recognized vital-sign field", async () => {
  const client = new LifenetAdapterClient({
    transport: async () => [{ recorded_at: "2026-09-17T10:00:00.000Z", some_unknown_field: 42 }]
  });

  assert.deepEqual(await client.fetchCaseVitals("LP15-CASE-1"), []);
});

test("fetchCaseVitals drops unrecognized fields but keeps every known vital sign present", async () => {
  const client = new LifenetAdapterClient({
    transport: async () => [{
      recorded_at: "2026-09-17T10:00:00.000Z",
      heart_rate_bpm: 80,
      blood_pressure_systolic: 120,
      blood_pressure_diastolic: 80,
      respiratory_rate_bpm: 16,
      spo2_pct: 98,
      temperature_c: 37.1,
      device_serial: "SN-999",
      gcs_total: 15
    }]
  });

  const [reading] = await client.fetchCaseVitals("LP15-CASE-1");
  assert.deepEqual(reading.vitalSigns, {
    heart_rate_bpm: 80,
    blood_pressure_systolic: 120,
    blood_pressure_diastolic: 80,
    respiratory_rate_bpm: 16,
    spo2_pct: 98,
    temperature_c: 37.1
  });
});

test("fetchCaseVitals wraps a transport error with a classification", async () => {
  const client = new LifenetAdapterClient({
    transport: async () => {
      const error = new Error("boom");
      error.code = "DOWNSTREAM_UNAVAILABLE";
      throw error;
    }
  });

  await assert.rejects(() => client.fetchCaseVitals("LP15-CASE-1"), (error) => {
    assert.match(error.message, /LIFENET adapter fetchCaseVitals failed: boom/);
    assert.equal(error.classification, "DOWNSTREAM_UNAVAILABLE");
    return true;
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseBloodPressureMeasurement,
  parseHeartRateMeasurement,
  parsePulseOximeterMeasurement,
  parseSFloat
} from "../../src/devices/gattParsers.ts";

test("parseSFloat decodes a positive integer value (mantissa=72, exponent=0)", () => {
  // 0x0048 = mantissa 0x048 (72), exponent 0 -> 72 * 10^0 = 72
  assert.equal(parseSFloat(0x0048), 72);
});

test("parseSFloat decodes a value with a negative exponent (mantissa=1200, exponent=-1 -> 120.0)", () => {
  // exponent nibble 0xF = -1 (sign-extended), mantissa 1200 (0x4b0)
  const raw = (0xf << 12) | 0x4b0;
  assert.equal(parseSFloat(raw), 120);
});

test("parseSFloat decodes a negative mantissa correctly", () => {
  // mantissa -5 (0xffb in 12-bit two's complement), exponent 0
  const raw = 0x0ffb;
  assert.equal(parseSFloat(raw), -5);
});

test("parseSFloat returns NaN for the reserved NaN mantissa (0x07FF)", () => {
  assert.ok(Number.isNaN(parseSFloat(0x07ff)));
});

test("parseSFloat returns NaN for the reserved NRes mantissa (0x0800)", () => {
  assert.ok(Number.isNaN(parseSFloat(0x0800)));
});

test("parseSFloat returns +/-Infinity for the reserved infinity mantissas", () => {
  assert.equal(parseSFloat(0x07fe), Infinity);
  assert.equal(parseSFloat(0x0802), -Infinity);
});

test("parseHeartRateMeasurement decodes a UINT8 heart rate (flags bit0=0)", () => {
  const bytes = new Uint8Array([0x00, 72]);
  assert.equal(parseHeartRateMeasurement(bytes), 72);
});

test("parseHeartRateMeasurement decodes a UINT16 little-endian heart rate (flags bit0=1)", () => {
  // 300 bpm (implausible clinically, but exercises the 16-bit path): 0x012C little-endian = [0x2C, 0x01]
  const bytes = new Uint8Array([0x01, 0x2c, 0x01]);
  assert.equal(parseHeartRateMeasurement(bytes), 300);
});

test("parseHeartRateMeasurement returns null for a too-short payload", () => {
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x00])), null);
  assert.equal(parseHeartRateMeasurement(new Uint8Array([0x01, 0x2c])), null);
});

function sfloatBytesLE(mantissa: number, exponent: number): [number, number] {
  const raw = (((exponent < 0 ? exponent + 0x10 : exponent) & 0x0f) << 12) | ((mantissa < 0 ? mantissa + 0x1000 : mantissa) & 0x0fff);
  return [raw & 0xff, (raw >> 8) & 0xff];
}

test("parseBloodPressureMeasurement decodes mmHg systolic/diastolic", () => {
  const [sysLo, sysHi] = sfloatBytesLE(120, 0);
  const [diaLo, diaHi] = sfloatBytesLE(80, 0);
  const [mapLo, mapHi] = sfloatBytesLE(93, 0);
  const bytes = new Uint8Array([0x00, sysLo, sysHi, diaLo, diaHi, mapLo, mapHi]);
  assert.deepEqual(parseBloodPressureMeasurement(bytes), { systolic: 120, diastolic: 80 });
});

test("parseBloodPressureMeasurement converts kPa to mmHg when the units flag is set", () => {
  // 16 kPa systolic ~= 120.01 mmHg, 10.67 kPa diastolic ~= 80.01 mmHg
  const [sysLo, sysHi] = sfloatBytesLE(160, -1);
  const [diaLo, diaHi] = sfloatBytesLE(1067, -2);
  const [mapLo, mapHi] = sfloatBytesLE(1240, -2);
  const bytes = new Uint8Array([0x01, sysLo, sysHi, diaLo, diaHi, mapLo, mapHi]);
  const result = parseBloodPressureMeasurement(bytes);
  assert.ok(result);
  assert.equal(Math.round(result!.systolic), 120);
  assert.equal(Math.round(result!.diastolic), 80);
});

test("parseBloodPressureMeasurement returns null for a too-short payload", () => {
  assert.equal(parseBloodPressureMeasurement(new Uint8Array([0x00, 0x01, 0x02])), null);
});

test("parseBloodPressureMeasurement returns null when systolic decodes to the reserved NaN SFLOAT", () => {
  // raw 0x07FF (mantissa 0x7FF, the reserved NaN value) little-endian = [0xFF, 0x07]
  const bytes = new Uint8Array([0x00, 0xff, 0x07, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(parseBloodPressureMeasurement(bytes), null);
});

test("parsePulseOximeterMeasurement decodes SpO2 and pulse rate", () => {
  const [spo2Lo, spo2Hi] = sfloatBytesLE(97, 0);
  const [pulseLo, pulseHi] = sfloatBytesLE(88, 0);
  const bytes = new Uint8Array([0x00, spo2Lo, spo2Hi, pulseLo, pulseHi]);
  assert.deepEqual(parsePulseOximeterMeasurement(bytes), { spo2Pct: 97, pulseRateBpm: 88 });
});

test("parsePulseOximeterMeasurement returns null for a too-short payload", () => {
  assert.equal(parsePulseOximeterMeasurement(new Uint8Array([0x00, 0x01])), null);
});

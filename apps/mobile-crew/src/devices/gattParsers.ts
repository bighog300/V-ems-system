// Parsers for the standard Bluetooth SIG GATT services a Bluetooth Health
// Device Profile / IEEE 11073-compliant vitals monitor exposes. Every
// value/byte-layout decision here follows the published GATT
// Specification Supplement characteristic definitions -- nothing here is
// vendor-specific, which is exactly the point of the generic driver this
// module backs (drivers/genericIeee11073HdpDriver.ts).

// Bluetooth SIG 16-bit assigned numbers (services and characteristics).
export const HEART_RATE_SERVICE_UUID = "180d";
export const HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID = "2a37";
export const BLOOD_PRESSURE_SERVICE_UUID = "1810";
export const BLOOD_PRESSURE_MEASUREMENT_CHARACTERISTIC_UUID = "2a35";
export const PULSE_OXIMETER_SERVICE_UUID = "1822";
export const PULSE_OXIMETER_CONTINUOUS_MEASUREMENT_CHARACTERISTIC_UUID = "2a5f";

const KPA_TO_MMHG = 7.500615858;

/**
 * Decodes a 16-bit IEEE 11073-20601 SFLOAT: a 4-bit signed exponent (bits
 * 15-12) and a 12-bit signed mantissa (bits 11-0), value = mantissa *
 * 10^exponent. Blood pressure and pulse oximeter measurements both encode
 * their values this way. Reserved special mantissa values (NaN, "not at
 * this resolution", +/-infinity) all come back as a non-finite number --
 * callers treat any non-finite result as "no valid reading".
 */
export function parseSFloat(raw: number): number {
  const rawMantissa = raw & 0x0fff;
  const rawExponent = (raw >> 12) & 0x0f;

  if (rawMantissa === 0x07ff || rawMantissa === 0x0800) return NaN;
  if (rawMantissa === 0x07fe) return Infinity;
  if (rawMantissa === 0x0802) return -Infinity;

  const mantissa = rawMantissa >= 0x0800 ? rawMantissa - 0x1000 : rawMantissa;
  const exponent = rawExponent >= 0x8 ? rawExponent - 0x10 : rawExponent;
  return mantissa * Math.pow(10, exponent);
}

/**
 * Heart Rate Measurement (0x2A37). Flags bit 0 selects UINT8 vs UINT16
 * (little-endian) for the heart rate value; energy-expended and
 * RR-interval fields, if present, are ignored -- this driver only
 * surfaces heart_rate_bpm.
 */
export function parseHeartRateMeasurement(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const isUint16 = (bytes[0] & 0x01) === 1;
  if (isUint16) {
    if (bytes.length < 3) return null;
    return bytes[1] | (bytes[2] << 8);
  }
  return bytes[1];
}

/**
 * Blood Pressure Measurement (0x2A35). Flags bit 0 selects mmHg vs kPa
 * units; systolic/diastolic/MAP each follow as little-endian SFLOATs, in
 * that order, with MAP and any optional trailing fields (timestamp, pulse
 * rate, user id, measurement status) ignored here.
 */
export function parseBloodPressureMeasurement(bytes: Uint8Array): { systolic: number; diastolic: number } | null {
  if (bytes.length < 7) return null;
  const isKPa = (bytes[0] & 0x01) === 1;
  let systolic = parseSFloat(bytes[1] | (bytes[2] << 8));
  let diastolic = parseSFloat(bytes[3] | (bytes[4] << 8));
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
  if (isKPa) {
    systolic *= KPA_TO_MMHG;
    diastolic *= KPA_TO_MMHG;
  }
  return { systolic: Math.round(systolic), diastolic: Math.round(diastolic) };
}

/**
 * PLX Continuous Measurement (0x2A5F). SpO2 and pulse rate each follow as
 * little-endian SFLOATs immediately after the flags byte; any optional
 * trailing fields (fast/slow averages, measurement/sensor status, pulse
 * amplitude index) are ignored here.
 */
export function parsePulseOximeterMeasurement(bytes: Uint8Array): { spo2Pct: number; pulseRateBpm: number } | null {
  if (bytes.length < 5) return null;
  const spo2 = parseSFloat(bytes[1] | (bytes[2] << 8));
  const pulseRate = parseSFloat(bytes[3] | (bytes[4] << 8));
  if (!Number.isFinite(spo2) || !Number.isFinite(pulseRate)) return null;
  return { spo2Pct: Math.round(spo2), pulseRateBpm: Math.round(pulseRate) };
}

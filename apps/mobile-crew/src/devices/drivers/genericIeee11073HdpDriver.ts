import type { BleAdvertisement, BleConnection, VitalsDeviceDriver, VitalsReading } from "../bleTypes.ts";
import { normalizeUuid, uuidsMatch } from "../bleUuid.ts";
import {
  BLOOD_PRESSURE_MEASUREMENT_CHARACTERISTIC_UUID,
  BLOOD_PRESSURE_SERVICE_UUID,
  HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID,
  HEART_RATE_SERVICE_UUID,
  parseBloodPressureMeasurement,
  parseHeartRateMeasurement,
  parsePulseOximeterMeasurement,
  PULSE_OXIMETER_CONTINUOUS_MEASUREMENT_CHARACTERISTIC_UUID,
  PULSE_OXIMETER_SERVICE_UUID
} from "../gattParsers.ts";

const SUPPORTED_SERVICES = [
  { serviceUuid: HEART_RATE_SERVICE_UUID, characteristicUuid: HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID },
  { serviceUuid: BLOOD_PRESSURE_SERVICE_UUID, characteristicUuid: BLOOD_PRESSURE_MEASUREMENT_CHARACTERISTIC_UUID },
  { serviceUuid: PULSE_OXIMETER_SERVICE_UUID, characteristicUuid: PULSE_OXIMETER_CONTINUOUS_MEASUREMENT_CHARACTERISTIC_UUID }
] as const;

function normalizeReading(characteristicUuid: string, bytes: Uint8Array): VitalsReading["vitalSigns"] | null {
  if (uuidsMatch(characteristicUuid, HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID)) {
    const heartRate = parseHeartRateMeasurement(bytes);
    return heartRate === null ? null : { heart_rate_bpm: heartRate };
  }
  if (uuidsMatch(characteristicUuid, BLOOD_PRESSURE_MEASUREMENT_CHARACTERISTIC_UUID)) {
    const bloodPressure = parseBloodPressureMeasurement(bytes);
    return bloodPressure === null ? null : { blood_pressure_systolic: bloodPressure.systolic, blood_pressure_diastolic: bloodPressure.diastolic };
  }
  if (uuidsMatch(characteristicUuid, PULSE_OXIMETER_CONTINUOUS_MEASUREMENT_CHARACTERISTIC_UUID)) {
    const pulseOx = parsePulseOximeterMeasurement(bytes);
    return pulseOx === null ? null : { spo2_pct: pulseOx.spo2Pct };
  }
  return null;
}

/**
 * The generic IEEE 11073 Health Device Profile driver (Stage 15 milestone
 * 15e): the fallback baseline for any standards-compliant monitor, built
 * against the plain Bluetooth SIG GATT service definitions rather than
 * any vendor SDK. Matches an advertisement that exposes at least one of
 * the heart rate, blood pressure, or pulse oximeter services, and streams
 * whichever of those characteristics the device actually offers --
 * a monitor need not support all three.
 */
export const genericIeee11073HdpDriver: VitalsDeviceDriver = {
  id: "generic-ieee11073-hdp",
  label: "Generic IEEE 11073 HDP monitor",

  matches(advertisement: BleAdvertisement): boolean {
    const advertised = advertisement.serviceUuids.map(normalizeUuid);
    return SUPPORTED_SERVICES.some(({ serviceUuid }) => advertised.includes(normalizeUuid(serviceUuid)));
  },

  startStreaming(connection: BleConnection, advertisement: BleAdvertisement, onReading: (reading: VitalsReading) => void): () => void {
    const advertised = advertisement.serviceUuids.map(normalizeUuid);
    const offeredServices = SUPPORTED_SERVICES.filter(({ serviceUuid }) => advertised.includes(normalizeUuid(serviceUuid)));
    const unsubscribes = offeredServices.map(({ serviceUuid, characteristicUuid }) =>
      connection.subscribeToCharacteristic(serviceUuid, characteristicUuid, (value) => {
        const vitalSigns = normalizeReading(characteristicUuid, value);
        if (!vitalSigns) return;
        onReading({ vitalSigns, recordedAt: new Date().toISOString(), sourceCharacteristicUuid: normalizeUuid(characteristicUuid) });
      })
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }
};

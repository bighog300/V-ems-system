// Stage 15 milestone 15f: the device_pairings registry and reading
// provenance. A device_pairings row represents one physical monitor's
// pairing lifecycle -- paired to a vehicle, optionally linked to a
// specific patient case while it's actually in use on that patient, then
// unpaired. RBAC and audit trail follow the same conventions Stage 13
// already established for sensitive reads/writes (see
// retention/legal-hold.mjs for the precedent this mirrors).

import { randomUUID } from "node:crypto";
import { ApiError } from "@vems/shared";

const id = () => `DPR-${randomUUID()}`;

function requireText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) throw new ApiError("INVALID_PAYLOAD", `${name} is required`, 400);
  return value.trim();
}

async function requireVehicle(service, vehicleId) {
  const vehicle = await service.vehicles.findById(vehicleId);
  if (!vehicle) throw new ApiError("NOT_FOUND", `Vehicle ${vehicleId} not found`, 404);
  return vehicle;
}

async function requirePairing(service, pairingId) {
  const pairing = await service.devicePairings.find(pairingId);
  if (!pairing) throw new ApiError("NOT_FOUND", `Device pairing ${pairingId} not found`, 404);
  return pairing;
}

export const devicePairingMethods = {
  async pairDevice(vehicleId, payload, meta) {
    await requireVehicle(this, vehicleId);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError("INVALID_PAYLOAD", "Payload must be an object", 400);
    const record = {
      pairing_id: id(),
      serial_number: requireText(payload.serial_number, "serial_number"),
      vendor: requireText(payload.vendor, "vendor"),
      model: requireText(payload.model, "model"),
      vehicle_id: vehicleId,
      patient_case_id: null,
      paired_at: new Date().toISOString(),
      unpaired_at: null,
      created_at: new Date().toISOString(),
      correlation_id: meta.correlationId
    };
    await this.devicePairings.create(record);
    await this.audit("device_pairing", record.pairing_id, "pair_device", meta, undefined, record);
    await this.event("DevicePairingCreated", meta.correlationId, { pairing_id: record.pairing_id, vehicle_id: vehicleId, serial_number: record.serial_number });
    return record;
  },

  async getDevicePairing(pairingId) {
    return requirePairing(this, pairingId);
  },

  async listDevicePairingsForVehicle(vehicleId) {
    await requireVehicle(this, vehicleId);
    return this.devicePairings.listByVehicle(vehicleId);
  },

  /**
   * Traceability by physical unit: every pairing this serial number has
   * ever had, across every vehicle and patient case, so a unit later
   * found miscalibrated or recalled can be fully accounted for. Not
   * scoped to a vehicle or patient case for that reason.
   */
  async listDevicePairingsBySerial(serialNumber) {
    return this.devicePairings.listBySerial(requireText(serialNumber, "serial_number"));
  },

  async linkDevicePairingToPatientCase(pairingId, payload, meta) {
    const pairing = await requirePairing(this, pairingId);
    if (pairing.unpaired_at) throw new ApiError("CONFLICT", `Device pairing ${pairingId} has already been unpaired`, 409);
    const patientCaseId = requireText(payload?.patient_case_id, "patient_case_id");
    const patientCase = await this.getPatientCase(patientCaseId);
    const updated = { ...pairing, patient_case_id: patientCaseId, correlation_id: meta.correlationId };
    await this.devicePairings.save(updated);
    await this.audit("device_pairing", pairingId, "link_patient_case", meta, { patient_case_id: pairing.patient_case_id }, { patient_case_id: patientCaseId });
    await this.event("DevicePairingLinkedToPatientCase", meta.correlationId, { pairing_id: pairingId, patient_case_id: patientCaseId, incident_id: patientCase.incident_id });
    return this.getDevicePairing(pairingId);
  },

  async unpairDevice(pairingId, meta) {
    const pairing = await requirePairing(this, pairingId);
    if (pairing.unpaired_at) return pairing;
    const updated = { ...pairing, unpaired_at: new Date().toISOString(), correlation_id: meta.correlationId };
    await this.devicePairings.save(updated);
    await this.audit("device_pairing", pairingId, "unpair_device", meta, { unpaired_at: null }, { unpaired_at: updated.unpaired_at });
    await this.event("DevicePairingUnpaired", meta.correlationId, { pairing_id: pairingId });
    return this.getDevicePairing(pairingId);
  }
};

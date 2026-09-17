// Stage 15 milestone 15g: imports a LIFEPAK 15 case's vitals from
// Physio-Control's LIFENET System into a patient case's clinical
// observations, with full device-pairing provenance (15f). The pairing
// named in the request must already be linked to this patient case, and
// must actually be a Physio-Control LIFEPAK 15 pairing, before any
// import is accepted -- a crew member can't attribute LIFENET data to a
// device paired to a different patient's case, or to a pairing for a
// different (or generic) monitor.

import { ApiError } from "@vems/shared";

async function requireLifepak15Pairing(service, pairingId, patientCaseId) {
  const pairing = await service.devicePairings.find(pairingId);
  if (!pairing) throw new ApiError("NOT_FOUND", `Device pairing ${pairingId} not found`, 404);
  if (pairing.patient_case_id !== patientCaseId) throw new ApiError("CONFLICT", `Device pairing ${pairingId} is not linked to patient case ${patientCaseId}`, 409);
  if (pairing.vendor !== "Physio-Control" || pairing.model !== "LIFEPAK 15") {
    throw new ApiError("CONFLICT", `Device pairing ${pairingId} is not a Physio-Control LIFEPAK 15 pairing`, 409);
  }
  return pairing;
}

export const lifenetImportMethods = {
  async importLifenetCaseVitals(patientCaseId, payload, meta) {
    const current = await this.getPatientCase(patientCaseId);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError("INVALID_PAYLOAD", "Payload must be an object", 400);
    const caseReference = typeof payload.lifenet_case_reference === "string" ? payload.lifenet_case_reference.trim() : "";
    if (!caseReference) throw new ApiError("INVALID_PAYLOAD", "lifenet_case_reference is required", 400);
    if (typeof payload.device_pairing_id !== "string" || !payload.device_pairing_id.trim()) throw new ApiError("INVALID_PAYLOAD", "device_pairing_id is required", 400);

    await requireLifepak15Pairing(this, payload.device_pairing_id, patientCaseId);

    const readings = await this.lifenet.fetchCaseVitals(caseReference);
    const observations = [];
    for (const reading of readings) {
      // Each reading is its own clinical observation, so idempotencyKey is
      // deliberately stripped per-call -- reusing the outer request's key
      // across every reading in the loop would make createPatientCaseObservation's
      // own idempotency replay logic return the *first* reading's record for
      // every subsequent one. Re-importing the same LIFENET case twice will
      // therefore create duplicate observations; de-duplicating a re-import
      // by case_reference is a known follow-up, not silently handled here.
      const observation = await this.createPatientCaseObservation(
        patientCaseId,
        { recorded_at: reading.recordedAt, vital_signs: reading.vitalSigns, device_pairing_id: payload.device_pairing_id },
        { ...meta, idempotencyKey: undefined }
      );
      observations.push(observation);
    }

    await this.audit("lifenet_import", patientCaseId, "import_case_vitals", meta, undefined, {
      lifenet_case_reference: caseReference,
      device_pairing_id: payload.device_pairing_id,
      imported_count: observations.length
    });
    await this.event("LifenetCaseVitalsImported", meta.correlationId, {
      patient_case_id: patientCaseId,
      incident_id: current.incident_id,
      imported_count: observations.length
    });
    return { imported_count: observations.length, observations };
  }
};

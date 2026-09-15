// Stage 13 milestone 13g: the legal-hold toggle. Setting legal_hold=true
// on a patient case makes it permanently ineligible for the purge job
// (retention.mjs) regardless of retention_expires_at, until explicitly
// released -- the same posture a real EMS deployment needs for a case
// under litigation, subpoena or active investigation.

import { ApiError } from "@vems/shared";

async function requireCase(service, patientCaseId) {
  const record = await service.patientCases.find(patientCaseId);
  if (!record) throw new ApiError("NOT_FOUND", `Patient case ${patientCaseId} not found`, 404);
  return record;
}

export async function setPatientCaseLegalHold(service, patientCaseId, payload, meta) {
  if (typeof payload?.legal_hold !== "boolean") {
    throw new ApiError("INVALID_PAYLOAD", "legal_hold (boolean) is required", 400);
  }
  const before = await requireCase(service, patientCaseId);
  const now = new Date().toISOString();
  const after = { ...before, legal_hold: payload.legal_hold ? 1 : 0, updated_at: now, correlation_id: meta.correlationId };
  await service.patientCases.save(after);
  const action = payload.legal_hold ? "legal_hold_applied" : "legal_hold_released";
  await service.audit("patient_case", patientCaseId, action, meta, { legal_hold: Boolean(before.legal_hold) }, { legal_hold: Boolean(after.legal_hold), reason: payload.reason ?? null });
  await service.event(payload.legal_hold ? "PatientCaseLegalHoldApplied" : "PatientCaseLegalHoldReleased", meta.correlationId, { patient_case_id: patientCaseId, reason: payload.reason ?? null });
  return service.getPatientCase(patientCaseId);
}

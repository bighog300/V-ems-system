import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export const DISPOSITION_OUTCOMES = [
  "transported",
  "treated_not_transported",
  "refusal_assessment",
  "refusal_treatment",
  "refusal_transport",
  "no_patient_found",
  "left_scene",
  "transfer_other_provider",
  "cancelled_before_contact",
  "death_on_scene",
  "resuscitation_terminated"
] as const;

export type DispositionOutcome = (typeof DISPOSITION_OUTCOMES)[number];

export interface PatientCaseDisposition {
  disposition_id: string;
  patient_case_id: string;
  encounter_id: string | null;
  outcome: DispositionOutcome;
  destination_facility: string | null;
  receiving_provider: string | null;
  decision_at: string;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function getPatientCaseDisposition({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseDisposition | null> {
  const result = await requestJson<PatientCaseDisposition>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/disposition`, {
    config: { authToken }
  });
  return result.notFound ? null : (result.data ?? null);
}

export interface SetDispositionPayload {
  outcome: DispositionOutcome;
  destination_facility?: string;
  receiving_provider?: string;
  reason?: string;
  notes?: string;
}

export async function setPatientCaseDisposition({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: SetDispositionPayload }): Promise<PatientCaseDisposition> {
  const result = await requestJson<PatientCaseDisposition>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/disposition`, {
    method: "POST",
    payload,
    config: { authToken },
    headers: { "idempotency-key": `mobile-disposition-${patientCaseId}-${Date.now()}` }
  });
  if (!result.data) throw new Error("Disposition set returned no data");
  return result.data;
}

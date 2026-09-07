import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export const EPCR_STATES = ["draft", "crew_complete", "signed", "submitted", "qa_review", "returned_for_correction", "final"] as const;
export type EpcrState = (typeof EPCR_STATES)[number];

export const SIGNATURE_ROLES = ["crew_member", "treating_clinician", "patient", "guardian", "representative", "receiving_clinician", "witness"] as const;
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];

export interface EpcrReadinessItem {
  id: string;
  message: string;
}

export interface EpcrReadiness {
  ready: boolean;
  missing: EpcrReadinessItem[];
  warnings: EpcrReadinessItem[];
  requirements: Array<{ id: string; required: boolean; conditional: string; satisfied: boolean }>;
}

export interface EpcrLifecycle {
  current_state: EpcrState;
  events: Array<{ lifecycle_event_id: string; previous_state: string; new_state: string; occurred_at: string; reason: string | null }>;
}

export interface EpcrSignature {
  signature_id: string;
  patient_case_id: string;
  version_id: string;
  record_hash: string;
  signer_role: SignatureRole;
  signer_identity: string;
  signer_display_name: string | null;
  signed_at: string;
  acknowledgement: string;
}

export async function getEpcrReadiness({ apiBaseUrl, authToken, fetchImpl = fetch, patientCaseId }: ApiConfig & { patientCaseId: string }): Promise<EpcrReadiness> {
  const result = await requestJson<EpcrReadiness>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/readiness`, { config: { authToken } });
  if (!result.data) throw new Error("Readiness fetch returned no data");
  return result.data;
}

export async function getEpcrLifecycle({ apiBaseUrl, authToken, fetchImpl = fetch, patientCaseId }: ApiConfig & { patientCaseId: string }): Promise<EpcrLifecycle> {
  const result = await requestJson<EpcrLifecycle>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/lifecycle`, { config: { authToken } });
  if (!result.data) throw new Error("Lifecycle fetch returned no data");
  return result.data;
}

export async function listEpcrSignatures({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<EpcrSignature[]> {
  const result = await requestJson<EpcrSignature[]>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/signatures`, { config: { authToken } });
  return result.data ?? [];
}

export async function completeEpcr({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<{ lifecycle: EpcrLifecycle }> {
  const result = await requestJson<{ lifecycle: EpcrLifecycle }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/complete`, {
    method: "POST",
    payload: {},
    config: { authToken },
    headers: { "idempotency-key": `mobile-epcr-complete-${patientCaseId}-${Date.now()}` }
  });
  if (!result.data) throw new Error("Complete ePCR returned no data");
  return result.data;
}

export interface SignEpcrPayload {
  signer_role: SignatureRole;
  signer_identity: string;
  signer_display_name?: string;
}

export async function signEpcr({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: SignEpcrPayload }): Promise<EpcrSignature[]> {
  const result = await requestJson<EpcrSignature[]>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/signatures`, {
    method: "POST",
    payload,
    config: { authToken },
    headers: { "idempotency-key": `mobile-epcr-sign-${patientCaseId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  });
  return result.data ?? [];
}

export async function submitEpcr({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<EpcrLifecycle> {
  const result = await requestJson<EpcrLifecycle>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/submit`, {
    method: "POST",
    payload: {},
    config: { authToken },
    headers: { "idempotency-key": `mobile-epcr-submit-${patientCaseId}-${Date.now()}` }
  });
  if (!result.data) throw new Error("Submit ePCR returned no data");
  return result.data;
}

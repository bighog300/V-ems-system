import { requestJson } from "./httpClient.ts";
import type { ApiConfig, PatientCase } from "./patientCases.ts";

export interface PatientCandidate {
  patient_id: string;
  display_name: string;
}

export interface PatientSearchResult {
  match_status: "matched_existing" | "no_match" | "ambiguous" | string;
  match_confidence: number;
  patient_id: string | null;
  candidates: PatientCandidate[];
}

export interface SearchPatientsArgs extends ApiConfig {
  criteria: { first_name?: string; last_name?: string; dob?: string; sex?: string; phone?: string };
}

export async function searchPatients({ apiBaseUrl, authToken, fetchImpl = fetch, criteria }: SearchPatientsArgs): Promise<PatientSearchResult> {
  const result = await requestJson<PatientSearchResult>(fetchImpl, `${apiBaseUrl}/api/patients/search`, {
    method: "POST",
    payload: criteria,
    config: { authToken }
  });
  if (!result.data) throw new Error("Patient search returned no data");
  return result.data;
}

export interface CreatePatientArgs extends ApiConfig {
  patient: { first_name: string; last_name: string; dob: string; sex?: string; phone?: string };
}

export async function createPatient({ apiBaseUrl, authToken, fetchImpl = fetch, patient }: CreatePatientArgs): Promise<{ patient_id: string; display_name?: string }> {
  const result = await requestJson<{ patient_id: string; display_name?: string }>(fetchImpl, `${apiBaseUrl}/api/patients`, {
    method: "POST",
    payload: patient,
    config: { authToken },
    headers: { "idempotency-key": `mobile-create-patient-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  });
  if (!result.data) throw new Error("Patient create returned no data");
  return result.data;
}

export interface LinkPatientArgs extends ApiConfig {
  patientCaseId: string;
  verificationStatus: "matched_existing" | "created_new" | "verified" | "provisional";
  openemrPatientId: string;
}

export async function linkPatientToPatientCase({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  verificationStatus,
  openemrPatientId
}: LinkPatientArgs): Promise<{ patient_case_id: string; verification_status: string; openemr_patient_id: string }> {
  const result = await requestJson<{ patient_case_id: string; verification_status: string; openemr_patient_id: string }>(
    fetchImpl,
    `${apiBaseUrl}/api/patient-cases/${patientCaseId}/patient-link`,
    {
      method: "POST",
      payload: { verification_status: verificationStatus, openemr_patient_id: openemrPatientId },
      config: { authToken },
      headers: { "idempotency-key": `mobile-link-patient-${patientCaseId}-${Date.now()}` }
    }
  );
  if (!result.data) throw new Error("Patient link returned no data");
  return result.data;
}

export async function createProvisionalPatient({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCase> {
  const result = await requestJson<PatientCase>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/provisional-patient`, {
    method: "POST",
    config: { authToken },
    headers: { "idempotency-key": `mobile-provisional-${patientCaseId}-${Date.now()}` }
  });
  if (!result.data) throw new Error("Provisional patient create returned no data");
  return result.data;
}

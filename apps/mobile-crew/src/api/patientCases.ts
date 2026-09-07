import { requestJson } from "./httpClient.ts";

export interface PatientCase {
  patient_case_id: string;
  incident_id: string;
  patient_sequence: number;
  status: string;
  temporary_label: string | null;
  assignment_id: string | null;
  vehicle_id: string | null;
  lead_clinician_id: string | null;
  verification_status: string;
  openemr_patient_id: string | null;
  closure_ready: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientCaseDemographics {
  patient_case_id: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  preferred_name?: string;
  dob?: string;
  dob_unknown?: boolean;
  estimated_age_years?: number;
  sex?: string;
  gender_identity?: string;
  unidentified?: boolean;
  updated_at?: string;
}

export interface ApiConfig {
  apiBaseUrl: string;
  authToken: string;
  fetchImpl?: typeof fetch;
}

export async function getPatientCase({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCase> {
  const result = await requestJson<PatientCase>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}`, {
    config: { authToken }
  });
  if (!result.data) throw new Error("Patient case fetch returned no data");
  return result.data;
}

export async function listPatientCases({ apiBaseUrl, authToken, fetchImpl = fetch, incidentId }: ApiConfig & { incidentId: string }): Promise<PatientCase[]> {
  const result = await requestJson<{ patient_cases: PatientCase[] }>(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-cases`, {
    config: { authToken }
  });
  return result.data?.patient_cases ?? [];
}

export interface CreatePatientCasePayload {
  assignment_id?: string;
  lead_clinician_id?: string;
  temporary_label?: string;
}

export async function createPatientCase({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  incidentId,
  payload
}: ApiConfig & { incidentId: string; payload: CreatePatientCasePayload }): Promise<PatientCase> {
  const result = await requestJson<PatientCase>(fetchImpl, `${apiBaseUrl}/api/incidents/${incidentId}/patient-cases`, {
    method: "POST",
    payload,
    config: { authToken },
    headers: { "idempotency-key": `mobile-create-case-${incidentId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  });
  if (!result.data) throw new Error("Patient case create returned no data");
  return result.data;
}

export async function getPatientCaseDemographics({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseDemographics | null> {
  const result = await requestJson<PatientCaseDemographics | null>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/demographics`, {
    config: { authToken }
  });
  return result.data ?? null;
}

export async function savePatientCaseDemographics({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: Partial<PatientCaseDemographics> }): Promise<PatientCaseDemographics> {
  const result = await requestJson<PatientCaseDemographics>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/demographics`, {
    method: "PUT",
    payload,
    config: { authToken }
  });
  if (!result.data) throw new Error("Demographics save returned no data");
  return result.data;
}

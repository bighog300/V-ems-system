import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export interface PatientCaseAssessment {
  assessment_id: string;
  patient_case_id: string;
  encounter_id: string;
  section_type: string;
  payload: Record<string, unknown>;
  performed_at: string;
  clinician_id: string | null;
  created_at: string;
}

export async function listPatientCaseAssessments({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseAssessment[]> {
  const result = await requestJson<{ assessments: PatientCaseAssessment[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/assessments`, {
    config: { authToken }
  });
  return result.data?.assessments ?? [];
}

export async function createPatientCaseAssessment({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  sectionType,
  notes
}: ApiConfig & { patientCaseId: string; sectionType: string; notes: string }): Promise<PatientCaseAssessment> {
  const result = await requestJson<PatientCaseAssessment>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/assessments`, {
    method: "POST",
    payload: { section_type: sectionType, payload: { notes } },
    config: { authToken },
    headers: { "idempotency-key": `mobile-assessment-${patientCaseId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  });
  if (!result.data) throw new Error("Assessment create returned no data");
  return result.data;
}

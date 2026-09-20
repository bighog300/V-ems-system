import { requestJson } from "./httpClient.ts";
import { requestOrQueue } from "./offlineMutation.ts";
import { listWithQueued } from "../offline/queuedItems.ts";
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
  deviceId,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseAssessment[]> {
  const result = await requestJson<{ assessments: PatientCaseAssessment[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/assessments`, {
    config: { authToken, deviceId }
  });
  return result.data?.assessments ?? [];
}

export async function createPatientCaseAssessment({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId,
  sectionType,
  notes
}: ApiConfig & { patientCaseId: string; sectionType: string; notes: string }): Promise<PatientCaseAssessment> {
  const performedAt = new Date().toISOString();
  const body = { section_type: sectionType, payload: { notes }, performed_at: performedAt };
  return requestOrQueue<PatientCaseAssessment>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/assessments`,
    method: "POST",
    payload: body,
    config: { authToken, deviceId },
    scope: "assessment",
    patientCaseId,
    buildOptimisticResult: (entryId) => assessmentFromRequest(entryId, patientCaseId, body)
  });
}

type AssessmentRequest = { section_type: string; payload: { notes: string }; performed_at: string };

/** The list entry shown for an assessment that is still waiting to sync. */
export function assessmentFromRequest(entryId: string, patientCaseId: string, body: AssessmentRequest): PatientCaseAssessment {
  return {
    assessment_id: `LOCAL-${entryId}`,
    patient_case_id: patientCaseId,
    encounter_id: "",
    section_type: body.section_type,
    payload: body.payload,
    performed_at: body.performed_at,
    clinician_id: null,
    created_at: body.performed_at
  };
}

export function listPatientCaseAssessmentsWithQueued(args: ApiConfig & { patientCaseId: string }) {
  return listWithQueued<PatientCaseAssessment>({
    cacheKey: `patient-case-assessments:${args.patientCaseId}`,
    fetchFresh: () => listPatientCaseAssessments(args),
    scope: "assessment",
    patientCaseId: args.patientCaseId,
    idOf: (item) => item.assessment_id,
    fromQueued: (entry) => assessmentFromRequest(entry.entryId, entry.patientCaseId, entry.payload as AssessmentRequest)
  });
}

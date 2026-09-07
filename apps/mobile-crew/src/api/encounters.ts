import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export interface PatientCaseEncounter {
  patient_case_id: string;
  incident_id: string;
  linked_incident_id: string;
  openemr_patient_id: string;
  openemr_encounter_id: string;
  encounter_id: string;
  encounter_status: string;
  status: string;
  care_started_at: string;
  created_at: string;
  updated_at: string;
}

export async function getPatientCaseEncounter({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseEncounter | null> {
  const result = await requestJson<PatientCaseEncounter>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/encounter`, {
    config: { authToken }
  });
  return result.notFound ? null : (result.data ?? null);
}

export interface CreateEncounterPayload {
  care_started_at: string;
  presenting_complaint: string;
}

export async function createPatientCaseEncounter({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: CreateEncounterPayload }): Promise<PatientCaseEncounter> {
  const result = await requestJson<PatientCaseEncounter>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/encounters`, {
    method: "POST",
    payload,
    config: { authToken },
    headers: { "idempotency-key": `mobile-create-encounter-${patientCaseId}-${Date.now()}` }
  });
  if (!result.data) throw new Error("Encounter create returned no data");
  return result.data;
}

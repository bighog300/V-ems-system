import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export interface PatientHistoryMedication {
  medication_name: string | null;
  dose: string | null;
  frequency: string | null;
  status: string | null;
}

export interface PatientHistoryEncounter {
  encounter_date: string | null;
  reason: string | null;
  facility: string | null;
}

export interface PatientHistory {
  patient_case_id: string;
  openemr_patient_id: string;
  as_of: string | null;
  medications: PatientHistoryMedication[];
  encounters: PatientHistoryEncounter[];
}

/**
 * Deliberately calls requestJson directly rather than going through
 * cachedRequest.ts's withCache() -- this PHI must never reach the durable
 * offline cache (see src/history/patientHistoryStore.ts for where it does
 * live on-device: a short-lived, purge-on-handover, in-memory store).
 */
export async function getPatientCaseHistory({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientHistory> {
  const result = await requestJson<PatientHistory>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/history`, {
    config: { authToken, deviceId }
  });
  if (!result.data) throw new Error("Patient case history fetch returned no data");
  return result.data;
}

import { withCache, type CachedResult } from "./cachedRequest.ts";
import { requestJson } from "./httpClient.ts";
import { LOCAL_ID_PREFIX, requestOrQueue, type OfflineMutationDeps } from "./offlineMutation.ts";
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
  location_lat?: number | null;
  location_lng?: number | null;
  location_accuracy_m?: number | null;
  created_at: string;
  updated_at: string;
}

export async function getPatientCaseEncounterCached({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<CachedResult<PatientCaseEncounter | null>> {
  return withCache(`patient-case-encounter:${patientCaseId}`, () => getPatientCaseEncounter({ apiBaseUrl, authToken, fetchImpl, patientCaseId }));
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
  location_lat?: number;
  location_lng?: number;
  location_accuracy_m?: number | null;
}

/**
 * Queueable like every other clinical mutation. Its own patientCaseId may
 * itself still be a client-minted `LOCAL-<entryId>` placeholder (the case
 * was created offline too, in this same session) — that's fine: the sync
 * engine's remap rewrites this entry's path along with every other queued
 * write for that case once the case's own create syncs, and this entry's
 * later createdAt keeps it ordered after that create either way.
 */
export async function createPatientCaseEncounter(
  {
    apiBaseUrl,
    authToken,
    fetchImpl = fetch,
    patientCaseId,
    payload
  }: ApiConfig & { patientCaseId: string; payload: CreateEncounterPayload },
  deps: OfflineMutationDeps = {}
): Promise<PatientCaseEncounter> {
  const now = new Date().toISOString();

  return requestOrQueue<PatientCaseEncounter>(
    {
      fetchImpl,
      url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/encounters`,
      method: "POST",
      payload,
      config: { authToken },
      scope: "encounter",
      patientCaseId,
      buildOptimisticResult: (entryId) => ({
        patient_case_id: patientCaseId,
        incident_id: "",
        linked_incident_id: "",
        openemr_patient_id: "",
        openemr_encounter_id: "",
        encounter_id: `${LOCAL_ID_PREFIX}${entryId}`,
        encounter_status: "pending_sync",
        status: "pending_sync",
        care_started_at: payload.care_started_at,
        location_lat: payload.location_lat ?? null,
        location_lng: payload.location_lng ?? null,
        location_accuracy_m: payload.location_accuracy_m ?? null,
        created_at: now,
        updated_at: now
      })
    },
    deps
  );
}

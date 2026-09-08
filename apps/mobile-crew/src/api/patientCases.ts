import { withCache, type CachedResult } from "./cachedRequest.ts";
import { requestJson } from "./httpClient.ts";
import { generateEntryId, LOCAL_ID_PREFIX, requestOrQueue, type OfflineMutationDeps } from "./offlineMutation.ts";

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

export async function getPatientCaseCached({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<CachedResult<PatientCase>> {
  return withCache(`patient-case:${patientCaseId}`, () => getPatientCase({ apiBaseUrl, authToken, fetchImpl, patientCaseId }));
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

export async function listPatientCasesCached({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  incidentId
}: ApiConfig & { incidentId: string }): Promise<CachedResult<PatientCase[]>> {
  return withCache(`patient-cases:incident:${incidentId}`, () => listPatientCases({ apiBaseUrl, authToken, fetchImpl, incidentId }));
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

/**
 * Creating a patient case mints a brand-new patient_case_id that every
 * downstream write for this patient (demographics, encounter, vitals, ...)
 * depends on. Queuing it offline like any other mutation means the app has
 * to hand the crew *some* id immediately so charting can continue — a
 * client-minted `LOCAL-<entryId>` placeholder — and the sync engine remaps
 * every entry queued against that placeholder to the real id once this
 * create actually syncs (see syncEngine.ts). The placeholder is exactly the
 * idempotency key this create itself uses, so it's already unique and
 * already known before the request is ever attempted.
 */
export async function createPatientCase(
  {
    apiBaseUrl,
    authToken,
    fetchImpl = fetch,
    incidentId,
    payload
  }: ApiConfig & { incidentId: string; payload: CreatePatientCasePayload },
  deps: OfflineMutationDeps = {}
): Promise<PatientCase> {
  const entryId = deps.entryId ?? generateEntryId();
  const localCaseId = `${LOCAL_ID_PREFIX}${entryId}`;
  const now = new Date().toISOString();

  return requestOrQueue<PatientCase>(
    {
      fetchImpl,
      url: `${apiBaseUrl}/api/incidents/${incidentId}/patient-cases`,
      method: "POST",
      payload,
      config: { authToken },
      scope: "patient_case_create",
      patientCaseId: localCaseId,
      buildOptimisticResult: () => ({
        patient_case_id: localCaseId,
        incident_id: incidentId,
        patient_sequence: 0,
        status: payload.temporary_label ? "Patient Identification Pending" : "Created",
        temporary_label: payload.temporary_label ?? null,
        assignment_id: payload.assignment_id ?? null,
        vehicle_id: null,
        lead_clinician_id: payload.lead_clinician_id ?? null,
        verification_status: "unknown",
        openemr_patient_id: null,
        closure_ready: false,
        created_at: now,
        updated_at: now
      })
    },
    { ...deps, entryId }
  );
}

export async function getPatientCaseDemographicsCached({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<CachedResult<PatientCaseDemographics | null>> {
  return withCache(`patient-case-demographics:${patientCaseId}`, () => getPatientCaseDemographics({ apiBaseUrl, authToken, fetchImpl, patientCaseId }));
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
  const now = new Date().toISOString();
  return requestOrQueue<PatientCaseDemographics>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/demographics`,
    method: "PUT",
    payload,
    config: { authToken },
    scope: "demographics",
    patientCaseId,
    buildOptimisticResult: () => ({ patient_case_id: patientCaseId, ...payload, updated_at: now })
  });
}

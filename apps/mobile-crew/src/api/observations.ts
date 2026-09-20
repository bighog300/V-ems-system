import { requestJson } from "./httpClient.ts";
import { requestOrQueue } from "./offlineMutation.ts";
import { listWithQueued } from "../offline/queuedItems.ts";
import type { ApiConfig } from "./patientCases.ts";

export interface VitalSigns {
  heart_rate_bpm?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  respiratory_rate_bpm?: number;
  spo2_pct?: number;
  temperature_c?: number;
  gcs_total?: number;
  blood_glucose_mgdl?: number;
}

export interface PatientCaseObservation {
  observation_event_id: string;
  patient_case_id: string;
  encounter_id: string;
  performed_at: string;
  clinician_id: string | null;
  observations: VitalSigns;
  notes: string | null;
  downstream_status: string;
  created_at: string;
}

export async function listPatientCaseObservations({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseObservation[]> {
  const result = await requestJson<{ observations: PatientCaseObservation[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/observations`, {
    config: { authToken, deviceId }
  });
  return result.data?.observations ?? [];
}

export async function createPatientCaseObservation({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId,
  vitalSigns,
  notes
}: ApiConfig & { patientCaseId: string; vitalSigns: VitalSigns; notes?: string }): Promise<PatientCaseObservation> {
  const performedAt = new Date().toISOString();
  const body = { vital_signs: vitalSigns, notes: notes || undefined, recorded_at: performedAt };
  return requestOrQueue<PatientCaseObservation>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/observations`,
    method: "POST",
    payload: body,
    config: { authToken, deviceId },
    scope: "observation",
    patientCaseId,
    buildOptimisticResult: (entryId) => observationFromRequest(entryId, patientCaseId, body)
  });
}

type ObservationRequest = { vital_signs: VitalSigns; notes?: string; recorded_at: string };

/** The list entry shown for a vitals set that is still waiting to sync; built from the request the outbox will send. */
export function observationFromRequest(entryId: string, patientCaseId: string, body: ObservationRequest): PatientCaseObservation {
  return {
    observation_event_id: `LOCAL-${entryId}`,
    patient_case_id: patientCaseId,
    encounter_id: "",
    performed_at: body.recorded_at,
    clinician_id: null,
    observations: body.vital_signs,
    notes: body.notes || null,
    downstream_status: "pending",
    created_at: body.recorded_at
  };
}

export function listPatientCaseObservationsWithQueued(args: ApiConfig & { patientCaseId: string }) {
  return listWithQueued<PatientCaseObservation>({
    cacheKey: `patient-case-observations:${args.patientCaseId}`,
    fetchFresh: () => listPatientCaseObservations(args),
    scope: "observation",
    patientCaseId: args.patientCaseId,
    idOf: (item) => item.observation_event_id,
    fromQueued: (entry) => observationFromRequest(entry.entryId, entry.patientCaseId, entry.payload as ObservationRequest)
  });
}

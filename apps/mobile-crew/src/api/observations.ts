import { requestJson } from "./httpClient.ts";
import { requestOrQueue } from "./offlineMutation.ts";
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
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseObservation[]> {
  const result = await requestJson<{ observations: PatientCaseObservation[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/observations`, {
    config: { authToken }
  });
  return result.data?.observations ?? [];
}

export async function createPatientCaseObservation({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  vitalSigns,
  notes
}: ApiConfig & { patientCaseId: string; vitalSigns: VitalSigns; notes?: string }): Promise<PatientCaseObservation> {
  const performedAt = new Date().toISOString();
  return requestOrQueue<PatientCaseObservation>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/observations`,
    method: "POST",
    payload: { vital_signs: vitalSigns, notes: notes || undefined },
    config: { authToken },
    scope: "observation",
    patientCaseId,
    buildOptimisticResult: (entryId) => ({
      observation_event_id: `LOCAL-${entryId}`,
      patient_case_id: patientCaseId,
      encounter_id: "",
      performed_at: performedAt,
      clinician_id: null,
      observations: vitalSigns,
      notes: notes || null,
      downstream_status: "pending",
      created_at: performedAt
    })
  });
}

import { requestJson } from "./httpClient.ts";
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
  const result = await requestJson<PatientCaseObservation>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/observations`, {
    method: "POST",
    payload: { vital_signs: vitalSigns, notes: notes || undefined },
    config: { authToken },
    headers: { "idempotency-key": `mobile-observation-${patientCaseId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  });
  if (!result.data) throw new Error("Observation create returned no data");
  return result.data;
}

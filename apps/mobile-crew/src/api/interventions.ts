import { requestJson } from "./httpClient.ts";
import type { ApiConfig } from "./patientCases.ts";

export interface MedicationAdministration {
  medication_administration_id: string;
  patient_case_id: string;
  encounter_id: string;
  medication_name: string;
  formulation: string | null;
  dose: string;
  dose_unit: string;
  route: string;
  indication: string | null;
  performed_at: string;
  clinician_id: string | null;
  response: string | null;
  adverse_reaction: string | null;
  downstream_status: string;
  created_at: string;
}

export interface CreateMedicationPayload {
  medication_name: string;
  dose: string;
  dose_unit: string;
  route: string;
  indication?: string;
  response?: string;
}

export async function listPatientCaseMedications({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<MedicationAdministration[]> {
  const result = await requestJson<{ medications: MedicationAdministration[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/medications`, {
    config: { authToken }
  });
  return result.data?.medications ?? [];
}

export async function createPatientCaseMedication({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: CreateMedicationPayload }): Promise<MedicationAdministration> {
  const result = await requestJson<MedicationAdministration>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/medications`, {
    method: "POST",
    payload,
    config: { authToken },
    headers: { "idempotency-key": `mobile-medication-${patientCaseId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  });
  if (!result.data) throw new Error("Medication create returned no data");
  return result.data;
}

export interface ClinicalProcedure {
  procedure_id: string;
  patient_case_id: string;
  encounter_id: string;
  procedure_type: string;
  procedure_name: string;
  performed_at: string;
  clinician_id: string | null;
  attempts: number | null;
  success: boolean | null;
  complications: string | null;
  response: string | null;
  downstream_status: string;
  created_at: string;
}

export interface CreateProcedurePayload {
  procedure_type: string;
  procedure_name: string;
  attempts?: number;
  success?: boolean;
  complications?: string;
  response?: string;
}

export async function listPatientCaseProcedures({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<ClinicalProcedure[]> {
  const result = await requestJson<{ procedures: ClinicalProcedure[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/procedures`, {
    config: { authToken }
  });
  return result.data?.procedures ?? [];
}

export async function createPatientCaseProcedure({
  apiBaseUrl,
  authToken,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: CreateProcedurePayload }): Promise<ClinicalProcedure> {
  const result = await requestJson<ClinicalProcedure>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/procedures`, {
    method: "POST",
    payload,
    config: { authToken },
    headers: { "idempotency-key": `mobile-procedure-${patientCaseId}-${Date.now()}-${Math.random().toString(36).slice(2)}` }
  });
  if (!result.data) throw new Error("Procedure create returned no data");
  return result.data;
}

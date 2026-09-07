import { requestJson } from "./httpClient.ts";
import { requestOrQueue } from "./offlineMutation.ts";
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
  const performedAt = new Date().toISOString();
  return requestOrQueue<MedicationAdministration>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/medications`,
    method: "POST",
    payload,
    config: { authToken },
    scope: "medication",
    patientCaseId,
    buildOptimisticResult: (entryId) => ({
      medication_administration_id: `LOCAL-${entryId}`,
      patient_case_id: patientCaseId,
      encounter_id: "",
      medication_name: payload.medication_name,
      formulation: null,
      dose: payload.dose,
      dose_unit: payload.dose_unit,
      route: payload.route,
      indication: payload.indication ?? null,
      performed_at: performedAt,
      clinician_id: null,
      response: payload.response ?? null,
      adverse_reaction: null,
      downstream_status: "pending",
      created_at: performedAt
    })
  });
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
  const performedAt = new Date().toISOString();
  return requestOrQueue<ClinicalProcedure>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/procedures`,
    method: "POST",
    payload,
    config: { authToken },
    scope: "procedure",
    patientCaseId,
    buildOptimisticResult: (entryId) => ({
      procedure_id: `LOCAL-${entryId}`,
      patient_case_id: patientCaseId,
      encounter_id: "",
      procedure_type: payload.procedure_type,
      procedure_name: payload.procedure_name,
      performed_at: performedAt,
      clinician_id: null,
      attempts: payload.attempts ?? null,
      success: payload.success ?? null,
      complications: payload.complications ?? null,
      response: payload.response ?? null,
      downstream_status: "pending",
      created_at: performedAt
    })
  });
}

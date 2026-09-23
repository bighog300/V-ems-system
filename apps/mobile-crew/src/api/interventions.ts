import { requestJson } from "./httpClient.ts";
import { requestOrQueue } from "./offlineMutation.ts";
import { listWithQueued } from "../offline/queuedItems.ts";
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
  deviceId,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<MedicationAdministration[]> {
  const result = await requestJson<{ medications: MedicationAdministration[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/medications`, {
    config: { authToken, deviceId }
  });
  return result.data?.medications ?? [];
}

export async function createPatientCaseMedication({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: CreateMedicationPayload }): Promise<MedicationAdministration> {
  const performedAt = new Date().toISOString();
  const body = { performed_at: performedAt, ...payload };
  return requestOrQueue<MedicationAdministration>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/medications`,
    method: "POST",
    payload: body,
    config: { authToken, deviceId },
    scope: "medication",
    patientCaseId,
    buildOptimisticResult: (entryId) => medicationFromRequest(entryId, patientCaseId, body)
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
  deviceId,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<ClinicalProcedure[]> {
  const result = await requestJson<{ procedures: ClinicalProcedure[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/procedures`, {
    config: { authToken, deviceId }
  });
  return result.data?.procedures ?? [];
}

export async function createPatientCaseProcedure({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId,
  payload
}: ApiConfig & { patientCaseId: string; payload: CreateProcedurePayload }): Promise<ClinicalProcedure> {
  const performedAt = new Date().toISOString();
  const body = { performed_at: performedAt, ...payload };
  return requestOrQueue<ClinicalProcedure>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/procedures`,
    method: "POST",
    payload: body,
    config: { authToken, deviceId },
    scope: "procedure",
    patientCaseId,
    buildOptimisticResult: (entryId) => procedureFromRequest(entryId, patientCaseId, body)
  });
}

type MedicationRequest = CreateMedicationPayload & { performed_at: string };
type ProcedureRequest = CreateProcedurePayload & { performed_at: string };

/** The list entry shown for a medication that is still waiting to sync. */
export function medicationFromRequest(entryId: string, patientCaseId: string, body: MedicationRequest): MedicationAdministration {
  return {
    medication_administration_id: `LOCAL-${entryId}`,
    patient_case_id: patientCaseId,
    encounter_id: "",
    medication_name: body.medication_name,
    formulation: null,
    dose: body.dose,
    dose_unit: body.dose_unit,
    route: body.route,
    indication: body.indication ?? null,
    performed_at: body.performed_at,
    clinician_id: null,
    response: body.response ?? null,
    adverse_reaction: null,
    downstream_status: "pending",
    created_at: body.performed_at
  };
}

/** The list entry shown for a procedure that is still waiting to sync. */
export function procedureFromRequest(entryId: string, patientCaseId: string, body: ProcedureRequest): ClinicalProcedure {
  return {
    procedure_id: `LOCAL-${entryId}`,
    patient_case_id: patientCaseId,
    encounter_id: "",
    procedure_type: body.procedure_type,
    procedure_name: body.procedure_name,
    performed_at: body.performed_at,
    clinician_id: null,
    attempts: body.attempts ?? null,
    success: body.success ?? null,
    complications: body.complications ?? null,
    response: body.response ?? null,
    downstream_status: "pending",
    created_at: body.performed_at
  };
}

export function listPatientCaseMedicationsWithQueued(args: ApiConfig & { patientCaseId: string }) {
  return listWithQueued<MedicationAdministration>({
    cacheKey: `patient-case-medications:${args.patientCaseId}`,
    fetchFresh: () => listPatientCaseMedications(args),
    scope: "medication",
    patientCaseId: args.patientCaseId,
    idOf: (item) => item.medication_administration_id,
    fromQueued: (entry) => medicationFromRequest(entry.entryId, entry.patientCaseId, entry.payload as MedicationRequest)
  });
}

export function listPatientCaseProceduresWithQueued(args: ApiConfig & { patientCaseId: string }) {
  return listWithQueued<ClinicalProcedure>({
    cacheKey: `patient-case-procedures:${args.patientCaseId}`,
    fetchFresh: () => listPatientCaseProcedures(args),
    scope: "procedure",
    patientCaseId: args.patientCaseId,
    idOf: (item) => item.procedure_id,
    fromQueued: (entry) => procedureFromRequest(entry.entryId, entry.patientCaseId, entry.payload as ProcedureRequest)
  });
}

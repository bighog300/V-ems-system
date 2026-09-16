import { requestJson } from "./httpClient.ts";
import { requestOrQueue } from "./offlineMutation.ts";
import type { ApiConfig } from "./patientCases.ts";

// Mirrors the controlled tag vocabulary in
// services/orchestration/src/clinical-record.mjs's NOTE_TAGS -- kept as a
// local copy rather than a shared import, matching every other
// server-authoritative-but-client-duplicated vocabulary in this app (see
// api/incidents.ts's INCIDENT_STATUS_PIPELINE for the same convention).
export const NOTE_TAGS = [
  "scene_safety",
  "mechanism_of_injury",
  "family_bystander_report",
  "refusal_context",
  "communication_barrier",
  "safeguarding_concern",
  "law_enforcement_involvement",
  "general"
] as const;

export type NoteTag = (typeof NOTE_TAGS)[number];

export interface PatientCaseNote {
  note_id: string;
  patient_case_id: string;
  encounter_id: string | null;
  tags: string[];
  note_text: string;
  authored_at: string;
  clinician_id: string | null;
  created_at: string;
}

export async function listPatientCaseNotes({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId
}: ApiConfig & { patientCaseId: string }): Promise<PatientCaseNote[]> {
  const result = await requestJson<{ notes: PatientCaseNote[] }>(fetchImpl, `${apiBaseUrl}/api/patient-cases/${patientCaseId}/notes`, {
    config: { authToken, deviceId }
  });
  return result.data?.notes ?? [];
}

export async function createPatientCaseNote({
  apiBaseUrl,
  authToken,
  deviceId,
  fetchImpl = fetch,
  patientCaseId,
  tags,
  text
}: ApiConfig & { patientCaseId: string; tags: string[]; text: string }): Promise<PatientCaseNote> {
  const authoredAt = new Date().toISOString();
  return requestOrQueue<PatientCaseNote>({
    fetchImpl,
    url: `${apiBaseUrl}/api/patient-cases/${patientCaseId}/notes`,
    method: "POST",
    payload: { tags, text },
    config: { authToken, deviceId },
    scope: "note",
    patientCaseId,
    buildOptimisticResult: (entryId) => ({
      note_id: `LOCAL-${entryId}`,
      patient_case_id: patientCaseId,
      encounter_id: null,
      tags,
      note_text: text,
      authored_at: authoredAt,
      clinician_id: null,
      created_at: authoredAt
    })
  });
}

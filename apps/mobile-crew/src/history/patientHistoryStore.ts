import type { PatientHistory } from "../api/patientHistory.ts";

/**
 * The on-device store for a patient's prior-history summary
 * (medications/recent encounters fetched from GET .../history).
 *
 * Deliberately a plain in-memory module-level Map, never
 * src/offline/cacheStore.ts's durable cache: per the Stage 15 design
 * decision, this PHI may only live on the device for as long as the crew
 * is actively transporting that patient, and must be gone (not just
 * stale) the moment the incident reaches "At Destination" or "Handover
 * Complete" -- including across a re-focus of the screen, a background/
 * foreground cycle, or an app restart, none of which should ever bring it
 * back. `purged` tracks that irreversibly: once a case id is purged, this
 * store refuses to hold history for it again for the lifetime of the app
 * process, even if something re-fetches and tries to store it.
 */
const store = new Map<string, PatientHistory>();
const purged = new Set<string>();

export function isPatientHistoryPurged(patientCaseId: string): boolean {
  return purged.has(patientCaseId);
}

export function getPatientHistory(patientCaseId: string): PatientHistory | null {
  return store.get(patientCaseId) ?? null;
}

export function setPatientHistory(patientCaseId: string, history: PatientHistory): void {
  if (purged.has(patientCaseId)) return;
  store.set(patientCaseId, history);
}

export function purgePatientHistory(patientCaseId: string): void {
  store.delete(patientCaseId);
  purged.add(patientCaseId);
}

export function purgePatientHistoryForCases(patientCaseIds: readonly string[]): void {
  for (const patientCaseId of patientCaseIds) purgePatientHistory(patientCaseId);
}

export function __resetPatientHistoryStoreForTests(): void {
  store.clear();
  purged.clear();
}

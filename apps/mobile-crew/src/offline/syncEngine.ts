import { ApiError } from "../api/apiError.ts";
import { isQueueableFailure, LOCAL_ID_PREFIX } from "../api/offlineMutation.ts";
import { requestJson } from "../api/httpClient.ts";
import { listMutations, markMutationStatus, remapPatientCaseId, type OutboxEntry } from "./outboxStore.ts";
import type { OfflineSqliteLike } from "./db.ts";

/** The only scope that mints a brand-new patient_case_id other entries' URLs reference. */
const PATIENT_CASE_CREATE_SCOPE = "patient_case_create";

/**
 * How long a "retrying" entry waits before its next attempt, doubling per
 * attempt and capped so a long-broken backend doesn't push the wait past
 * something a crew would reasonably want to retry within a shift.
 */
export const BASE_BACKOFF_MS = 5_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * After this many failed attempts, a still-failing entry stops retrying
 * automatically and moves to a terminal `failed` state requiring the crew
 * to notice and act (Stage 10 milestone 10e) rather than retrying forever
 * in the background against something that may never recover on its own
 * (e.g. a permanently revoked token that was valid when queued).
 */
export const MAX_SYNC_ATTEMPTS = 6;

export function backoffMs(attemptCount: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attemptCount, MAX_BACKOFF_MS);
}

export function isEntryDueForRetry(entry: Pick<OutboxEntry, "status" | "attemptCount" | "lastAttemptedAt">, now: number): boolean {
  // `sending` only ever means "a runSync pass had claimed this entry". Within
  // a single process that's transient — the coordinator never lets two
  // passes overlap — so a `sending` row still on disk when a new pass starts
  // can only be left over from a previous process that died mid-attempt
  // (app kill, crash) before recording an outcome. It's always due: retrying
  // it is exactly as safe as the original attempt, since both use the same
  // idempotency key.
  if (entry.status === "queued" || entry.status === "sending") return true;
  if (entry.status !== "retrying") return false;
  if (!entry.lastAttemptedAt) return true;
  return now - new Date(entry.lastAttemptedAt).getTime() >= backoffMs(entry.attemptCount);
}

// The field each scope's create endpoint returns its resource under —
// used only to record what the server ended up calling this entry, for
// future reference; nothing downstream depends on it existing.
const RESOURCE_ID_FIELDS: Record<string, string> = {
  assessment: "assessment_id",
  observation: "observation_event_id",
  medication: "medication_administration_id",
  procedure: "procedure_id",
  disposition: "disposition_id",
  demographics: "patient_case_id",
  [PATIENT_CASE_CREATE_SCOPE]: "patient_case_id",
  encounter: "encounter_id"
};

function extractResourceId(scope: string, data: unknown): string | null {
  const field = RESOURCE_ID_FIELDS[scope];
  if (!field || !data || typeof data !== "object") return null;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface SyncSession {
  authToken: string;
}

export interface SyncResult {
  attempted: number;
  acknowledged: number;
  retrying: number;
  failed: number;
  conflicted: number;
}

export interface SyncDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Processes every outbox entry that's due for a send attempt, in
 * (patient_case_id, created_at) order, sequentially — never in parallel,
 * since these are real clinical writes against a case and later entries
 * may implicitly depend on earlier ones having landed first. Safe to call
 * repeatedly (from a foreground trigger, a reconnect trigger, or a manual
 * "Sync now" tap): an entry already in its backoff window, or with nothing
 * queued, is simply a no-op pass.
 */
export async function runSync(db: OfflineSqliteLike, key: Uint8Array, session: SyncSession, deps: SyncDeps = {}): Promise<SyncResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;

  const entries = await listMutations(db, key, { status: ["queued", "retrying", "sending"] });
  const due = entries
    .filter((entry) => isEntryDueForRetry(entry, now()))
    .sort((a, b) => a.patientCaseId.localeCompare(b.patientCaseId) || a.createdAt.localeCompare(b.createdAt));

  const result: SyncResult = { attempted: 0, acknowledged: 0, retrying: 0, failed: 0, conflicted: 0 };

  for (const entry of due) {
    // A dependent entry queued against a patient case that was itself
    // created offline (patientCaseId is still a client-minted
    // LOCAL-<entryId> placeholder) can't be sent yet: its own case doesn't
    // exist on the server. Its create sibling always sorts earlier in `due`
    // (same patientCaseId, earlier createdAt) — if that create just
    // acknowledged this pass, the remap below already rewrote this entry's
    // patientCaseId/path in place before we reach it here. If it's still
    // LOCAL-, the create hasn't synced (this pass or ever yet); skip
    // without spending an attempt — the crew's charting was never blocked,
    // this is purely about not wasting a retry on a guaranteed 404.
    if (entry.scope !== PATIENT_CASE_CREATE_SCOPE && entry.patientCaseId.startsWith(LOCAL_ID_PREFIX)) continue;

    result.attempted += 1;
    await markMutationStatus(db, entry.entryId, { status: "sending" });

    try {
      const response = await requestJson(fetchImpl, entry.path, {
        method: entry.method,
        payload: entry.payload,
        config: { authToken: session.authToken },
        headers: { "idempotency-key": entry.entryId }
      });
      const serverResourceId = extractResourceId(entry.scope, response.data);
      await markMutationStatus(db, entry.entryId, {
        status: "acknowledged",
        serverResourceId,
        lastAttemptedAt: new Date(now()).toISOString(),
        lastError: null
      });
      result.acknowledged += 1;

      if (entry.scope === PATIENT_CASE_CREATE_SCOPE && serverResourceId && entry.patientCaseId.startsWith(LOCAL_ID_PREFIX)) {
        // Captured before the patch loop below: that loop also matches (and
        // mutates) `entry` itself, since the create is its own first element
        // in `due` — comparing against `entry.patientCaseId` directly would
        // go stale after that first match and silently stop matching every
        // entry queued after it.
        const localCaseId = entry.patientCaseId;
        await remapPatientCaseId(db, localCaseId, serverResourceId);
        // The remap above only rewrote the DB; `due` was loaded before this
        // pass started, so the in-memory copies of this case's still-queued
        // dependents need the same patch to be sent later in this same pass
        // rather than waiting for the next one.
        for (const other of due) {
          if (other.patientCaseId === localCaseId) {
            other.path = other.path.split(localCaseId).join(serverResourceId);
            other.patientCaseId = serverResourceId;
          }
        }
      }
    } catch (error) {
      const attemptCount = entry.attemptCount + 1;
      const lastAttemptedAt = new Date(now()).toISOString();
      const lastError = errorMessage(error);

      if (!isQueueableFailure(error)) {
        const status = error instanceof ApiError && error.status === 409 ? "conflict" : "failed";
        await markMutationStatus(db, entry.entryId, { status, attemptCount, lastAttemptedAt, lastError });
        if (status === "conflict") result.conflicted += 1;
        else result.failed += 1;
      } else if (attemptCount >= MAX_SYNC_ATTEMPTS) {
        await markMutationStatus(db, entry.entryId, { status: "failed", attemptCount, lastAttemptedAt, lastError });
        result.failed += 1;
      } else {
        await markMutationStatus(db, entry.entryId, { status: "retrying", attemptCount, lastAttemptedAt, lastError });
        result.retrying += 1;
      }
    }
  }

  return result;
}

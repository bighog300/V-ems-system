import { ApiError } from "../api/apiError.ts";
import { isQueueableFailure } from "../api/offlineMutation.ts";
import { requestJson } from "../api/httpClient.ts";
import { listMutations, markMutationStatus, type OutboxEntry } from "./outboxStore.ts";
import type { OfflineSqliteLike } from "./db.ts";

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
  if (entry.status === "queued") return true;
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
  demographics: "patient_case_id"
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

  const entries = await listMutations(db, key, { status: ["queued", "retrying"] });
  const due = entries
    .filter((entry) => isEntryDueForRetry(entry, now()))
    .sort((a, b) => a.patientCaseId.localeCompare(b.patientCaseId) || a.createdAt.localeCompare(b.createdAt));

  const result: SyncResult = { attempted: 0, acknowledged: 0, retrying: 0, failed: 0, conflicted: 0 };

  for (const entry of due) {
    result.attempted += 1;
    await markMutationStatus(db, entry.entryId, { status: "sending" });

    try {
      const response = await requestJson(fetchImpl, entry.path, {
        method: entry.method,
        payload: entry.payload,
        config: { authToken: session.authToken },
        headers: { "idempotency-key": entry.entryId }
      });
      await markMutationStatus(db, entry.entryId, {
        status: "acknowledged",
        serverResourceId: extractResourceId(entry.scope, response.data),
        lastAttemptedAt: new Date(now()).toISOString(),
        lastError: null
      });
      result.acknowledged += 1;
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

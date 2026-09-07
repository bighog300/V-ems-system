import { decryptJson, encryptJson, type OfflineCryptoModule } from "./crypto.ts";
import {
  getOutboxEntry as getOutboxEntryRow,
  insertOutboxEntry,
  listOutboxEntries as listOutboxEntryRows,
  updateOutboxEntry,
  type ListOutboxEntriesFilter,
  type OfflineSqliteLike,
  type OutboxEntryPatch,
  type OutboxEntryRow,
  type OutboxStatus
} from "./db.ts";

export interface OutboxCryptoModule extends OfflineCryptoModule {
  randomUUID(): string;
}

// expo-crypto is a native module lazily imported the same way as
// crypto.ts's other native dependencies.
let cryptoModulePromise: Promise<OutboxCryptoModule> | null = null;
function getCryptoModule(): Promise<OutboxCryptoModule> {
  if (!cryptoModulePromise) cryptoModulePromise = import("expo-crypto");
  return cryptoModulePromise;
}

export interface OutboxMutation {
  scope: string;
  patientCaseId: string;
  method: string;
  path: string;
  payload: unknown;
}

export interface OutboxEntry {
  entryId: string;
  scope: string;
  patientCaseId: string;
  method: string;
  path: string;
  payload: unknown;
  status: OutboxStatus;
  attemptCount: number;
  lastAttemptedAt: string | null;
  lastError: string | null;
  serverResourceId: string | null;
  createdAt: string;
}

function toOutboxEntry(row: OutboxEntryRow, key: Uint8Array): OutboxEntry {
  return {
    entryId: row.entry_id,
    scope: row.scope,
    patientCaseId: row.patient_case_id,
    method: row.method,
    path: row.path,
    payload: decryptJson(row.encrypted_payload, key),
    status: row.status,
    attemptCount: row.attempt_count,
    lastAttemptedAt: row.last_attempted_at,
    lastError: row.last_error,
    serverResourceId: row.server_resource_id,
    createdAt: row.created_at
  };
}

/**
 * Queues a mutation for later sync. The returned entryId is also the
 * idempotency-key the sync engine (Stage 10 milestone 10d) must send with
 * every send attempt for this entry — generating it here, once, up front,
 * is what makes every attempt (queued offline or sent immediately) safe to
 * retry against the backend's idempotency-key handling.
 */
export async function enqueueMutation(
  db: OfflineSqliteLike,
  key: Uint8Array,
  mutation: OutboxMutation,
  deps: { cryptoModule?: OutboxCryptoModule } = {}
): Promise<string> {
  const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
  const entryId = cryptoModule.randomUUID();
  const encryptedPayload = await encryptJson(mutation.payload, key, { cryptoModule });
  await insertOutboxEntry(db, {
    entryId,
    scope: mutation.scope,
    patientCaseId: mutation.patientCaseId,
    method: mutation.method,
    path: mutation.path,
    encryptedPayload,
    createdAt: new Date().toISOString()
  });
  return entryId;
}

export async function getMutation(db: OfflineSqliteLike, key: Uint8Array, entryId: string): Promise<OutboxEntry | null> {
  const row = await getOutboxEntryRow(db, entryId);
  return row ? toOutboxEntry(row, key) : null;
}

export async function listMutations(db: OfflineSqliteLike, key: Uint8Array, filter: ListOutboxEntriesFilter = {}): Promise<OutboxEntry[]> {
  const rows = await listOutboxEntryRows(db, filter);
  return rows.map((row) => toOutboxEntry(row, key));
}

export async function markMutationStatus(db: OfflineSqliteLike, entryId: string, patch: OutboxEntryPatch): Promise<void> {
  await updateOutboxEntry(db, entryId, patch);
}

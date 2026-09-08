import { getOrCreateEncryptionKey, type OfflineCryptoModule } from "../offline/crypto.ts";
import { getOfflineDatabase, type OfflineSqliteLike } from "../offline/db.ts";
import { enqueueMutation, type OutboxCryptoModule } from "../offline/outboxStore.ts";
import { ApiError, ForbiddenError, UnauthorizedError } from "./apiError.ts";
import { requestJson, type RequestConfig } from "./httpClient.ts";

// expo-crypto is a native module lazily imported the same way as every
// other native dependency in this app (session.ts, appLock.ts, offline/*.ts)
// — but only when actually queuing a failed mutation. The idempotency-key
// generated for every attempt (including ones that succeed and never touch
// the outbox) doesn't need CSPRNG-grade randomness, just per-device
// uniqueness, so it's generated without any native dependency below.
let cryptoModulePromise: Promise<OutboxCryptoModule> | null = null;
function getCryptoModule(): Promise<OutboxCryptoModule> {
  if (!cryptoModulePromise) cryptoModulePromise = import("expo-crypto");
  return cryptoModulePromise;
}

/**
 * Prefix marking a client-minted placeholder id (a `${LOCAL_ID_PREFIX}<entryId>`)
 * that stands in for a server-issued id until the entity that mints it —
 * currently only createPatientCase — actually syncs. Every optimistic result
 * built while offline for a resource the server itself IDs uses this same
 * prefix, but only patient case ids are ever referenced by other queued
 * entries' URLs, so only those get remapped (see syncEngine.ts).
 */
export const LOCAL_ID_PREFIX = "LOCAL-";

export function generateEntryId(): string {
  const random = () => Math.random().toString(16).slice(2).padEnd(8, "0").slice(0, 8);
  return `${random()}-${random().slice(0, 4)}-4${random().slice(0, 3)}-${random().slice(0, 4)}-${random()}${random().slice(0, 4)}`;
}

/**
 * Whether a failed mutation attempt should be queued for later retry rather
 * than surfaced to the crew as a hard failure. A response was received and
 * it's a definite rejection (bad input, auth, a non-retryable business
 * conflict) — retrying it offline would just fail again, or worse, retry
 * against a stale token. Anything else — no response reached at all, our
 * own request-timeout, or the backend explicitly marking its error
 * retryable — is connectivity, and belongs in the outbox.
 */
export function isQueueableFailure(error: unknown): boolean {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return false;
  if (error instanceof ApiError) {
    if (error.code === "REQUEST_ABORTED") return true;
    if (error.retryable === true) return true;
    return error.status === undefined;
  }
  return true;
}

export interface OfflineMutationArgs<T> {
  fetchImpl: typeof fetch;
  url: string;
  method: string;
  payload: unknown;
  config: RequestConfig;
  scope: string;
  patientCaseId: string;
  /** Builds the client-side optimistic result shown immediately when the mutation is queued instead of sent. */
  buildOptimisticResult: (entryId: string) => T;
}

export interface OfflineMutationDeps {
  cryptoModule?: OutboxCryptoModule;
  db?: OfflineSqliteLike;
  encryptionKey?: Uint8Array;
  /**
   * Use this exact idempotency key instead of generating one. Needed by
   * callers (createPatientCase) that must know the key up front, before the
   * request is even attempted, because it doubles as the LOCAL-<entryId>
   * placeholder id every downstream write for the not-yet-created case will
   * reference until the create syncs and the sync engine remaps them.
   */
  entryId?: string;
}

/**
 * Attempts a mutating request immediately; if it fails for a connectivity
 * reason (see {@link isQueueableFailure}), queues it in the offline outbox
 * instead of throwing and returns a locally-built optimistic result so the
 * calling screen's existing "await the create, then add it to local state"
 * pattern doesn't need to change. The idempotency-key generated for the
 * live attempt is the same key the eventual queued retry uses, so a write
 * that actually reached the server but whose response was lost is never
 * double-applied.
 */
export async function requestOrQueue<T>(args: OfflineMutationArgs<T>, deps: OfflineMutationDeps = {}): Promise<T> {
  const entryId = deps.entryId ?? generateEntryId();

  try {
    const result = await requestJson<T>(args.fetchImpl, args.url, {
      method: args.method,
      payload: args.payload,
      config: args.config,
      headers: { "idempotency-key": entryId }
    });
    if (!result.data) throw new ApiError("Request returned no data", { code: "EMPTY_RESPONSE" });
    return result.data;
  } catch (error) {
    if (!isQueueableFailure(error)) throw error;

    const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
    const db = deps.db ?? (await getOfflineDatabase());
    const key = deps.encryptionKey ?? (await getOrCreateEncryptionKey({ cryptoModule: cryptoModule as OfflineCryptoModule }));
    await enqueueMutation(
      db,
      key,
      { scope: args.scope, patientCaseId: args.patientCaseId, method: args.method, path: args.url, payload: args.payload },
      { cryptoModule, entryId }
    );
    return args.buildOptimisticResult(entryId);
  }
}

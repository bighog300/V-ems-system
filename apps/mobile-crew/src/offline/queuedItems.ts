import { withCache } from "../api/cachedRequest.ts";
import { isQueueableFailure, LOCAL_ID_PREFIX } from "../api/offlineMutation.ts";
import { getOrCreateEncryptionKey } from "./crypto.ts";
import { getOfflineDatabase, type OfflineSqliteLike } from "./db.ts";
import { listMutations, type OutboxEntry } from "./outboxStore.ts";

/** Everything in the outbox that has not yet been acknowledged by the server. */
const UNSYNCED_STATUSES = ["queued", "sending", "retrying", "conflict", "failed"] as const;

export interface QueuedItemDeps {
  db?: OfflineSqliteLike;
  encryptionKey?: Uint8Array;
}

export interface MergedList<T> {
  items: T[];
  /** The server list came from the saved copy because the live fetch failed for a connectivity reason. */
  cached: boolean;
  cachedAt: string | null;
  /** Offline with no saved copy: earlier entries cannot be shown, only what is waiting to sync. */
  unavailable: boolean;
}

/** An entry created on this device and not yet acknowledged carries a client-minted `LOCAL-` id. */
export function isWaitingToSync(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

export async function listQueuedEntries(scope: string, patientCaseId: string, deps: QueuedItemDeps = {}): Promise<OutboxEntry[]> {
  const db = deps.db ?? (await getOfflineDatabase());
  const key = deps.encryptionKey ?? (await getOrCreateEncryptionKey());
  const entries = await listMutations(db, key, { status: [...UNSYNCED_STATUSES] });
  return entries.filter((entry) => entry.scope === scope && entry.patientCaseId === patientCaseId);
}

/**
 * The server's list (or its saved copy when offline) with this device's not-yet-synced entries added, so charting that is
 * waiting to sync stays visible next to earlier charting instead of vanishing on the next reload. An entry the server
 * already has is not repeated: once acknowledged it leaves the outbox and appears in the server list under its real id.
 */
export async function listWithQueued<T>(
  args: {
    cacheKey: string;
    fetchFresh: () => Promise<T[]>;
    scope: string;
    patientCaseId: string;
    idOf: (item: T) => string;
    fromQueued: (entry: OutboxEntry) => T;
  },
  deps: QueuedItemDeps = {}
): Promise<MergedList<T>> {
  let base: T[] = [];
  let cached = false;
  let cachedAt: string | null = null;
  let unavailable = false;
  try {
    const result = await withCache(args.cacheKey, args.fetchFresh, deps);
    base = result.value;
    cached = result.cached;
    cachedAt = result.cachedAt;
  } catch (error) {
    // Offline and never fetched: show what is waiting to sync rather than an error that hides the crew's own charting.
    if (!isQueueableFailure(error)) throw error;
    unavailable = true;
  }
  // A local storage problem must not hide the server list; the entries themselves are still in the outbox and still sync.
  const queued = (await listQueuedEntries(args.scope, args.patientCaseId, deps).catch(() => [])).map(args.fromQueued);
  const known = new Set(base.map(args.idOf));
  return { items: [...base, ...queued.filter((item) => !known.has(args.idOf(item)))], cached, cachedAt, unavailable };
}

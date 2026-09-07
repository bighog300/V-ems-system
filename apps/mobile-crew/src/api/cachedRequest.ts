import { cacheRead, readCache } from "../offline/cacheStore.ts";
import { getOrCreateEncryptionKey, type OfflineCryptoModule } from "../offline/crypto.ts";
import { getOfflineDatabase, type OfflineSqliteLike } from "../offline/db.ts";
import { isQueueableFailure } from "./offlineMutation.ts";

// expo-crypto is a native module lazily imported the same way as every other
// native dependency in this app — only needed once a fetch actually needs
// caching (a fresh write) or falling back to one (a failed read).
let cryptoModulePromise: Promise<OfflineCryptoModule> | null = null;
function getCryptoModule(): Promise<OfflineCryptoModule> {
  if (!cryptoModulePromise) cryptoModulePromise = import("expo-crypto");
  return cryptoModulePromise;
}

export interface CachedResult<T> {
  value: T;
  /** True when this came from the local cache because the live fetch failed for a connectivity reason. */
  cached: boolean;
  cachedAt: string | null;
}

export interface CachedRequestDeps {
  cryptoModule?: OfflineCryptoModule;
  db?: OfflineSqliteLike;
  encryptionKey?: Uint8Array;
}

/**
 * Fetches fresh data and caches it for offline use; if the fetch fails for a
 * connectivity reason (see {@link isQueueableFailure}), falls back to the
 * last cached value instead of surfacing a blank error screen. A non-
 * connectivity failure (401, 403, a real 4xx) is rethrown unchanged — a
 * crew member offline needs the cache, a crew member correctly denied
 * access does not.
 */
export async function withCache<T>(cacheKey: string, fetchFresh: () => Promise<T>, deps: CachedRequestDeps = {}): Promise<CachedResult<T>> {
  try {
    const value = await fetchFresh();
    const cachedAt = new Date().toISOString();
    try {
      const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
      const db = deps.db ?? (await getOfflineDatabase());
      const key = deps.encryptionKey ?? (await getOrCreateEncryptionKey({ cryptoModule }));
      await cacheRead(db, key, cacheKey, value, { cryptoModule });
    } catch {
      // Caching is best-effort: a write failure here must never fail a
      // successful fetch the screen is waiting on.
    }
    return { value, cached: false, cachedAt };
  } catch (error) {
    if (!isQueueableFailure(error)) throw error;

    const cryptoModule = deps.cryptoModule ?? (await getCryptoModule());
    const db = deps.db ?? (await getOfflineDatabase());
    const key = deps.encryptionKey ?? (await getOrCreateEncryptionKey({ cryptoModule }));
    const cached = await readCache<T>(db, key, cacheKey);
    if (!cached) throw error;
    return { value: cached.value, cached: true, cachedAt: cached.cachedAt };
  }
}

import { decryptJson, encryptJson, type OfflineCryptoModule } from "./crypto.ts";
import { getCachedReadRow, setCachedReadRow, type OfflineSqliteLike } from "./db.ts";

export interface CachedRead<T> {
  value: T;
  cachedAt: string;
}

/** Caches the last successful response for a GET, keyed by its URL. */
export async function cacheRead(
  db: OfflineSqliteLike,
  key: Uint8Array,
  cacheKey: string,
  value: unknown,
  deps: { cryptoModule?: OfflineCryptoModule } = {}
): Promise<void> {
  const encryptedPayload = await encryptJson(value, key, deps);
  await setCachedReadRow(db, cacheKey, encryptedPayload, new Date().toISOString());
}

export async function readCache<T>(db: OfflineSqliteLike, key: Uint8Array, cacheKey: string): Promise<CachedRead<T> | null> {
  const row = await getCachedReadRow(db, cacheKey);
  if (!row) return null;
  return { value: decryptJson<T>(row.encrypted_payload, key), cachedAt: row.cached_at };
}

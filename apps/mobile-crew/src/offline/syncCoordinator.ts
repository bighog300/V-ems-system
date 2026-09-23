import { getOrCreateEncryptionKey } from "./crypto.ts";
import { getOfflineDatabase, type OfflineSqliteLike } from "./db.ts";
import { runSync, type SyncDeps, type SyncResult, type SyncSession } from "./syncEngine.ts";

export interface SyncCoordinatorDeps extends SyncDeps {
  db?: OfflineSqliteLike;
  encryptionKey?: Uint8Array;
}

export interface SyncCoordinator {
  /**
   * Runs a sync pass. Safe to call from multiple triggers in close
   * succession (app foreground, network reconnect, a manual tap all firing
   * around the same moment) — a call made while one is already running
   * awaits that same pass instead of starting a second, overlapping one.
   */
  syncNow(options?: { force?: boolean }): Promise<SyncResult>;
}

export function createSyncCoordinator(session: SyncSession, deps: SyncCoordinatorDeps = {}): SyncCoordinator {
  let inFlight: Promise<SyncResult> | null = null;

  async function run(force: boolean): Promise<SyncResult> {
    const db = deps.db ?? (await getOfflineDatabase());
    const key = deps.encryptionKey ?? (await getOrCreateEncryptionKey());
    return runSync(db, key, session, { ...deps, force: force || deps.force });
  }

  return {
    syncNow(options = {}) {
      if (!inFlight) {
        inFlight = run(Boolean(options.force)).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    }
  };
}

import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import type { Session } from "../auth/session.ts";
import { createSyncCoordinator, type SyncCoordinator } from "./syncCoordinator.ts";
import type { SyncResult } from "./syncEngine.ts";

export interface UseSyncTriggersResult {
  syncing: boolean;
  lastResult: SyncResult | null;
  /** Manual "Sync now" trigger — the third of Stage 10's three sync triggers, alongside foreground and reconnect. */
  syncNow: () => Promise<void>;
}

/**
 * Wires the offline outbox's sync engine to fire on app foreground, on
 * network reconnect, and once when a session first becomes available
 * (picking up anything queued from a previous offline session) — the
 * trigger set from docs/STAGE10_OFFLINE_SYNC_PLAN.md. Exposes a manual
 * `syncNow` for a "Sync now" affordance on top of those automatic ones.
 */
export function useSyncTriggers(session: Session | null): UseSyncTriggersResult {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const coordinatorRef = useRef<SyncCoordinator | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    coordinatorRef.current = session ? createSyncCoordinator({ authToken: session.authToken }) : null;
  }, [session]);

  const syncNow = useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;
    setSyncing(true);
    try {
      setLastResult(await coordinator.syncNow());
    } finally {
      setSyncing(false);
    }
  }, []);

  // Trigger 1: once when a session first becomes available.
  useEffect(() => {
    if (session) void syncNow();
  }, [session, syncNow]);

  // Trigger 2: app foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      const cameToForeground = previous.match(/inactive|background/) && next === "active";
      if (cameToForeground) void syncNow();
    });
    return () => subscription.remove();
  }, [syncNow]);

  // Trigger 3: network reconnect.
  useEffect(() => {
    let wasConnected = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (isConnected && !wasConnected) void syncNow();
      wasConnected = isConnected;
    });
    return () => unsubscribe();
  }, [syncNow]);

  return { syncing, lastResult, syncNow };
}

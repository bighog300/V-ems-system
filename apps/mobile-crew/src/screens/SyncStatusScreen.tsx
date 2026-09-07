import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { getOfflineDatabase, listOutboxEntries, updateOutboxEntry, type OutboxEntryRow } from "../offline/db.ts";
import { scopeLabel, statusLabel } from "../offline/outboxSummary.ts";
import type { UseSyncTriggersResult } from "../offline/useSyncTriggers.ts";
import { CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface SyncStatusScreenProps {
  sync: UseSyncTriggersResult;
  onBack: () => void;
}

const PENDING_STATUSES = ["queued", "sending", "retrying", "conflict", "failed"] as const;
const RETRYABLE_STATUSES = new Set(["conflict", "failed"]);

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function SyncStatusScreen({ sync, onBack }: SyncStatusScreenProps) {
  const [entries, setEntries] = useState<OutboxEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh: boolean) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const db = await getOfflineDatabase();
      const rows = await listOutboxEntries(db, { status: [...PENDING_STATUSES] });
      setEntries(rows);
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  async function handleRetry(entryId: string) {
    setRetryingId(entryId);
    try {
      const db = await getOfflineDatabase();
      await updateOutboxEntry(db, entryId, { status: "queued", attemptCount: 0, lastError: null });
      await load(true);
      await sync.syncNow();
      await load(true);
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <View style={styles.container} testID="sync-status-screen">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.backLink} testID="back-from-sync-status">
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Sync status
      </Text>
      <Text style={styles.hint}>
        Nothing here is ever lost — items wait here until they can reach the server. Your charting is never blocked by a sync
        problem.
      </Text>

      <Pressable
        onPress={() => sync.syncNow()}
        disabled={sync.syncing}
        accessibilityRole="button"
        accessibilityLabel="Sync now"
        style={styles.syncButton}
        testID="sync-status-sync-now"
      >
        {sync.syncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.syncButtonText}>Sync now</Text>}
      </Pressable>

      {loading ? (
        <ActivityIndicator style={styles.loading} testID="sync-status-loading" />
      ) : (
        <FlatList
          testID="sync-status-list"
          data={entries}
          keyExtractor={(entry) => entry.entry_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <Text style={styles.empty} testID="sync-status-empty">
              Nothing waiting to sync.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={[styles.row, RETRYABLE_STATUSES.has(item.status) && styles.rowAttention]} testID={`sync-entry-${item.entry_id}`}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowScope}>{scopeLabel(item.scope)}</Text>
                <Text style={[styles.rowStatus, RETRYABLE_STATUSES.has(item.status) && styles.rowStatusAttention]}>
                  {statusLabel(item.status)}
                </Text>
              </View>
              {item.last_error ? (
                <Text style={styles.rowError} testID={`sync-entry-error-${item.entry_id}`}>
                  {item.last_error}
                </Text>
              ) : null}
              <Text style={styles.rowMeta}>
                {item.attempt_count > 0 ? `${item.attempt_count} attempt${item.attempt_count === 1 ? "" : "s"} · ` : ""}
                {item.last_attempted_at ? `last tried ${relativeTime(item.last_attempted_at)}` : `queued ${relativeTime(item.created_at)}`}
              </Text>
              {RETRYABLE_STATUSES.has(item.status) ? (
                <Pressable
                  onPress={() => handleRetry(item.entry_id)}
                  disabled={retryingId === item.entry_id}
                  accessibilityRole="button"
                  accessibilityLabel="Retry"
                  style={styles.retryButton}
                  testID={`retry-${item.entry_id}`}
                >
                  {retryingId === item.entry_id ? <ActivityIndicator color="#1a4fd6" /> : <Text style={styles.retryButtonText}>Retry</Text>}
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center"
  },
  backLink: {
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center",
    alignSelf: "flex-start"
  },
  back: {
    color: "#1a4fd6",
    fontSize: 15
  },
  title: {
    fontSize: 22,
    fontWeight: "700"
  },
  hint: {
    fontSize: 13,
    color: "#777",
    marginTop: 4,
    marginBottom: 16
  },
  syncButton: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH_TARGET_MIN,
    marginBottom: 16
  },
  syncButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  },
  loading: {
    marginTop: 24
  },
  empty: {
    textAlign: "center",
    color: "#777",
    padding: 24
  },
  row: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12
  },
  rowAttention: {
    borderColor: "#b00020"
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4
  },
  rowScope: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111"
  },
  rowStatus: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a4fd6"
  },
  rowStatusAttention: {
    color: "#b00020"
  },
  rowError: {
    fontSize: 13,
    color: "#b00020",
    marginBottom: 4
  },
  rowMeta: {
    fontSize: 12,
    color: "#999"
  },
  retryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH_TARGET_MIN
  },
  retryButtonText: {
    color: "#1a4fd6",
    fontSize: 14,
    fontWeight: "600"
  }
});

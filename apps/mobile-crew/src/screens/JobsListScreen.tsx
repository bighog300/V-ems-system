import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { listMyAssignments, type AssignedJob } from "../api/assignments.ts";
import { clearSession, type Session } from "../auth/session.ts";
import type { UseSyncTriggersResult } from "../offline/useSyncTriggers.ts";
import { CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

const NOOP_SYNC: UseSyncTriggersResult = { syncing: false, lastResult: null, syncNow: async () => {} };

export interface JobsListScreenProps {
  session: Session;
  onSignedOut: () => void;
  onSelectJob: (job: AssignedJob) => void;
  onOpenSyncStatus?: () => void;
  sync?: UseSyncTriggersResult;
}

function syncStatusText(sync: UseSyncTriggersResult): string | null {
  if (sync.syncing) return "Syncing…";
  if (!sync.lastResult) return null;
  const { retrying, failed, conflicted, acknowledged } = sync.lastResult;
  const pending = retrying + failed + conflicted;
  if (pending === 0 && acknowledged === 0) return null;
  if (pending === 0) return `Synced ${acknowledged} item${acknowledged === 1 ? "" : "s"}`;
  return `${pending} item${pending === 1 ? "" : "s"} waiting to sync`;
}

export default function JobsListScreen({ session, onSignedOut, onSelectJob, onOpenSyncStatus, sync = NOOP_SYNC }: JobsListScreenProps) {
  const [jobs, setJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const result = await listMyAssignments({ apiBaseUrl: session.apiBaseUrl, authToken: session.authToken });
        setJobs(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load assigned jobs.");
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [session.apiBaseUrl, session.authToken]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  async function handleSignOut() {
    await clearSession();
    onSignedOut();
  }

  return (
    <View style={styles.container} testID="jobs-list-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title} accessibilityRole="header">
            Assigned jobs
          </Text>
          <Text style={styles.meta}>
            {session.actorId} ({session.actorRole})
          </Text>
        </View>
        <Pressable onPress={handleSignOut} accessibilityRole="button" accessibilityLabel="Sign out" style={styles.signOut} testID="sign-out">
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.syncRow}>
        {syncStatusText(sync) ? (
          onOpenSyncStatus ? (
            <Pressable onPress={onOpenSyncStatus} accessibilityRole="button" accessibilityLabel="View sync status" style={styles.syncStatusLink}>
              <Text style={[styles.syncStatus, styles.syncStatusUnderline]} accessibilityLiveRegion="polite" testID="sync-status">
                {syncStatusText(sync)}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.syncStatus} accessibilityLiveRegion="polite" testID="sync-status">
              {syncStatusText(sync)}
            </Text>
          )
        ) : null}
        <Pressable
          onPress={() => sync.syncNow()}
          disabled={sync.syncing}
          accessibilityRole="button"
          accessibilityLabel="Sync now"
          style={styles.syncButton}
          testID="sync-now"
        >
          <Text style={styles.syncButtonText}>Sync now</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center} testID="jobs-loading">
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="jobs-error">
            {error}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => load(false)} accessibilityRole="button" accessibilityLabel="Retry" testID="jobs-retry">
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          testID="jobs-list"
          data={jobs}
          keyExtractor={(job) => job.assignment_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={jobs.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <Text style={styles.empty} testID="jobs-empty">
              No active assignments right now.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.jobCard}
              onPress={() => onSelectJob(item)}
              accessibilityRole="button"
              accessibilityLabel={`Job ${item.incident?.incident_id ?? "unlinked incident"}, status ${item.status}`}
              testID={`job-${item.assignment_id}`}
            >
              <View style={styles.jobCardHeader}>
                <Text style={styles.jobIncidentId}>{item.incident?.incident_id ?? "Unlinked incident"}</Text>
                <Text style={styles.jobStatus}>{item.status}</Text>
              </View>
              <Text style={styles.jobLocation}>{item.incident?.location_summary ?? "Location unavailable"}</Text>
              <Text style={styles.jobDetail}>
                {item.vehicle_id} · {item.incident?.priority ?? "priority unknown"}
              </Text>
            </Pressable>
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
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 24,
    paddingBottom: 12
  },
  title: {
    fontSize: 24,
    fontWeight: "700"
  },
  meta: {
    fontSize: 14,
    color: "#555",
    marginTop: 2
  },
  signOut: {
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  signOutText: {
    color: "#b00020",
    fontSize: 14,
    fontWeight: "600"
  },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12
  },
  syncStatusLink: {
    flexShrink: 1,
    marginRight: 12,
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center"
  },
  syncStatus: {
    fontSize: 13,
    color: "#555"
  },
  syncStatusUnderline: {
    textDecorationLine: "underline"
  },
  syncButton: {
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center",
    paddingHorizontal: 4
  },
  syncButtonText: {
    color: "#1a4fd6",
    fontSize: 14,
    fontWeight: "600"
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  error: {
    color: "#b00020",
    textAlign: "center",
    marginBottom: 12
  },
  retryButton: {
    borderWidth: 1,
    borderColor: "#1a4fd6",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center"
  },
  retryButtonText: {
    color: "#1a4fd6",
    fontWeight: "600",
    textAlign: "center"
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center"
  },
  empty: {
    textAlign: "center",
    color: "#777",
    padding: 24
  },
  jobCard: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: TOUCH_TARGET_MIN
  },
  jobCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4
  },
  jobIncidentId: {
    fontSize: 16,
    fontWeight: "700"
  },
  jobStatus: {
    fontSize: 14,
    color: "#1a4fd6",
    fontWeight: "600"
  },
  jobLocation: {
    fontSize: 14,
    color: "#333",
    marginBottom: 2
  },
  jobDetail: {
    fontSize: 13,
    color: "#777"
  }
});

import { StyleSheet, Text } from "react-native";

import { formatLocalDateTime } from "../format/localTime.ts";
import { isWaitingToSync, type MergedList } from "../offline/queuedItems.ts";

/** Marks a history row that exists only on this device so far; synced rows carry no marker. */
export function WaitingToSyncBadge({ id }: { id: string }) {
  if (!isWaitingToSync(id)) return null;
  return (
    <Text style={styles.badge} accessibilityLabel="Waiting to sync" testID={`waiting-to-sync-${id}`}>
      Waiting to sync
    </Text>
  );
}

export type ListNotice = Pick<MergedList<unknown>, "cached" | "cachedAt" | "unavailable">;

/** Tells a crew member offline that the list may be missing earlier entries, and that their own charting is safe. */
export function OfflineListNotice({ notice, testID }: { notice: ListNotice | null; testID: string }) {
  if (!notice || (!notice.cached && !notice.unavailable)) return null;
  const text = notice.cached
    ? `Offline: showing the copy saved ${formatLocalDateTime(notice.cachedAt)}. Anything you chart now is kept and will sync.`
    : "Offline: earlier entries cannot be shown until you are back online. Anything you chart is kept and will sync.";
  return (
    <Text style={styles.notice} accessibilityLiveRegion="polite" testID={testID}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: "#fff3cd", color: "#7a5b00", fontSize: 12, fontWeight: "600" },
  notice: { marginBottom: 8, padding: 8, borderRadius: 6, backgroundColor: "#eef3ff", color: "#1a3a8a", fontSize: 13 }
});

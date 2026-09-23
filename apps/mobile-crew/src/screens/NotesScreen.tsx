import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { createPatientCaseNote, listPatientCaseNotesWithQueued, NOTE_TAGS, type NoteTag, type PatientCaseNote } from "../api/patientCaseNotes.ts";
import type { Session } from "../auth/session.ts";
import { CHIP_TARGET_MIN, CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";
import { formatLocalDateTime } from "../format/localTime.ts";
import { OfflineListNotice, WaitingToSyncBadge, type ListNotice } from "../components/SyncMarkers.tsx";

export interface NotesScreenProps {
  patientCaseId: string;
  session: Session;
  onBack: () => void;
}

const TAG_LABELS: Record<NoteTag, string> = {
  scene_safety: "Scene safety",
  mechanism_of_injury: "Mechanism of injury",
  family_bystander_report: "Family/bystander report",
  refusal_context: "Refusal context",
  communication_barrier: "Communication barrier",
  safeguarding_concern: "Safeguarding concern",
  law_enforcement_involvement: "Law enforcement involvement",
  general: "General"
};

function tagLabel(tag: string): string {
  return TAG_LABELS[tag as NoteTag] ?? tag;
}

export default function NotesScreen({ patientCaseId, session, onBack }: NotesScreenProps) {
  const [notes, setNotes] = useState<PatientCaseNote[]>([]);
  const [listNotice, setListNotice] = useState<ListNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [text, setText] = useState("");

  const config = { apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, deviceId: session.deviceId };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const merged = await listPatientCaseNotesWithQueued({ ...config, patientCaseId });
      setListNotice(merged);
      setNotes([...merged.items].sort((a, b) => b.authored_at.localeCompare(a.authored_at)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientCaseId, session.apiBaseUrl, session.authToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function toggleTag(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleRecord() {
    if (selectedTags.length === 0) {
      setError("Select at least one tag before recording a note.");
      return;
    }
    if (!text.trim()) {
      setError("Enter note text before recording.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createPatientCaseNote({ ...config, patientCaseId, tags: selectedTags, text: text.trim() });
      setNotes((prev) => [created, ...prev]);
      setSelectedTags([]);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container} testID="notes-screen">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to patient case" style={styles.backLink} testID="back-to-case">
        <Text style={styles.back}>‹ Patient case</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Notes
      </Text>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="notes-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.form}>
        <View style={styles.tagRow}>
          {NOTE_TAGS.map((tag) => (
            <Pressable
              key={tag}
              style={[styles.tagChip, selectedTags.includes(tag) && styles.tagChipActive]}
              onPress={() => toggleTag(tag)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedTags.includes(tag) }}
              accessibilityLabel={tagLabel(tag)}
              testID={`tag-${tag}`}
            >
              <Text style={[styles.tagChipText, selectedTags.includes(tag) && styles.tagChipTextActive]}>{tagLabel(tag)}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={[styles.input, styles.textInput]}
          placeholder="Note"
          accessibilityLabel="Note text"
          value={text}
          onChangeText={setText}
          multiline
          testID="note-text"
        />
        <Pressable
          style={[styles.button, (saving || selectedTags.length === 0 || !text.trim()) && styles.buttonDisabled]}
          onPress={handleRecord}
          disabled={saving || selectedTags.length === 0 || !text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Record note"
          testID="record-note"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record note</Text>}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>History</Text>
      <OfflineListNotice notice={listNotice} testID="notes-offline-notice" />
      {loading ? (
        <ActivityIndicator testID="notes-loading" />
      ) : (
        <FlatList
          testID="notes-list"
          data={notes}
          keyExtractor={(item) => item.note_id}
          ListEmptyComponent={
            <Text style={styles.hint} testID="notes-empty">
              No notes recorded yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`note-${item.note_id}`}>
              <Text style={styles.rowTime}>
                {formatLocalDateTime(item.authored_at)} · {item.tags.map(tagLabel).join(", ")}
              </Text>
              <Text style={styles.rowSummary}>{item.note_text}</Text>
              <WaitingToSyncBadge id={item.note_id} />
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
    fontWeight: "700",
    marginBottom: 16
  },
  error: {
    fontSize: 13,
    color: "#b00020",
    marginBottom: 12
  },
  form: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12
  },
  tagChip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    minHeight: CHIP_TARGET_MIN,
    justifyContent: "center"
  },
  tagChipActive: {
    backgroundColor: "#1a4fd6",
    borderColor: "#1a4fd6"
  },
  tagChipText: {
    fontSize: 13,
    color: "#333"
  },
  tagChipTextActive: {
    color: "#fff",
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 14,
    minHeight: TOUCH_TARGET_MIN
  },
  textInput: {
    minHeight: 80,
    textAlignVertical: "top"
  },
  button: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    minHeight: TOUCH_TARGET_MIN
  },
  buttonDisabled: {
    backgroundColor: "#9aa8e0"
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    textTransform: "uppercase",
    marginBottom: 8
  },
  hint: {
    fontSize: 13,
    color: "#999"
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  rowTime: {
    fontSize: 12,
    color: "#999"
  },
  rowSummary: {
    fontSize: 14,
    color: "#111"
  }
});

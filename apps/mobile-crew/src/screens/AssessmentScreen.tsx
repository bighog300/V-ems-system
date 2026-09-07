import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { createPatientCaseAssessment, listPatientCaseAssessments, type PatientCaseAssessment } from "../api/assessments.ts";
import type { Session } from "../auth/session.ts";

export interface AssessmentScreenProps {
  patientCaseId: string;
  session: Session;
  onBack: () => void;
}

const SECTION_TYPES = [
  { key: "primary_survey", label: "Primary survey" },
  { key: "secondary_survey", label: "Secondary survey" },
  { key: "history_sample", label: "History / SAMPLE" },
  { key: "clinical_impression", label: "Clinical impression" }
];

function sectionLabel(sectionType: string): string {
  return SECTION_TYPES.find((s) => s.key === sectionType)?.label ?? sectionType;
}

export default function AssessmentScreen({ patientCaseId, session, onBack }: AssessmentScreenProps) {
  const [assessments, setAssessments] = useState<PatientCaseAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sectionType, setSectionType] = useState(SECTION_TYPES[0].key);
  const [notes, setNotes] = useState("");

  const config = { apiBaseUrl: session.apiBaseUrl, authToken: session.authToken };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listPatientCaseAssessments({ ...config, patientCaseId });
      setAssessments([...result].sort((a, b) => b.performed_at.localeCompare(a.performed_at)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assessments.");
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

  async function handleRecord() {
    if (!notes.trim()) {
      setError("Enter assessment notes before recording.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createPatientCaseAssessment({ ...config, patientCaseId, sectionType, notes: notes.trim() });
      setAssessments((prev) => [created, ...prev]);
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record assessment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container} testID="assessment-screen">
      <Pressable onPress={onBack} testID="back-to-case">
        <Text style={styles.back}>‹ Patient case</Text>
      </Pressable>
      <Text style={styles.title}>Assessment</Text>

      {error ? (
        <Text style={styles.error} testID="assessment-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.form}>
        <View style={styles.sectionRow}>
          {SECTION_TYPES.map((section) => (
            <Pressable
              key={section.key}
              style={[styles.sectionChip, sectionType === section.key && styles.sectionChipActive]}
              onPress={() => setSectionType(section.key)}
              testID={`section-${section.key}`}
            >
              <Text style={[styles.sectionChipText, sectionType === section.key && styles.sectionChipTextActive]}>{section.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="Findings"
          value={notes}
          onChangeText={setNotes}
          multiline
          testID="assessment-notes"
        />
        <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleRecord} disabled={saving} testID="record-assessment">
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record assessment</Text>}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>History</Text>
      {loading ? (
        <ActivityIndicator testID="assessment-loading" />
      ) : (
        <FlatList
          testID="assessments-list"
          data={assessments}
          keyExtractor={(item) => item.assessment_id}
          ListEmptyComponent={
            <Text style={styles.hint} testID="assessments-empty">
              No assessments recorded yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`assessment-${item.assessment_id}`}>
              <Text style={styles.rowTime}>
                {item.performed_at} · {sectionLabel(item.section_type)}
              </Text>
              <Text style={styles.rowSummary}>{typeof item.payload?.notes === "string" ? item.payload.notes : ""}</Text>
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
    padding: 24
  },
  back: {
    color: "#1a4fd6",
    fontSize: 15,
    marginBottom: 16
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
  sectionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12
  },
  sectionChip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8
  },
  sectionChipActive: {
    backgroundColor: "#1a4fd6",
    borderColor: "#1a4fd6"
  },
  sectionChipText: {
    fontSize: 13,
    color: "#333"
  },
  sectionChipTextActive: {
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
    fontSize: 14
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top"
  },
  button: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4
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

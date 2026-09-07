import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { DISPOSITION_OUTCOMES, getPatientCaseDisposition, setPatientCaseDisposition, type DispositionOutcome } from "../api/disposition.ts";
import type { Session } from "../auth/session.ts";

export interface DispositionScreenProps {
  patientCaseId: string;
  session: Session;
  onBack: () => void;
}

function outcomeLabel(outcome: string): string {
  return outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DispositionScreen({ patientCaseId, session, onBack }: DispositionScreenProps) {
  const [outcome, setOutcome] = useState<DispositionOutcome | null>(null);
  const [destinationFacility, setDestinationFacility] = useState("");
  const [receivingProvider, setReceivingProvider] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const config = { apiBaseUrl: session.apiBaseUrl, authToken: session.authToken };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const existing = await getPatientCaseDisposition({ ...config, patientCaseId });
      if (existing) {
        setOutcome(existing.outcome);
        setDestinationFacility(existing.destination_facility ?? "");
        setReceivingProvider(existing.receiving_provider ?? "");
        setNotes(existing.notes ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load disposition.");
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

  async function handleSave() {
    if (!outcome) {
      setError("Select an outcome before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const saved = await setPatientCaseDisposition({
        ...config,
        patientCaseId,
        payload: {
          outcome,
          destination_facility: destinationFacility.trim() || undefined,
          receiving_provider: receivingProvider.trim() || undefined,
          notes: notes.trim() || undefined
        }
      });
      setSavedAt(saved.updated_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save disposition.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container} testID="disposition-screen">
        <ActivityIndicator style={styles.loading} testID="disposition-loading" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="disposition-screen">
      <Pressable onPress={onBack} testID="back-to-case">
        <Text style={styles.back}>‹ Patient case</Text>
      </Pressable>
      <Text style={styles.title}>Disposition</Text>
      <Text style={styles.subtitle}>Saving a disposition closes this patient case.</Text>

      {error ? (
        <Text style={styles.error} testID="disposition-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Outcome</Text>
        <View style={styles.outcomeGrid}>
          {DISPOSITION_OUTCOMES.map((value) => (
            <Pressable
              key={value}
              style={[styles.outcomeChip, outcome === value && styles.outcomeChipActive]}
              onPress={() => setOutcome(value)}
              testID={`outcome-${value}`}
            >
              <Text style={[styles.outcomeChipText, outcome === value && styles.outcomeChipTextActive]}>{outcomeLabel(value)}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Destination facility"
          value={destinationFacility}
          onChangeText={setDestinationFacility}
          testID="destination-facility"
        />
        <TextInput
          style={styles.input}
          placeholder="Receiving provider"
          value={receivingProvider}
          onChangeText={setReceivingProvider}
          testID="receiving-provider"
        />
        <TextInput style={[styles.input, styles.notesInput]} placeholder="Notes" value={notes} onChangeText={setNotes} multiline testID="disposition-notes" />

        {savedAt ? (
          <Text style={styles.savedNote} testID="disposition-saved">
            Saved
          </Text>
        ) : null}

        <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving} testID="save-disposition">
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save disposition</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24
  },
  loading: {
    marginTop: 24
  },
  back: {
    color: "#1a4fd6",
    fontSize: 15,
    marginBottom: 16
  },
  title: {
    fontSize: 22,
    fontWeight: "700"
  },
  subtitle: {
    fontSize: 13,
    color: "#999",
    marginBottom: 16
  },
  error: {
    fontSize: 13,
    color: "#b00020",
    marginBottom: 12
  },
  card: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 16,
    marginBottom: 24
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    marginBottom: 12,
    textTransform: "uppercase"
  },
  outcomeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12
  },
  outcomeChip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8
  },
  outcomeChipActive: {
    backgroundColor: "#1a4fd6",
    borderColor: "#1a4fd6"
  },
  outcomeChipText: {
    fontSize: 13,
    color: "#333"
  },
  outcomeChipTextActive: {
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
  savedNote: {
    fontSize: 13,
    color: "#1a7d3a",
    marginBottom: 8
  },
  button: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonDisabled: {
    backgroundColor: "#9aa8e0"
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600"
  }
});

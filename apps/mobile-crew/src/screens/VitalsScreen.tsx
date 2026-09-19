import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { createPatientCaseObservation, listPatientCaseObservations, type PatientCaseObservation, type VitalSigns } from "../api/observations.ts";
import type { Session } from "../auth/session.ts";
import { CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface VitalsScreenProps {
  patientCaseId: string;
  session: Session;
  onBack: () => void;
}

interface VitalField {
  key: keyof VitalSigns;
  label: string;
}

type SubmitState = "idle" | "pending" | "succeeded" | "error";

const VITAL_FIELDS: VitalField[] = [
  { key: "heart_rate_bpm", label: "Heart rate (bpm)" },
  { key: "blood_pressure_systolic", label: "BP systolic" },
  { key: "blood_pressure_diastolic", label: "BP diastolic" },
  { key: "respiratory_rate_bpm", label: "Respiratory rate (bpm)" },
  { key: "spo2_pct", label: "SpO2 (%)" },
  { key: "temperature_c", label: "Temperature (°C)" },
  { key: "gcs_total", label: "GCS total" },
  { key: "blood_glucose_mgdl", label: "Blood glucose (mg/dL)" }
];

function summarizeVitals(vitals: VitalSigns): string {
  const parts: string[] = [];
  if (vitals.heart_rate_bpm !== undefined) parts.push(`HR ${vitals.heart_rate_bpm}`);
  if (vitals.blood_pressure_systolic !== undefined || vitals.blood_pressure_diastolic !== undefined) {
    parts.push(`BP ${vitals.blood_pressure_systolic ?? "-"}/${vitals.blood_pressure_diastolic ?? "-"}`);
  }
  if (vitals.spo2_pct !== undefined) parts.push(`SpO2 ${vitals.spo2_pct}%`);
  if (vitals.respiratory_rate_bpm !== undefined) parts.push(`RR ${vitals.respiratory_rate_bpm}`);
  return parts.length > 0 ? parts.join(" · ") : "No values recorded";
}

function parseVitalSigns(values: Record<string, string>): VitalSigns {
  const vitalSigns: VitalSigns = {};
  for (const field of VITAL_FIELDS) {
    const raw = values[field.key];
    if (raw && raw.trim()) {
      const parsed = Number(raw.trim());
      if (Number.isFinite(parsed)) vitalSigns[field.key] = parsed;
    }
  }
  return vitalSigns;
}

export default function VitalsScreen({ patientCaseId, session, onBack }: VitalsScreenProps) {
  const [observations, setObservations] = useState<PatientCaseObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const submitInFlight = useRef(false);

  const config = { apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, deviceId: session.deviceId };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listPatientCaseObservations({ ...config, patientCaseId });
      setObservations([...result].sort((a, b) => b.performed_at.localeCompare(a.performed_at)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vitals.");
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

  function handleRepeatLast() {
    const last = observations[0];
    if (!last) return;
    const nextValues: Record<string, string> = {};
    for (const field of VITAL_FIELDS) {
      const value = last.observations[field.key];
      if (value !== undefined) nextValues[field.key] = String(value);
    }
    setFieldValues(nextValues);
  }

  async function handleRecord() {
    if (submitInFlight.current) return;
    const vitalSigns = parseVitalSigns(fieldValues);
    if (Object.keys(vitalSigns).length === 0) {
      setError("Enter at least one value before recording.");
      return;
    }

    submitInFlight.current = true;
    setSaving(true);
    setSubmitState("pending");
    setError(null);
    try {
      const created = await createPatientCaseObservation({ ...config, patientCaseId, vitalSigns, notes: notes.trim() });
      setObservations((prev) => [created, ...prev]);
      setFieldValues({});
      setNotes("");
      setSubmitState("succeeded");
    } catch {
      setError("Unable to record observations. Check the connection and try again later.");
      setSubmitState("error");
    } finally {
      submitInFlight.current = false;
      setSaving(false);
    }
  }

  const hasValidObservation = Object.keys(parseVitalSigns(fieldValues)).length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="vitals-screen">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to patient case" style={styles.backLink} testID="back-to-case">
        <Text style={styles.back}>‹ Patient case</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Vitals
      </Text>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="vitals-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.form} testID="observation-form">
        {observations.length > 0 ? (
          <Pressable
            style={styles.repeatButton}
            onPress={handleRepeatLast}
            accessibilityRole="button"
            accessibilityLabel="Repeat last vitals"
            testID="repeat-last-vitals"
          >
            <Text style={styles.repeatButtonText}>Repeat last vitals</Text>
          </Pressable>
        ) : null}
        {VITAL_FIELDS.map((field) => (
          <TextInput
            key={field.key}
            style={styles.input}
            placeholder={field.label}
            accessibilityLabel={field.label}
            keyboardType="numeric"
            value={fieldValues[field.key] ?? ""}
            onChangeText={(text) => setFieldValues((prev) => ({ ...prev, [field.key]: text }))}
            testID={`vital-input-${field.key}`}
          />
        ))}
        <TextInput style={styles.input} placeholder="Notes" accessibilityLabel="Notes" value={notes} onChangeText={setNotes} testID="vitals-notes" />
        <Text testID={`observation-submit-${submitState}`} />
        <Pressable
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleRecord}
          disabled={saving || !hasValidObservation}
          accessibilityRole="button"
          accessibilityLabel="Record vitals"
          accessibilityState={{ disabled: saving || !hasValidObservation }}
          testID="observation-submit"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record vitals</Text>}
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>History</Text>
      {loading ? (
        <ActivityIndicator testID="vitals-loading" />
      ) : (
        observations.length === 0 ? <Text style={styles.hint} testID="vitals-empty">No vitals recorded yet.</Text> : observations.map((item) => (
          <View style={styles.row} testID={`observation-entry-${item.observation_event_id}`} key={item.observation_event_id}>
            <Text style={styles.rowTime}>{item.performed_at}</Text>
            <Text style={styles.rowSummary}>{summarizeVitals(item.observations)}</Text>
            {item.notes ? <Text style={styles.rowNotes}>{item.notes}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
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
  content: { padding: 24 },
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
  repeatButton: {
    alignSelf: "flex-start",
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center",
    marginBottom: 10
  },
  repeatButtonText: {
    color: "#1a4fd6",
    fontSize: 13,
    fontWeight: "600"
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
    color: "#111",
    fontWeight: "600"
  },
  rowNotes: {
    fontSize: 13,
    color: "#555",
    marginTop: 2
  }
});

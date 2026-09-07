import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { AssignedJob } from "../api/assignments.ts";
import { createPatientCase, listPatientCases, type PatientCase } from "../api/patientCases.ts";
import type { Session } from "../auth/session.ts";
import { CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface IncidentDetailScreenProps {
  job: AssignedJob;
  session: Session;
  onBack: () => void;
  onSelectPatientCase: (patientCase: PatientCase) => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function IncidentDetailScreen({ job, session, onBack, onSelectPatientCase }: IncidentDetailScreenProps) {
  const incident = job.incident;
  const incidentId = incident?.incident_id ?? null;

  const [cases, setCases] = useState<PatientCase[]>([]);
  const [loading, setLoading] = useState(Boolean(incidentId));
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!incidentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listPatientCases({ apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, incidentId });
      setCases(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patient cases.");
    } finally {
      setLoading(false);
    }
  }, [incidentId, session.apiBaseUrl, session.authToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!incidentId) return;
    setCreating(true);
    setError(null);
    try {
      const payload = label.trim() ? { assignment_id: job.assignment_id, temporary_label: label.trim() } : { assignment_id: job.assignment_id };
      const created = await createPatientCase({ apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, incidentId, payload });
      setLabel("");
      setCases((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create patient case.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScrollView style={styles.container} testID="incident-detail-screen">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to assigned jobs" style={styles.backLink} testID="back-to-jobs">
        <Text style={styles.back}>‹ Assigned jobs</Text>
      </Pressable>

      <Text style={styles.title} accessibilityRole="header">
        {incident?.incident_id ?? "Unlinked incident"}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Incident</Text>
        <Row label="Status" value={incident?.status ?? "Unavailable"} />
        <Row label="Priority" value={incident?.priority ?? "Unavailable"} />
        <Row label="Location" value={incident?.location_summary ?? "Unavailable"} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Assignment</Text>
        <Row label="Assignment ID" value={job.assignment_id} />
        <Row label="Status" value={job.status} />
        <Row label="Vehicle" value={job.vehicle_id} />
        <Row label="Vehicle status" value={job.vehicle_status} />
        <Row label="Crew" value={job.crew_ids.join(", ")} />
        <Row label="Updated" value={job.updated_at} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Patient cases</Text>

        {!incidentId ? (
          <Text style={styles.hint}>No linked incident — patient cases are unavailable.</Text>
        ) : loading ? (
          <ActivityIndicator testID="patient-cases-loading" />
        ) : (
          <>
            {error ? (
              <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="patient-cases-error">
                {error}
              </Text>
            ) : null}

            {cases.length === 0 ? (
              <Text style={styles.hint} testID="patient-cases-empty">
                No patient cases yet.
              </Text>
            ) : (
              cases.map((patientCase) => (
                <Pressable
                  key={patientCase.patient_case_id}
                  style={styles.caseRow}
                  onPress={() => onSelectPatientCase(patientCase)}
                  accessibilityRole="button"
                  accessibilityLabel={`Patient ${patientCase.patient_sequence}${patientCase.temporary_label ? ` — ${patientCase.temporary_label}` : ""}, status ${patientCase.status}`}
                  testID={`patient-case-${patientCase.patient_case_id}`}
                >
                  <Text style={styles.caseLabel}>
                    Patient {patientCase.patient_sequence}
                    {patientCase.temporary_label ? ` — ${patientCase.temporary_label}` : ""}
                  </Text>
                  <Text style={styles.caseStatus}>{patientCase.status}</Text>
                </Pressable>
              ))
            )}

            <TextInput
              style={styles.input}
              placeholder="Optional label (e.g. driver, unidentified male)"
              accessibilityLabel="Optional patient case label"
              value={label}
              onChangeText={setLabel}
              testID="new-case-label"
            />
            <Pressable
              style={[styles.button, creating && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={creating}
              accessibilityRole="button"
              accessibilityLabel="New patient case"
              testID="create-patient-case"
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>New patient case</Text>}
            </Pressable>
          </>
        )}
      </View>

      <Text style={styles.placeholder}>
        Patient identification (search/link/create in OpenEMR) and the assessment/vitals/handover workflow land in the next
        milestone.
      </Text>
    </ScrollView>
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
  card: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    marginBottom: 8,
    textTransform: "uppercase"
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4
  },
  rowLabel: {
    fontSize: 14,
    color: "#777"
  },
  rowValue: {
    fontSize: 14,
    color: "#111",
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12
  },
  hint: {
    fontSize: 13,
    color: "#999"
  },
  error: {
    fontSize: 13,
    color: "#b00020",
    marginBottom: 8
  },
  caseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    minHeight: TOUCH_TARGET_MIN
  },
  caseLabel: {
    fontSize: 14,
    color: "#111"
  },
  caseStatus: {
    fontSize: 12,
    color: "#1a4fd6",
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    fontSize: 14,
    minHeight: TOUCH_TARGET_MIN
  },
  button: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
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
  placeholder: {
    fontSize: 13,
    color: "#999",
    marginTop: 8,
    marginBottom: 32
  }
});

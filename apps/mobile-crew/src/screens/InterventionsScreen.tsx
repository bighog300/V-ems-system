import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import {
  createPatientCaseMedication,
  createPatientCaseProcedure,
  listPatientCaseMedications,
  listPatientCaseProcedures,
  type ClinicalProcedure,
  type MedicationAdministration
} from "../api/interventions.ts";
import type { Session } from "../auth/session.ts";

export interface InterventionsScreenProps {
  patientCaseId: string;
  session: Session;
  onBack: () => void;
}

type Tab = "medications" | "procedures";

export default function InterventionsScreen({ patientCaseId, session, onBack }: InterventionsScreenProps) {
  const [tab, setTab] = useState<Tab>("medications");

  const [medications, setMedications] = useState<MedicationAdministration[]>([]);
  const [procedures, setProcedures] = useState<ClinicalProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medDoseUnit, setMedDoseUnit] = useState("");
  const [medRoute, setMedRoute] = useState("");

  const [procType, setProcType] = useState("");
  const [procName, setProcName] = useState("");
  const [procSuccess, setProcSuccess] = useState(true);

  const config = { apiBaseUrl: session.apiBaseUrl, authToken: session.authToken };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meds, procs] = await Promise.all([
        listPatientCaseMedications({ ...config, patientCaseId }),
        listPatientCaseProcedures({ ...config, patientCaseId })
      ]);
      setMedications([...meds].sort((a, b) => b.performed_at.localeCompare(a.performed_at)));
      setProcedures([...procs].sort((a, b) => b.performed_at.localeCompare(a.performed_at)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interventions.");
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

  async function handleRecordMedication() {
    if (!medName.trim() || !medDose.trim() || !medDoseUnit.trim() || !medRoute.trim()) {
      setError("Medication name, dose, dose unit and route are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createPatientCaseMedication({
        ...config,
        patientCaseId,
        payload: { medication_name: medName.trim(), dose: medDose.trim(), dose_unit: medDoseUnit.trim(), route: medRoute.trim() }
      });
      setMedications((prev) => [created, ...prev]);
      setMedName("");
      setMedDose("");
      setMedDoseUnit("");
      setMedRoute("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record medication.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordProcedure() {
    if (!procType.trim() || !procName.trim()) {
      setError("Procedure type and name are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createPatientCaseProcedure({
        ...config,
        patientCaseId,
        payload: { procedure_type: procType.trim(), procedure_name: procName.trim(), success: procSuccess }
      });
      setProcedures((prev) => [created, ...prev]);
      setProcType("");
      setProcName("");
      setProcSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record procedure.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container} testID="interventions-screen">
      <Pressable onPress={onBack} testID="back-to-case">
        <Text style={styles.back}>‹ Patient case</Text>
      </Pressable>
      <Text style={styles.title}>Interventions</Text>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === "medications" && styles.tabActive]} onPress={() => setTab("medications")} testID="tab-medications">
          <Text style={[styles.tabText, tab === "medications" && styles.tabTextActive]}>Medications</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "procedures" && styles.tabActive]} onPress={() => setTab("procedures")} testID="tab-procedures">
          <Text style={[styles.tabText, tab === "procedures" && styles.tabTextActive]}>Procedures</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error} testID="interventions-error">
          {error}
        </Text>
      ) : null}

      {tab === "medications" ? (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Medication name" value={medName} onChangeText={setMedName} testID="med-name" />
          <TextInput style={styles.input} placeholder="Dose" value={medDose} onChangeText={setMedDose} testID="med-dose" />
          <TextInput style={styles.input} placeholder="Dose unit (e.g. mg)" value={medDoseUnit} onChangeText={setMedDoseUnit} testID="med-dose-unit" />
          <TextInput style={styles.input} placeholder="Route (e.g. IV, IM, oral)" value={medRoute} onChangeText={setMedRoute} testID="med-route" />
          <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleRecordMedication} disabled={saving} testID="record-medication">
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record medication</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Procedure type" value={procType} onChangeText={setProcType} testID="proc-type" />
          <TextInput style={styles.input} placeholder="Procedure name" value={procName} onChangeText={setProcName} testID="proc-name" />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Successful</Text>
            <Switch value={procSuccess} onValueChange={setProcSuccess} testID="proc-success" />
          </View>
          <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleRecordProcedure} disabled={saving} testID="record-procedure">
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Record procedure</Text>}
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>History</Text>
      {loading ? (
        <ActivityIndicator testID="interventions-loading" />
      ) : tab === "medications" ? (
        <FlatList
          testID="medications-list"
          data={medications}
          keyExtractor={(item) => item.medication_administration_id}
          ListEmptyComponent={
            <Text style={styles.hint} testID="medications-empty">
              No medications recorded yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`medication-${item.medication_administration_id}`}>
              <Text style={styles.rowTime}>{item.performed_at}</Text>
              <Text style={styles.rowSummary}>
                {item.medication_name} · {item.dose}
                {item.dose_unit} {item.route}
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          testID="procedures-list"
          data={procedures}
          keyExtractor={(item) => item.procedure_id}
          ListEmptyComponent={
            <Text style={styles.hint} testID="procedures-empty">
              No procedures recorded yet.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID={`procedure-${item.procedure_id}`}>
              <Text style={styles.rowTime}>{item.performed_at}</Text>
              <Text style={styles.rowSummary}>
                {item.procedure_name} · {item.success ? "Successful" : "Unsuccessful"}
              </Text>
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
  tabRow: {
    flexDirection: "row",
    marginBottom: 16
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#e0e0e0"
  },
  tabActive: {
    borderBottomColor: "#1a4fd6"
  },
  tabText: {
    fontSize: 14,
    color: "#999"
  },
  tabTextActive: {
    color: "#1a4fd6",
    fontWeight: "600"
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
    fontSize: 14
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  switchLabel: {
    fontSize: 14,
    color: "#333"
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
    color: "#111",
    fontWeight: "600"
  }
});

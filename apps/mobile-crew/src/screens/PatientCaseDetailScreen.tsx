import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { createPatientCaseEncounter, getPatientCaseEncounter, type PatientCaseEncounter } from "../api/encounters.ts";
import { getPatientCase, getPatientCaseDemographics, savePatientCaseDemographics, type PatientCase, type PatientCaseDemographics } from "../api/patientCases.ts";
import type { Session } from "../auth/session.ts";

export interface PatientCaseDetailScreenProps {
  patientCase: PatientCase;
  session: Session;
  onBack: () => void;
  onOpenIdentity: (patientCase: PatientCase) => void;
  onOpenVitals: (patientCaseId: string) => void;
  onOpenInterventions: (patientCaseId: string) => void;
}

export default function PatientCaseDetailScreen({
  patientCase: initialCase,
  session,
  onBack,
  onOpenIdentity,
  onOpenVitals,
  onOpenInterventions
}: PatientCaseDetailScreenProps) {
  const [caseState, setCaseState] = useState(initialCase);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [dobUnknown, setDobUnknown] = useState(false);
  const [sex, setSex] = useState("");
  const [unidentified, setUnidentified] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [encounter, setEncounter] = useState<PatientCaseEncounter | null>(null);
  const [presentingComplaint, setPresentingComplaint] = useState("");
  const [creatingEncounter, setCreatingEncounter] = useState(false);
  const [encounterError, setEncounterError] = useState<string | null>(null);

  const applyDemographics = (demographics: PatientCaseDemographics | null) => {
    setFirstName(demographics?.first_name ?? "");
    setLastName(demographics?.last_name ?? "");
    setDob(demographics?.dob ?? "");
    setDobUnknown(demographics?.dob_unknown ?? false);
    setSex(demographics?.sex ?? "");
    setUnidentified(demographics?.unidentified ?? false);
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const [refreshedCase, demographics, refreshedEncounter] = await Promise.all([
            getPatientCase({ apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, patientCaseId: initialCase.patient_case_id }),
            getPatientCaseDemographics({ apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, patientCaseId: initialCase.patient_case_id }),
            getPatientCaseEncounter({ apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, patientCaseId: initialCase.patient_case_id })
          ]);
          if (cancelled) return;
          setCaseState(refreshedCase);
          applyDemographics(demographics);
          setEncounter(refreshedEncounter);
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load patient case.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [initialCase.patient_case_id, session.apiBaseUrl, session.authToken])
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const payload: Partial<PatientCaseDemographics> = {
        unidentified,
        dob_unknown: dobUnknown
      };
      if (firstName.trim()) payload.first_name = firstName.trim();
      if (lastName.trim()) payload.last_name = lastName.trim();
      if (sex.trim()) payload.sex = sex.trim();
      if (!dobUnknown && dob.trim()) payload.dob = dob.trim();

      const saved = await savePatientCaseDemographics({
        apiBaseUrl: session.apiBaseUrl,
        authToken: session.authToken,
        patientCaseId: caseState.patient_case_id,
        payload
      });
      applyDemographics(saved);
      setSavedAt(saved.updated_at ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save demographics.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEncounter() {
    setCreatingEncounter(true);
    setEncounterError(null);
    try {
      const created = await createPatientCaseEncounter({
        apiBaseUrl: session.apiBaseUrl,
        authToken: session.authToken,
        patientCaseId: caseState.patient_case_id,
        payload: { care_started_at: new Date().toISOString(), presenting_complaint: presentingComplaint.trim() }
      });
      setEncounter(created);
    } catch (err) {
      setEncounterError(err instanceof Error ? err.message : "Failed to start encounter.");
    } finally {
      setCreatingEncounter(false);
    }
  }

  const canStartEncounter = caseState.openemr_patient_id && ["verified", "provisional"].includes(caseState.verification_status);

  return (
    <ScrollView style={styles.container} testID="patient-case-detail-screen">
      <Pressable onPress={onBack} testID="back-to-incident">
        <Text style={styles.back}>‹ Incident</Text>
      </Pressable>

      <Text style={styles.title}>
        Patient {caseState.patient_sequence}
        {caseState.temporary_label ? ` — ${caseState.temporary_label}` : ""}
      </Text>
      <Text style={styles.meta}>
        {caseState.patient_case_id} · {caseState.status}
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loading} testID="demographics-loading" />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Patient identity</Text>
            {error ? (
              <Text style={styles.error} testID="demographics-error">
                {error}
              </Text>
            ) : null}
            <Text style={styles.identityStatus}>
              {caseState.openemr_patient_id ? `Linked to ${caseState.openemr_patient_id} (${caseState.verification_status})` : "Not yet identified"}
            </Text>
            <Pressable style={styles.button} onPress={() => onOpenIdentity(caseState)} testID="open-identity">
              <Text style={styles.buttonText}>{caseState.openemr_patient_id ? "View identity" : "Identify patient"}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Demographics</Text>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Unidentified patient</Text>
              <Switch value={unidentified} onValueChange={setUnidentified} testID="unidentified-switch" />
            </View>

            <TextInput
              style={styles.input}
              placeholder="First name"
              value={firstName}
              onChangeText={setFirstName}
              editable={!unidentified}
              testID="first-name-input"
            />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              value={lastName}
              onChangeText={setLastName}
              editable={!unidentified}
              testID="last-name-input"
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Date of birth unknown</Text>
              <Switch value={dobUnknown} onValueChange={setDobUnknown} testID="dob-unknown-switch" />
            </View>
            {!dobUnknown ? (
              <TextInput
                style={styles.input}
                placeholder="DOB (YYYY-MM-DD)"
                value={dob}
                onChangeText={setDob}
                testID="dob-input"
              />
            ) : null}

            <TextInput style={styles.input} placeholder="Sex" value={sex} onChangeText={setSex} testID="sex-input" />

            {savedAt ? (
              <Text style={styles.savedNote} testID="demographics-saved">
                Saved
              </Text>
            ) : null}

            <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving} testID="save-demographics">
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save demographics</Text>}
            </Pressable>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Encounter</Text>

            {encounterError ? (
              <Text style={styles.error} testID="encounter-error">
                {encounterError}
              </Text>
            ) : null}

            {encounter ? (
              <>
                <Text style={styles.identityStatus}>
                  {encounter.encounter_id} · {encounter.status}
                </Text>
                <Text style={styles.hint}>Started {encounter.care_started_at}</Text>
                <Pressable style={[styles.button, styles.spacedButton]} onPress={() => onOpenVitals(caseState.patient_case_id)} testID="open-vitals">
                  <Text style={styles.buttonText}>Vitals</Text>
                </Pressable>
                <Pressable
                  style={[styles.button, styles.spacedButton]}
                  onPress={() => onOpenInterventions(caseState.patient_case_id)}
                  testID="open-interventions"
                >
                  <Text style={styles.buttonText}>Interventions</Text>
                </Pressable>
              </>
            ) : !canStartEncounter ? (
              <Text style={styles.hint} testID="encounter-blocked">
                Identify the patient (verified or unidentified) before starting an encounter.
              </Text>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Presenting complaint"
                  value={presentingComplaint}
                  onChangeText={setPresentingComplaint}
                  testID="presenting-complaint-input"
                />
                <Pressable
                  style={[styles.button, (creatingEncounter || !presentingComplaint.trim()) && styles.buttonDisabled]}
                  onPress={handleCreateEncounter}
                  disabled={creatingEncounter || !presentingComplaint.trim()}
                  testID="start-encounter"
                >
                  {creatingEncounter ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start encounter</Text>}
                </Pressable>
              </>
            )}
          </View>
        </>
      )}

      <Text style={styles.placeholder}>Assessment and handover charting land in the next milestone.</Text>
    </ScrollView>
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
    fontWeight: "700"
  },
  meta: {
    fontSize: 13,
    color: "#777",
    marginBottom: 16
  },
  loading: {
    marginTop: 24
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
    marginBottom: 12,
    textTransform: "uppercase"
  },
  identityStatus: {
    fontSize: 14,
    color: "#333",
    marginBottom: 12
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
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  switchLabel: {
    fontSize: 14,
    color: "#333"
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14
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
  spacedButton: {
    marginTop: 10
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

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  createPatient,
  createProvisionalPatient,
  linkPatientToPatientCase,
  searchPatients,
  type PatientCandidate,
  type PatientSearchResult
} from "../api/patientIdentity.ts";
import type { PatientCase } from "../api/patientCases.ts";
import type { Session } from "../auth/session.ts";
import BarcodeScannerModal from "../scanning/BarcodeScannerModal.tsx";
import { CHIP_TARGET_MIN, CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

// Three ways a crew actually identifies someone in the field: an identity
// number, a hospital's own card number, or -- lacking either -- name, date
// of birth and a known address to break ties between common names. All
// three now reach the downstream search (see patientIdentity.ts's
// SearchPatientsArgs) -- this screen just needs a field set per mode.
type SearchMode = "identity_number" | "hospital_card_number" | "name";
const SEARCH_MODES: { mode: SearchMode; label: string }[] = [
  { mode: "identity_number", label: "ID number" },
  { mode: "hospital_card_number", label: "Hospital card" },
  { mode: "name", label: "Name + DOB + address" }
];

export interface PatientIdentityScreenProps {
  patientCase: PatientCase;
  session: Session;
  onBack: () => void;
  onLinked: () => void;
}

export default function PatientIdentityScreen({ patientCase, session, onBack, onLinked }: PatientIdentityScreenProps) {
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [identityNumber, setIdentityNumber] = useState("");
  const [hospitalCardNumber, setHospitalCardNumber] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [sex, setSex] = useState("");
  const [scanTarget, setScanTarget] = useState<"identity_number" | "hospital_card_number" | null>(null);

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<PatientSearchResult | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = { apiBaseUrl: session.apiBaseUrl, authToken: session.authToken, deviceId: session.deviceId };

  const canSearch =
    searchMode === "identity_number"
      ? Boolean(identityNumber.trim())
      : searchMode === "hospital_card_number"
        ? Boolean(hospitalCardNumber.trim())
        : Boolean(firstName.trim() || lastName.trim() || dob.trim() || address.trim());

  function handleScanned(code: string) {
    if (scanTarget === "identity_number") setIdentityNumber(code);
    else if (scanTarget === "hospital_card_number") setHospitalCardNumber(code);
    setScanTarget(null);
  }

  async function handleSearch() {
    setSearching(true);
    setError(null);
    setResult(null);
    try {
      const criteria =
        searchMode === "identity_number"
          ? { identity_number: identityNumber.trim() || undefined }
          : searchMode === "hospital_card_number"
            ? { hospital_card_number: hospitalCardNumber.trim() || undefined }
            : {
                first_name: firstName.trim() || undefined,
                last_name: lastName.trim() || undefined,
                dob: dob.trim() || undefined,
                address: address.trim() || undefined
              };
      const searchResult = await searchPatients({ ...config, criteria });
      setResult(searchResult);
      setShowCreateForm(searchResult.match_status === "no_match");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Patient search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function handleLinkCandidate(candidate: PatientCandidate) {
    setBusy(true);
    setError(null);
    try {
      await linkPatientToPatientCase({
        ...config,
        patientCaseId: patientCase.patient_case_id,
        verificationStatus: "verified",
        openemrPatientId: candidate.patient_id
      });
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link patient.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAndLink() {
    setBusy(true);
    setError(null);
    try {
      const created = await createPatient({
        ...config,
        patient: { first_name: firstName.trim(), last_name: lastName.trim(), dob: dob.trim(), sex: sex.trim() || undefined }
      });
      await linkPatientToPatientCase({
        ...config,
        patientCaseId: patientCase.patient_case_id,
        verificationStatus: "verified",
        openemrPatientId: created.patient_id
      });
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create and link patient.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkUnidentified() {
    setBusy(true);
    setError(null);
    try {
      await createProvisionalPatient({ ...config, patientCaseId: patientCase.patient_case_id });
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark patient unidentified.");
    } finally {
      setBusy(false);
    }
  }

  if (patientCase.openemr_patient_id) {
    return (
      <View style={styles.container} testID="patient-identity-screen">
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to patient case" style={styles.backLink} testID="back-to-case">
          <Text style={styles.back}>‹ Patient case</Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Patient identity
        </Text>
        <View style={styles.card}>
          <Text style={styles.linkedNote}>
            Linked to {patientCase.openemr_patient_id} ({patientCase.verification_status})
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="patient-identity-screen">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to patient case" style={styles.backLink} testID="back-to-case">
        <Text style={styles.back}>‹ Patient case</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        Patient identity
      </Text>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="identity-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Search OpenEMR</Text>

        <View style={styles.tabRow}>
          {SEARCH_MODES.map(({ mode, label }) => (
            <Pressable
              key={mode}
              onPress={() => setSearchMode(mode)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: searchMode === mode }}
              style={[styles.tab, searchMode === mode && styles.tabActive]}
              testID={`search-mode-${mode}`}
            >
              <Text style={[styles.tabText, searchMode === mode && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {searchMode === "identity_number" ? (
          <View style={styles.scanRow}>
            <TextInput
              style={[styles.input, styles.scanInput]}
              placeholder="Identity number"
              accessibilityLabel="Identity number"
              value={identityNumber}
              onChangeText={setIdentityNumber}
              testID="search-identity-number"
            />
            <Pressable
              onPress={() => setScanTarget("identity_number")}
              accessibilityRole="button"
              accessibilityLabel="Scan identity number barcode"
              style={styles.scanButton}
              testID="scan-identity-number"
            >
              <Text style={styles.scanButtonText}>Scan</Text>
            </Pressable>
          </View>
        ) : searchMode === "hospital_card_number" ? (
          <View style={styles.scanRow}>
            <TextInput
              style={[styles.input, styles.scanInput]}
              placeholder="Hospital card number"
              accessibilityLabel="Hospital card number"
              value={hospitalCardNumber}
              onChangeText={setHospitalCardNumber}
              testID="search-hospital-card-number"
            />
            <Pressable
              onPress={() => setScanTarget("hospital_card_number")}
              accessibilityRole="button"
              accessibilityLabel="Scan hospital card barcode"
              style={styles.scanButton}
              testID="scan-hospital-card-number"
            >
              <Text style={styles.scanButtonText}>Scan</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="First name"
              accessibilityLabel="First name"
              value={firstName}
              onChangeText={setFirstName}
              testID="search-first-name"
            />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              accessibilityLabel="Last name"
              value={lastName}
              onChangeText={setLastName}
              testID="search-last-name"
            />
            <TextInput
              style={styles.input}
              placeholder="DOB (YYYY-MM-DD)"
              accessibilityLabel="Date of birth"
              value={dob}
              onChangeText={setDob}
              testID="search-dob"
            />
            <TextInput
              style={styles.input}
              placeholder="Known address"
              accessibilityLabel="Known address"
              value={address}
              onChangeText={setAddress}
              testID="search-address"
            />
          </>
        )}

        <Pressable
          style={[styles.button, (searching || !canSearch) && styles.buttonDisabled]}
          onPress={handleSearch}
          disabled={searching || !canSearch}
          accessibilityRole="button"
          accessibilityLabel="Search"
          testID="search-submit"
        >
          {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Search</Text>}
        </Pressable>
      </View>

      <BarcodeScannerModal visible={scanTarget !== null} onScanned={handleScanned} onClose={() => setScanTarget(null)} />

      {result ? (
        <View style={styles.card} testID="search-results">
          <Text style={styles.cardTitle}>Results ({result.match_status})</Text>
          {result.candidates.length === 0 ? (
            <Text style={styles.hint}>No matching patients found.</Text>
          ) : (
            result.candidates.map((candidate) => (
              <View key={candidate.patient_id} style={styles.candidateRow} testID={`candidate-${candidate.patient_id}`}>
                <Text style={styles.candidateName}>{candidate.display_name}</Text>
                <Pressable
                  style={[styles.smallButton, busy && styles.buttonDisabled]}
                  onPress={() => handleLinkCandidate(candidate)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Link ${candidate.display_name}`}
                  testID={`link-${candidate.patient_id}`}
                >
                  <Text style={styles.smallButtonText}>Link</Text>
                </Pressable>
              </View>
            ))
          )}
          <Pressable
            onPress={() => setShowCreateForm(true)}
            accessibilityRole="button"
            accessibilityLabel="None of these — create a new patient"
            style={styles.linkButton}
            testID="show-create-form"
          >
            <Text style={styles.linkText}>None of these — create a new patient</Text>
          </Pressable>
        </View>
      ) : null}

      {showCreateForm ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create new patient</Text>
          <TextInput style={styles.input} placeholder="Sex" accessibilityLabel="Sex" value={sex} onChangeText={setSex} testID="create-sex" />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleCreateAndLink}
            disabled={busy || !firstName.trim() || !lastName.trim() || !dob.trim()}
            accessibilityRole="button"
            accessibilityLabel="Create and link"
            testID="create-and-link"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create and link</Text>}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Unable to identify</Text>
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={handleMarkUnidentified}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Mark as unidentified"
          testID="mark-unidentified"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Mark as unidentified</Text>}
        </Pressable>
      </View>
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
    marginBottom: 12,
    textTransform: "uppercase"
  },
  error: {
    fontSize: 13,
    color: "#b00020",
    marginBottom: 12
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14,
    minHeight: TOUCH_TARGET_MIN
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12
  },
  tab: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: CHIP_TARGET_MIN,
    justifyContent: "center"
  },
  tabActive: {
    borderColor: "#1a4fd6",
    backgroundColor: "#eef2ff"
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555"
  },
  tabTextActive: {
    color: "#1a4fd6"
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  scanInput: {
    flex: 1
  },
  scanButton: {
    minHeight: TOUCH_TARGET_MIN,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1a4fd6",
    borderRadius: 8,
    marginBottom: 12
  },
  scanButtonText: {
    color: "#1a4fd6",
    fontSize: 13,
    fontWeight: "700"
  },
  button: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
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
  hint: {
    fontSize: 13,
    color: "#999"
  },
  candidateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    minHeight: TOUCH_TARGET_MIN
  },
  candidateName: {
    fontSize: 14,
    color: "#111",
    flexShrink: 1,
    marginRight: 12
  },
  smallButton: {
    borderWidth: 1,
    borderColor: "#1a4fd6",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: CHIP_TARGET_MIN,
    minWidth: CHIP_TARGET_MIN,
    alignItems: "center",
    justifyContent: "center"
  },
  smallButtonText: {
    color: "#1a4fd6",
    fontSize: 13,
    fontWeight: "600"
  },
  linkButton: {
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center",
    marginTop: 8
  },
  linkText: {
    color: "#1a4fd6",
    fontSize: 13
  },
  linkedNote: {
    fontSize: 14,
    color: "#1a7d3a"
  }
});

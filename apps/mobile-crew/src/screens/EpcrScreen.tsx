import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  SIGNATURE_ROLES,
  completeEpcr,
  getEpcrLifecycle,
  getEpcrReadiness,
  listEpcrSignatures,
  signEpcr,
  submitEpcr,
  type EpcrLifecycle,
  type EpcrReadiness,
  type EpcrSignature,
  type SignatureRole
} from "../api/epcr.ts";
import type { Session } from "../auth/session.ts";
import { CHIP_TARGET_MIN, CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface EpcrScreenProps {
  patientCaseId: string;
  session: Session;
  onBack: () => void;
}

function stateLabel(state: string): string {
  return state.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EpcrScreen({ patientCaseId, session, onBack }: EpcrScreenProps) {
  const [lifecycle, setLifecycle] = useState<EpcrLifecycle | null>(null);
  const [readiness, setReadiness] = useState<EpcrReadiness | null>(null);
  const [signatures, setSignatures] = useState<EpcrSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [signerRole, setSignerRole] = useState<SignatureRole>("crew_member");
  const [signerIdentity, setSignerIdentity] = useState("");

  const config = { apiBaseUrl: session.apiBaseUrl, authToken: session.authToken };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lc, rd, sigs] = await Promise.all([
        getEpcrLifecycle({ ...config, patientCaseId }),
        getEpcrReadiness({ ...config, patientCaseId }),
        listEpcrSignatures({ ...config, patientCaseId })
      ]);
      setLifecycle(lc);
      setReadiness(rd);
      setSignatures(sigs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ePCR status.");
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

  async function handleComplete() {
    setBusy(true);
    setError(null);
    try {
      await completeEpcr({ ...config, patientCaseId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete ePCR.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSign() {
    if (!signerIdentity.trim()) {
      setError("Enter the signer's identity before signing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await signEpcr({ ...config, patientCaseId, payload: { signer_role: signerRole, signer_identity: signerIdentity.trim() } });
      setSignatures(updated);
      setSignerIdentity("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record signature.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      await submitEpcr({ ...config, patientCaseId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit ePCR.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container} testID="epcr-screen">
        <ActivityIndicator style={styles.loading} testID="epcr-loading" />
      </View>
    );
  }

  const state = lifecycle?.current_state ?? "draft";

  return (
    <ScrollView style={styles.container} testID="epcr-screen">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to patient case" style={styles.backLink} testID="back-to-case">
        <Text style={styles.back}>‹ Patient case</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        ePCR status
      </Text>
      <Text style={styles.stateLabel} testID="epcr-state">
        {stateLabel(state)}
      </Text>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="epcr-error">
          {error}
        </Text>
      ) : null}

      {(state === "draft" || state === "returned_for_correction") && readiness ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Readiness</Text>
          {readiness.ready ? (
            <Text style={styles.readyText} testID="epcr-ready">
              Ready to complete.
            </Text>
          ) : (
            readiness.missing.map((item) => (
              <Text key={item.id} style={styles.missingText} testID={`missing-${item.id}`}>
                • {item.message}
              </Text>
            ))
          )}
          <Pressable
            style={[styles.button, (!readiness.ready || busy) && styles.buttonDisabled]}
            onPress={handleComplete}
            disabled={!readiness.ready || busy}
            accessibilityRole="button"
            accessibilityLabel="Complete ePCR"
            testID="complete-epcr"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Complete ePCR</Text>}
          </Pressable>
        </View>
      ) : null}

      {state === "crew_complete" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign</Text>
          <View style={styles.chipRow}>
            {SIGNATURE_ROLES.map((role) => (
              <Pressable
                key={role}
                style={[styles.chip, signerRole === role && styles.chipActive]}
                onPress={() => setSignerRole(role)}
                accessibilityRole="button"
                accessibilityState={{ selected: signerRole === role }}
                accessibilityLabel={stateLabel(role)}
                testID={`signer-role-${role}`}
              >
                <Text style={[styles.chipText, signerRole === role && styles.chipTextActive]}>{stateLabel(role)}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Signer name/ID"
            accessibilityLabel="Signer name or ID"
            value={signerIdentity}
            onChangeText={setSignerIdentity}
            testID="signer-identity"
          />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleSign}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sign"
            testID="sign-epcr"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign</Text>}
          </Pressable>
        </View>
      ) : null}

      {state === "signed" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Submit</Text>
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Submit ePCR"
            testID="submit-epcr"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit ePCR</Text>}
          </Pressable>
        </View>
      ) : null}

      {["submitted", "qa_review", "final"].includes(state) ? (
        <View style={styles.card}>
          <Text style={styles.hint}>
            This ePCR has been submitted and is awaiting or has completed clinical review. Review and finalization happen outside this
            app.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signatures</Text>
        {signatures.length === 0 ? (
          <Text style={styles.hint} testID="signatures-empty">
            No signatures recorded yet.
          </Text>
        ) : (
          signatures.map((signature) => (
            <View key={signature.signature_id} style={styles.row} testID={`signature-${signature.signature_id}`}>
              <Text style={styles.rowSummary}>
                {stateLabel(signature.signer_role)} · {signature.signer_identity}
              </Text>
              <Text style={styles.rowTime}>{signature.signed_at}</Text>
            </View>
          ))
        )}
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
  loading: {
    marginTop: 24
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
    fontWeight: "700"
  },
  stateLabel: {
    fontSize: 15,
    color: "#1a4fd6",
    fontWeight: "600",
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
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    marginBottom: 12,
    textTransform: "uppercase"
  },
  readyText: {
    fontSize: 14,
    color: "#1a7d3a",
    marginBottom: 12
  },
  missingText: {
    fontSize: 13,
    color: "#b00020",
    marginBottom: 4
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12
  },
  chip: {
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
  chipActive: {
    backgroundColor: "#1a4fd6",
    borderColor: "#1a4fd6"
  },
  chipText: {
    fontSize: 13,
    color: "#333"
  },
  chipTextActive: {
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
  hint: {
    fontSize: 13,
    color: "#999"
  },
  row: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0"
  },
  rowSummary: {
    fontSize: 14,
    color: "#111",
    fontWeight: "600"
  },
  rowTime: {
    fontSize: 12,
    color: "#999"
  }
});

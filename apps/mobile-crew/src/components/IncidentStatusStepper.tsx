import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { INCIDENT_STATUS_PIPELINE, primaryActionFor, secondaryActionFor } from "../api/incidents.ts";
import { TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface IncidentStatusStepperProps {
  status: string;
  onAction: (action: string) => void;
  busy?: boolean;
  error?: string | null;
}

// "Treating On Scene" is a real status but not one of the seven pipeline
// steps this stepper draws -- it's shown as a variant of the "On scene"
// step (still on scene, just further along), not an extra step of its own,
// so the visual pipeline stays a fixed seven steps regardless of which
// branch a crew actually takes.
function stepIndexFor(status: string): number {
  if (status === "Treating On Scene") return INCIDENT_STATUS_PIPELINE.indexOf("On Scene");
  const index = INCIDENT_STATUS_PIPELINE.indexOf(status as (typeof INCIDENT_STATUS_PIPELINE)[number]);
  return index === -1 ? INCIDENT_STATUS_PIPELINE.length - 1 : index;
}

export default function IncidentStatusStepper({ status, onAction, busy = false, error }: IncidentStatusStepperProps) {
  const currentIndex = stepIndexFor(status);
  const primary = primaryActionFor(status);
  const secondary = secondaryActionFor(status);

  return (
    <View testID="incident-status-stepper">
      <View style={styles.steps}>
        {INCIDENT_STATUS_PIPELINE.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <View key={step} style={styles.step}>
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                {done ? <Text style={styles.dotDoneText}>✓</Text> : null}
              </View>
              <Text style={[styles.stepLabel, (done || active) && styles.stepLabelActive]} numberOfLines={2}>
                {step === "Handover Complete" ? "Handover" : step}
              </Text>
            </View>
          );
        })}
      </View>

      {status === "Treating On Scene" ? <Text style={styles.substatus}>Treating on scene</Text> : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="status-stepper-error">
          {error}
        </Text>
      ) : null}

      {primary ? (
        <Pressable
          style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
          onPress={() => onAction(primary.action)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={primary.label}
          testID="status-primary-action"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{primary.label}</Text>}
        </Pressable>
      ) : (
        <Text style={styles.doneText} testID="status-stepper-done">
          Handover complete.
        </Text>
      )}

      {secondary ? (
        <Pressable
          onPress={() => onAction(secondary.action)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={secondary.label}
          style={styles.secondaryButton}
          testID="status-secondary-action"
        >
          <Text style={styles.secondaryButtonText}>{secondary.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  steps: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 4
  },
  step: {
    flex: 1,
    alignItems: "center",
    gap: 6
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#dbe4e2",
    alignItems: "center",
    justifyContent: "center"
  },
  dotDone: {
    backgroundColor: "#1f8a5b",
    borderColor: "#1f8a5b"
  },
  dotDoneText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700"
  },
  dotActive: {
    borderColor: "#1a4fd6"
  },
  stepLabel: {
    fontSize: 10,
    color: "#999",
    textAlign: "center"
  },
  stepLabelActive: {
    color: "#111",
    fontWeight: "600"
  },
  substatus: {
    fontSize: 12,
    color: "#1a4fd6",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8
  },
  error: {
    fontSize: 13,
    color: "#b00020",
    marginTop: 8,
    textAlign: "center"
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: "#1a4fd6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH_TARGET_MIN
  },
  primaryButtonDisabled: {
    backgroundColor: "#9aa8e0"
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700"
  },
  doneText: {
    marginTop: 14,
    textAlign: "center",
    color: "#1f8a5b",
    fontWeight: "600"
  },
  secondaryButton: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH_TARGET_MIN
  },
  secondaryButtonText: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600"
  }
});

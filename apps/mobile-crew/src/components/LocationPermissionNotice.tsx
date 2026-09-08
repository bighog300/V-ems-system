import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { LocationPermissionStatus } from "../location/captureLocation.ts";
import { TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface LocationPermissionNoticeProps {
  status: LocationPermissionStatus;
  onEnable: () => void;
  enabling?: boolean;
}

/**
 * The permission-rationale affordance Stage 11's design decision calls for:
 * explain why V-EMS wants location access, in our own words, before the OS
 * prompt ever appears — never a bare system dialog with no context. Showing
 * "granted" state confirms to the crew that a location will actually be
 * attached; nothing here is ever required to keep charting.
 */
export default function LocationPermissionNotice({ status, onEnable, enabling }: LocationPermissionNoticeProps) {
  if (status === "granted") {
    return (
      <Text style={styles.grantedText} testID="location-permission-granted">
        Location: on — the care location will be recorded automatically.
      </Text>
    );
  }

  return (
    <View style={styles.container} testID="location-permission-notice">
      <Text style={styles.rationale}>
        V-EMS can record the location where care was given, to support incident documentation. This is optional and never
        blocks charting — you can decline, and nothing here is required to continue.
      </Text>
      <Pressable
        style={styles.button}
        onPress={onEnable}
        disabled={enabling}
        accessibilityRole="button"
        accessibilityLabel="Enable location"
        testID="enable-location"
      >
        {enabling ? <ActivityIndicator color="#1a4fd6" /> : <Text style={styles.buttonText}>Enable location</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  rationale: {
    fontSize: 12,
    color: "#777",
    marginBottom: 8
  },
  button: {
    alignSelf: "flex-start",
    minHeight: TOUCH_TARGET_MIN,
    justifyContent: "center"
  },
  buttonText: {
    color: "#1a4fd6",
    fontSize: 13,
    fontWeight: "600"
  },
  grantedText: {
    fontSize: 12,
    color: "#1a7d3a",
    marginBottom: 16
  }
});

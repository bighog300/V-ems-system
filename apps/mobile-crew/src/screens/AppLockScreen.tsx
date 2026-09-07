import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { authenticateWithAppLock } from "../auth/appLock.ts";
import { CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface AppLockScreenProps {
  onUnlocked: () => void;
}

export default function AppLockScreen({ onUnlocked }: AppLockScreenProps) {
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attempt() {
    setAuthenticating(true);
    setError(null);
    try {
      const success = await authenticateWithAppLock();
      if (success) {
        onUnlocked();
      } else {
        setError("Authentication failed. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAuthenticating(false);
    }
  }

  useEffect(() => {
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container} testID="app-lock-screen">
      <Text style={styles.title} accessibilityRole="header">
        V-EMS Crew is locked
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="lock-error">
          {error}
        </Text>
      ) : null}
      <Pressable
        style={[styles.button, authenticating && styles.buttonDisabled]}
        onPress={attempt}
        disabled={authenticating}
        accessibilityRole="button"
        accessibilityLabel="Unlock"
        testID="unlock-button"
      >
        {authenticating ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Unlock</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    padding: 24,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center"
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16
  },
  error: {
    fontSize: 14,
    color: "#b00020",
    marginBottom: 16,
    textAlign: "center"
  },
  button: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN * 2
  },
  buttonDisabled: {
    backgroundColor: "#9aa8e0"
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600"
  }
});

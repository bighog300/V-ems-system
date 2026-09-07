import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";

import { verifySession } from "../api/verifySession.ts";
import { UnauthorizedError } from "../api/apiError.ts";
import { saveSession, type Session } from "../auth/session.ts";
import { CONTENT_MAX_WIDTH, TOUCH_TARGET_MIN } from "../theme/a11y.ts";

export interface LoginScreenProps {
  onSignedIn: (session: Session) => void;
}

export default function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [actorId, setActorId] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = apiBaseUrl.trim() && authToken.trim() && actorId.trim() && actorRole.trim() && !submitting;

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    try {
      await verifySession({ apiBaseUrl, authToken });
      const session: Session = {
        apiBaseUrl: apiBaseUrl.trim().replace(/\/$/, ""),
        authToken: authToken.trim(),
        actorId: actorId.trim(),
        actorRole: actorRole.trim()
      };
      await saveSession(session);
      onSignedIn(session);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setError("That token was rejected. Check the token and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Sign in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} testID="login-screen">
      <Text style={styles.title} accessibilityRole="header">
        V-EMS Crew
      </Text>
      <Text style={styles.subtitle}>Sign in with your issued session token.</Text>

      <TextInput
        style={styles.input}
        placeholder="API base URL"
        accessibilityLabel="API base URL"
        autoCapitalize="none"
        autoCorrect={false}
        value={apiBaseUrl}
        onChangeText={setApiBaseUrl}
        testID="input-api-base-url"
      />
      <TextInput
        style={styles.input}
        placeholder="Session token"
        accessibilityLabel="Session token"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={authToken}
        onChangeText={setAuthToken}
        testID="input-auth-token"
      />
      <TextInput
        style={styles.input}
        placeholder="Crew member ID"
        accessibilityLabel="Crew member ID"
        autoCapitalize="none"
        autoCorrect={false}
        value={actorId}
        onChangeText={setActorId}
        testID="input-actor-id"
      />
      <TextInput
        style={styles.input}
        placeholder="Role (e.g. field_crew)"
        accessibilityLabel="Role"
        autoCapitalize="none"
        autoCorrect={false}
        value={actorRole}
        onChangeText={setActorRole}
        testID="input-actor-role"
      />

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="login-error">
          {error}
        </Text>
      ) : null}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        disabled={!canSubmit}
        onPress={handleSignIn}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
        testID="submit-sign-in"
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center"
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    marginBottom: 24
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 16,
    minHeight: TOUCH_TARGET_MIN
  },
  error: {
    color: "#b00020",
    marginBottom: 12
  },
  button: {
    backgroundColor: "#1a4fd6",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    minHeight: TOUCH_TARGET_MIN
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

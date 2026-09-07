import { Pressable, StyleSheet, Text, View } from "react-native";

import { clearSession, type Session } from "../auth/session.ts";

export interface HomeScreenProps {
  session: Session;
  onSignedOut: () => void;
}

export default function HomeScreen({ session, onSignedOut }: HomeScreenProps) {
  async function handleSignOut() {
    await clearSession();
    onSignedOut();
  }

  return (
    <View style={styles.container} testID="home-screen">
      <Text style={styles.title}>Assigned jobs</Text>
      <Text style={styles.meta}>
        Signed in as {session.actorId} ({session.actorRole})
      </Text>
      <Text style={styles.placeholder}>
        The assigned-jobs list, incident context and patient-case workflow land in the next milestone of Stage 9.
      </Text>

      <Pressable style={styles.button} onPress={handleSignOut} testID="sign-out">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#fff"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8
  },
  meta: {
    fontSize: 14,
    color: "#555",
    marginBottom: 16
  },
  placeholder: {
    fontSize: 14,
    color: "#777",
    marginBottom: 24
  },
  button: {
    borderWidth: 1,
    borderColor: "#b00020",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: "#b00020",
    fontSize: 16,
    fontWeight: "600"
  }
});

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { loadSession, type Session } from "../auth/session.ts";
import HomeScreen from "../screens/HomeScreen.tsx";
import LoginScreen from "../screens/LoginScreen.tsx";

type RootStackParamList = {
  Login: undefined;
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type BootState = "loading" | "signed-out" | "signed-in";

export default function RootNavigator() {
  const [state, setState] = useState<BootState>("loading");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((restored) => {
      if (cancelled) return;
      if (restored) {
        setSession(restored);
        setState("signed-in");
      } else {
        setState("signed-out");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignedIn = useCallback((next: Session) => {
    setSession(next);
    setState("signed-in");
  }, []);

  const handleSignedOut = useCallback(() => {
    setSession(null);
    setState("signed-out");
  }, []);

  if (state === "loading") {
    return (
      <View style={styles.center} testID="bootstrap-loading">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {state === "signed-in" && session ? (
          <Stack.Screen name="Home">{() => <HomeScreen session={session} onSignedOut={handleSignedOut} />}</Stack.Screen>
        ) : (
          <Stack.Screen name="Login">{() => <LoginScreen onSignedIn={handleSignedIn} />}</Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  }
});

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, type AppStateStatus, StyleSheet, View } from "react-native";

import type { AssignedJob } from "../api/assignments.ts";
import type { PatientCase } from "../api/patientCases.ts";
import { loadSession, type Session } from "../auth/session.ts";
import AppLockScreen from "../screens/AppLockScreen.tsx";
import AssessmentScreen from "../screens/AssessmentScreen.tsx";
import DispositionScreen from "../screens/DispositionScreen.tsx";
import EpcrScreen from "../screens/EpcrScreen.tsx";
import IncidentDetailScreen from "../screens/IncidentDetailScreen.tsx";
import InterventionsScreen from "../screens/InterventionsScreen.tsx";
import JobsListScreen from "../screens/JobsListScreen.tsx";
import LoginScreen from "../screens/LoginScreen.tsx";
import PatientCaseDetailScreen from "../screens/PatientCaseDetailScreen.tsx";
import PatientIdentityScreen from "../screens/PatientIdentityScreen.tsx";
import VitalsScreen from "../screens/VitalsScreen.tsx";

type RootStackParamList = {
  Login: undefined;
  JobsList: undefined;
  IncidentDetail: { job: AssignedJob };
  PatientCaseDetail: { patientCase: PatientCase };
  PatientIdentity: { patientCase: PatientCase };
  Vitals: { patientCaseId: string };
  Interventions: { patientCaseId: string };
  Assessment: { patientCaseId: string };
  Disposition: { patientCaseId: string };
  Epcr: { patientCaseId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type BootState = "loading" | "signed-out" | "locked" | "signed-in";

export default function RootNavigator() {
  const [state, setState] = useState<BootState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    let cancelled = false;
    loadSession().then((restored) => {
      if (cancelled) return;
      if (restored) {
        setSession(restored);
        setState("locked");
      } else {
        setState("signed-out");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-lock whenever the app returns to the foreground from the background,
  // so a crew member's session isn't left exposed if the device changes hands.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      const cameToForeground = previous.match(/inactive|background/) && next === "active";
      if (cameToForeground) {
        setState((current) => (current === "signed-in" ? "locked" : current));
      }
    });
    return () => subscription.remove();
  }, []);

  const handleSignedIn = useCallback((next: Session) => {
    setSession(next);
    setState("signed-in");
  }, []);

  const handleSignedOut = useCallback(() => {
    setSession(null);
    setState("signed-out");
  }, []);

  const handleUnlocked = useCallback(() => {
    setState("signed-in");
  }, []);

  if (state === "loading") {
    return (
      <View style={styles.center} testID="bootstrap-loading">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state === "locked" && session) {
    return <AppLockScreen onUnlocked={handleUnlocked} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {state === "signed-in" && session ? (
          <>
            <Stack.Screen name="JobsList">
              {({ navigation }) => (
                <JobsListScreen
                  session={session}
                  onSignedOut={handleSignedOut}
                  onSelectJob={(job) => navigation.navigate("IncidentDetail", { job })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="IncidentDetail">
              {({ route, navigation }) => (
                <IncidentDetailScreen
                  job={route.params.job}
                  session={session}
                  onBack={() => navigation.goBack()}
                  onSelectPatientCase={(patientCase) => navigation.navigate("PatientCaseDetail", { patientCase })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="PatientCaseDetail">
              {({ route, navigation }) => (
                <PatientCaseDetailScreen
                  patientCase={route.params.patientCase}
                  session={session}
                  onBack={() => navigation.goBack()}
                  onOpenIdentity={(patientCase) => navigation.navigate("PatientIdentity", { patientCase })}
                  onOpenVitals={(patientCaseId) => navigation.navigate("Vitals", { patientCaseId })}
                  onOpenInterventions={(patientCaseId) => navigation.navigate("Interventions", { patientCaseId })}
                  onOpenAssessment={(patientCaseId) => navigation.navigate("Assessment", { patientCaseId })}
                  onOpenDisposition={(patientCaseId) => navigation.navigate("Disposition", { patientCaseId })}
                  onOpenEpcr={(patientCaseId) => navigation.navigate("Epcr", { patientCaseId })}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="PatientIdentity">
              {({ route, navigation }) => (
                <PatientIdentityScreen
                  patientCase={route.params.patientCase}
                  session={session}
                  onBack={() => navigation.goBack()}
                  onLinked={() => navigation.goBack()}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Vitals">
              {({ route, navigation }) => (
                <VitalsScreen patientCaseId={route.params.patientCaseId} session={session} onBack={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Interventions">
              {({ route, navigation }) => (
                <InterventionsScreen patientCaseId={route.params.patientCaseId} session={session} onBack={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Assessment">
              {({ route, navigation }) => (
                <AssessmentScreen patientCaseId={route.params.patientCaseId} session={session} onBack={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Disposition">
              {({ route, navigation }) => (
                <DispositionScreen patientCaseId={route.params.patientCaseId} session={session} onBack={() => navigation.goBack()} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Epcr">
              {({ route, navigation }) => (
                <EpcrScreen patientCaseId={route.params.patientCaseId} session={session} onBack={() => navigation.goBack()} />
              )}
            </Stack.Screen>
          </>
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

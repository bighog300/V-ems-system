import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { AssignedJob } from "../api/assignments.ts";
import type { PatientCase } from "../api/patientCases.ts";
import type { Session } from "../auth/session.ts";
import type { UseSyncTriggersResult } from "../offline/useSyncTriggers.ts";
import IncidentDetailScreen from "./IncidentDetailScreen.tsx";
import JobsListScreen from "./JobsListScreen.tsx";

export interface IncidentWorkspaceScreenProps {
  session: Session;
  onSignedOut: () => void;
  onOpenSyncStatus: () => void;
  sync?: UseSyncTriggersResult;
  onSelectPatientCase: (patientCase: PatientCase) => void;
}

/**
 * Stage 15 milestone 15a: the tablet master-detail shell, replacing the
 * phone's Jobs -> Incident push with a persistent assignment rail beside a
 * detail pane, shown only above TABLET_MIN_WIDTH (see RootNavigator, which
 * picks this screen vs. JobsListScreen's own push-navigation at the same
 * "JobsList" route based on useIsTabletLayout()).
 *
 * Deliberately composes the existing JobsListScreen and IncidentDetailScreen
 * unmodified rather than rewriting either as a shared sub-component: both
 * keep every existing behavior (and test coverage) exactly as they are on
 * phone, and this screen only changes how the two are arranged and how
 * selecting a job is wired -- local state instead of a stack push.
 */
export default function IncidentWorkspaceScreen({ session, onSignedOut, onOpenSyncStatus, sync, onSelectPatientCase }: IncidentWorkspaceScreenProps) {
  const [selectedJob, setSelectedJob] = useState<AssignedJob | null>(null);

  return (
    <View style={styles.row} testID="incident-workspace-screen">
      <View style={styles.rail}>
        <JobsListScreen session={session} onSignedOut={onSignedOut} onSelectJob={setSelectedJob} onOpenSyncStatus={onOpenSyncStatus} sync={sync} />
      </View>
      <View style={styles.detail}>
        {selectedJob ? (
          <IncidentDetailScreen job={selectedJob} session={session} onBack={() => setSelectedJob(null)} onSelectPatientCase={onSelectPatientCase} />
        ) : (
          <View style={styles.placeholder} testID="incident-workspace-placeholder">
            <Text style={styles.placeholderText}>Select an assignment to see its details.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#fff"
  },
  rail: {
    flex: 0,
    width: 360,
    borderRightWidth: 1,
    borderRightColor: "#e0e0e0"
  },
  detail: {
    flex: 1
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  placeholderText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center"
  }
});

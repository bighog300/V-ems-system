import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { AssignedJob } from "../api/assignments.ts";

export interface IncidentDetailScreenProps {
  job: AssignedJob;
  onBack: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function IncidentDetailScreen({ job, onBack }: IncidentDetailScreenProps) {
  const incident = job.incident;

  return (
    <ScrollView style={styles.container} testID="incident-detail-screen">
      <Pressable onPress={onBack} testID="back-to-jobs">
        <Text style={styles.back}>‹ Assigned jobs</Text>
      </Pressable>

      <Text style={styles.title}>{incident?.incident_id ?? "Unlinked incident"}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Incident</Text>
        <Row label="Status" value={incident?.status ?? "Unavailable"} />
        <Row label="Priority" value={incident?.priority ?? "Unavailable"} />
        <Row label="Location" value={incident?.location_summary ?? "Unavailable"} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Assignment</Text>
        <Row label="Assignment ID" value={job.assignment_id} />
        <Row label="Status" value={job.status} />
        <Row label="Vehicle" value={job.vehicle_id} />
        <Row label="Vehicle status" value={job.vehicle_status} />
        <Row label="Crew" value={job.crew_ids.join(", ")} />
        <Row label="Updated" value={job.updated_at} />
      </View>

      <Text style={styles.placeholder}>
        Patient-case creation and the demographics/assessment/vitals/handover workflow land in the next milestone.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24
  },
  back: {
    color: "#1a4fd6",
    fontSize: 15,
    marginBottom: 16
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
    marginBottom: 8,
    textTransform: "uppercase"
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4
  },
  rowLabel: {
    fontSize: 14,
    color: "#777"
  },
  rowValue: {
    fontSize: 14,
    color: "#111",
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12
  },
  placeholder: {
    fontSize: 13,
    color: "#999",
    marginTop: 8,
    marginBottom: 32
  }
});

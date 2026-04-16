import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function createDbPath() {
  const dir = mkdtempSync(join(tmpdir(), "vems-observation-orch-test-"));
  return join(dir, "platform.sqlite");
}

function createService(openemr) {
  return new OrchestrationService({ dbPath: createDbPath(), openemr });
}

function createIncident(orchestration, correlationId = "corr-1") {
  return orchestration.createIncident({
    call: { call_source: "phone", received_at: "2026-04-16T10:00:00Z" },
    incident: {
      category: "medical_emergency",
      priority: "critical",
      description: "Chest pain",
      address: "Main St",
      patient_count: 1
    }
  }, { correlationId });
}

test("observation orchestration creates observation and emits event metadata", async () => {
  const calls = [];
  const orchestration = createService({
    searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
    createPatient: async () => ({ patient_id: "OE-100" }),
    createEncounter: async () => ({ encounter_id: "ENC-100", status: "Open" }),
    createObservation: async (payload) => {
      calls.push(payload);
      return { observation_id: "OBS-100", encounter_id: payload.encounter_id, status: "recorded" };
    },
    createHandover: async () => ({ handover_id: "HND-100", encounter_id: "ENC-100", handover_time: "2026-04-16T10:30:00Z", disposition: "transport_to_facility", handover_status: "Handover Completed" })
  });

  const incident = createIncident(orchestration, "corr-obs-1");
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-100"
  }, { correlationId: "corr-obs-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-100",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-obs-3" });

  const created = await orchestration.createObservationForEncounter("ENC-100", {
    recorded_at: "2026-04-16T10:20:00Z",
    source: "manual",
    vital_signs: { heart_rate_bpm: 92 }
  }, { correlationId: "corr-obs-4" });

  assert.deepEqual(created, { observation_id: "OBS-100", encounter_id: "ENC-100", status: "recorded" });
  assert.deepEqual(calls, [{
    encounter_id: "ENC-100",
    incident_id: incident.incident_id,
    patient_id: "OE-100",
    recorded_at: "2026-04-16T10:20:00Z",
    source: "manual",
    vital_signs: { heart_rate_bpm: 92 }
  }]);

  const events = orchestration.listOutboxEvents();
  assert.equal(events.at(-1).event_type, "ObservationCreated");
  assert.equal(events.at(-1).payload.observation_id, "OBS-100");
});

test("observation orchestration rejects missing encounter", async () => {
  const orchestration = createService({
    searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
    createPatient: async () => ({ patient_id: "OE-100" }),
    createEncounter: async () => ({ encounter_id: "ENC-100", status: "Open" }),
    createObservation: async () => ({ observation_id: "OBS-100", encounter_id: "ENC-100", status: "recorded" }),
    createHandover: async () => ({ handover_id: "HND-100", encounter_id: "ENC-100", handover_time: "2026-04-16T10:30:00Z", disposition: "transport_to_facility", handover_status: "Handover Completed" })
  });

  await assert.rejects(
    () => orchestration.createObservationForEncounter("ENC-404", {
      recorded_at: "2026-04-16T10:20:00Z",
      vital_signs: { heart_rate_bpm: 92 }
    }, { correlationId: "corr-obs-5" }),
    /not found/
  );
});

test("intervention orchestration emits audit/event metadata", async () => {
  const calls = [];
  const orchestration = createService({
    searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
    createPatient: async () => ({ patient_id: "OE-900" }),
    createEncounter: async () => ({ encounter_id: "ENC-900", status: "Open" }),
    createObservation: async () => ({ observation_id: "OBS-900", encounter_id: "ENC-900", status: "recorded" }),
    createIntervention: async (payload) => {
      calls.push(payload);
      return { intervention_id: "INT-900", encounter_id: payload.encounter_id, status: "recorded" };
    },
    createHandover: async () => ({ handover_id: "HND-900", encounter_id: "ENC-900", handover_time: "2026-04-16T10:30:00Z", disposition: "transport_to_facility", handover_status: "Handover Completed" })
  });

  const incident = createIncident(orchestration, "corr-int-1");
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-900"
  }, { correlationId: "corr-int-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-900",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-int-3" });

  const created = await orchestration.createInterventionForEncounter("ENC-900", {
    performed_at: "2026-04-16T10:25:00Z",
    type: "medication",
    name: "Aspirin"
  }, { correlationId: "corr-int-4" });

  assert.deepEqual(created, { intervention_id: "INT-900", encounter_id: "ENC-900", status: "recorded" });
  assert.deepEqual(calls, [{
    encounter_id: "ENC-900",
    incident_id: incident.incident_id,
    patient_id: "OE-900",
    performed_at: "2026-04-16T10:25:00Z",
    type: "medication",
    name: "Aspirin"
  }]);

  const events = orchestration.listOutboxEvents();
  assert.equal(events.at(-1).event_type, "InterventionCreated");
  assert.equal(events.at(-1).payload.intervention_id, "INT-900");
});

test("intervention orchestration rejects missing encounter", async () => {
  const orchestration = createService({
    searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
    createPatient: async () => ({ patient_id: "OE-100" }),
    createEncounter: async () => ({ encounter_id: "ENC-100", status: "Open" }),
    createObservation: async () => ({ observation_id: "OBS-100", encounter_id: "ENC-100", status: "recorded" }),
    createIntervention: async () => ({ intervention_id: "INT-100", encounter_id: "ENC-100", status: "recorded" }),
    createHandover: async () => ({ handover_id: "HND-100", encounter_id: "ENC-100", handover_time: "2026-04-16T10:30:00Z", disposition: "transport_to_facility", handover_status: "Handover Completed" })
  });

  await assert.rejects(
    () => orchestration.createInterventionForEncounter("ENC-404", {
      performed_at: "2026-04-16T10:20:00Z",
      type: "procedure",
      name: "Splinting"
    }, { correlationId: "corr-int-5" }),
    /not found/
  );
});

test("handover orchestration emits audit/event metadata and marks closure readiness", async () => {
  const calls = [];
  const orchestration = createService({
    searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
    createPatient: async () => ({ patient_id: "OE-910" }),
    createEncounter: async () => ({ encounter_id: "ENC-910", status: "Ready for Handover" }),
    createObservation: async () => ({ observation_id: "OBS-910", encounter_id: "ENC-910", status: "recorded" }),
    createIntervention: async () => ({ intervention_id: "INT-910", encounter_id: "ENC-910", status: "recorded" }),
    createHandover: async (payload) => {
      calls.push(payload);
      return {
        handover_id: "HND-910",
        encounter_id: payload.encounter_id,
        handover_time: payload.handover_time,
        disposition: payload.disposition,
        handover_status: payload.handover_status,
        destination_facility: payload.destination_facility,
        receiving_clinician: payload.receiving_clinician,
        notes: payload.notes
      };
    }
  });

  const incident = createIncident(orchestration, "corr-hnd-1");
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-910"
  }, { correlationId: "corr-hnd-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-910",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-hnd-3" });

  const created = await orchestration.createHandoverForEncounter("ENC-910", {
    handover_time: "2026-04-16T10:45:00Z",
    destination_facility: "General Hospital",
    receiving_clinician: "Dr Lee",
    disposition: "transport_to_facility",
    handover_status: "Handover Completed",
    notes: "Transferred to ED"
  }, { correlationId: "corr-hnd-4" });

  assert.deepEqual(created, {
    handover_id: "HND-910",
    encounter_id: "ENC-910",
    handover_status: "Handover Completed",
    disposition: "transport_to_facility",
    closure_ready: true
  });
  assert.deepEqual(calls, [{
    encounter_id: "ENC-910",
    incident_id: incident.incident_id,
    patient_id: "OE-910",
    handover_time: "2026-04-16T10:45:00Z",
    destination_facility: "General Hospital",
    receiving_clinician: "Dr Lee",
    disposition: "transport_to_facility",
    handover_status: "Handover Completed",
    notes: "Transferred to ED"
  }]);

  const events = orchestration.listOutboxEvents();
  assert.equal(events.at(-1).event_type, "HandoverCompleted");
  assert.equal(events.at(-1).payload.closure_ready, true);

  const encounter = orchestration.getEncounterByIncident(incident.incident_id);
  assert.equal(encounter.encounter_status, "Handover Completed");
});

test("handover orchestration rejects missing encounter", async () => {
  const orchestration = createService({
    searchPatient: async () => ({ match_status: "no_match", match_confidence: 0, candidates: [] }),
    createPatient: async () => ({ patient_id: "OE-100" }),
    createEncounter: async () => ({ encounter_id: "ENC-100", status: "Open" }),
    createObservation: async () => ({ observation_id: "OBS-100", encounter_id: "ENC-100", status: "recorded" }),
    createIntervention: async () => ({ intervention_id: "INT-100", encounter_id: "ENC-100", status: "recorded" }),
    createHandover: async () => ({ handover_id: "HND-100", encounter_id: "ENC-100", handover_time: "2026-04-16T10:30:00Z", disposition: "transport_to_facility", handover_status: "Handover Completed" })
  });

  await assert.rejects(
    () => orchestration.createHandoverForEncounter("ENC-404", {
      handover_time: "2026-04-16T10:30:00Z",
      disposition: "transport_to_facility",
      handover_status: "Handover Completed"
    }, { correlationId: "corr-hnd-5" }),
    /not found/
  );
});

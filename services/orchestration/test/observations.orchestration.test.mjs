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

  const syncIntents = orchestration.listSyncIntents();
  assert.equal(syncIntents.length, 1);
  assert.equal(syncIntents.at(-1).intent_type, "createIncidentMirror");
});

test("intervention with stock_item_id emits stock usage sync intent", async () => {
  const orchestration = createService({
    createEncounter: async () => ({ encounter_id: "ENC-901", status: "Open" }),
    createIntervention: async (payload) => ({ intervention_id: "INT-901", encounter_id: payload.encounter_id, status: "recorded" })
  });

  const incident = createIncident(orchestration, "corr-stock-int-1");
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-901"
  }, { correlationId: "corr-stock-int-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-901",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-stock-int-3" });

  await orchestration.createInterventionForEncounter("ENC-901", {
    performed_at: "2026-04-16T10:25:00Z",
    type: "medication",
    name: "Aspirin",
    stock_item_id: "ITEM-001"
  }, { correlationId: "corr-stock-int-4" });

  const stockIntent = orchestration.listSyncIntents().find((intent) => intent.intent_type === "recordStockUsageMirror");
  assert.ok(stockIntent);
  assert.equal(stockIntent.entity_type, "stock_usage");
  assert.deepEqual(stockIntent.payload, {
    incident_id: incident.incident_id,
    encounter_id: "ENC-901",
    stock_item_id: "ITEM-001",
    performed_at: "2026-04-16T10:25:00Z",
    intervention_type: "medication",
    intervention_name: "Aspirin"
  });
});

test("intervention without stock_item_id does not emit stock usage sync intent", async () => {
  const orchestration = createService({
    createEncounter: async () => ({ encounter_id: "ENC-902", status: "Open" }),
    createIntervention: async (payload) => ({ intervention_id: "INT-902", encounter_id: payload.encounter_id, status: "recorded" })
  });

  const incident = createIncident(orchestration, "corr-stock-none-1");
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-902"
  }, { correlationId: "corr-stock-none-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-902",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-stock-none-3" });

  await orchestration.createInterventionForEncounter("ENC-902", {
    performed_at: "2026-04-16T10:25:00Z",
    type: "procedure",
    name: "Splinting"
  }, { correlationId: "corr-stock-none-4" });

  const stockIntents = orchestration.listSyncIntents().filter((intent) => intent.intent_type === "recordStockUsageMirror");
  assert.equal(stockIntents.length, 0);
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

test("intervention read uses OpenEMR source and returns normalized list", async () => {
  const calls = [];
  const orchestration = createService({
    createEncounter: async () => ({ encounter_id: "ENC-920", status: "Open" }),
    getInterventions: async (payload) => {
      calls.push(payload);
      return [{ intervention_id: "INT-920", encounter_id: payload.encounter_id, status: "recorded" }];
    }
  });

  const incident = createIncident(orchestration, "corr-int-read-1");
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-920"
  }, { correlationId: "corr-int-read-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-920",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-int-read-3" });

  const result = await orchestration.getInterventionsForEncounter("ENC-920");
  assert.deepEqual(result, [{ intervention_id: "INT-920", encounter_id: "ENC-920", status: "recorded" }]);
  assert.deepEqual(calls, [{
    encounter_id: "ENC-920",
    incident_id: incident.incident_id,
    patient_id: "OE-920"
  }]);
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

test("handover read returns normalized OpenEMR handover", async () => {
  const calls = [];
  const orchestration = createService({
    createEncounter: async () => ({ encounter_id: "ENC-930", status: "Ready for Handover" }),
    getHandover: async (payload) => {
      calls.push(payload);
      return {
        handover_id: "HND-930",
        encounter_id: payload.encounter_id,
        disposition: "transport_to_facility",
        handover_status: "Handover Completed",
        closure_ready: true
      };
    }
  });

  const incident = createIncident(orchestration, "corr-hnd-read-1");
  orchestration.linkPatientToIncidentContext(incident.incident_id, {
    verification_status: "verified",
    openemr_patient_id: "OE-930"
  }, { correlationId: "corr-hnd-read-2" });
  await orchestration.createEncounterForIncident(incident.incident_id, {
    patient_id: "OE-930",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  }, { correlationId: "corr-hnd-read-3" });

  const result = await orchestration.getHandoverForEncounter("ENC-930");
  assert.deepEqual(result, {
    handover_id: "HND-930",
    encounter_id: "ENC-930",
    handover_status: "Handover Completed",
    disposition: "transport_to_facility",
    closure_ready: true
  });
  assert.deepEqual(calls, [{
    encounter_id: "ENC-930",
    incident_id: incident.incident_id,
    patient_id: "OE-930"
  }]);
});

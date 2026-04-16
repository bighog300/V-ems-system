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
    }
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

  const created = await orchestration.createObservationForEncounter("ENC-100", { pulse_bpm: 92 }, { correlationId: "corr-obs-4" });

  assert.deepEqual(created, { observation_id: "OBS-100", encounter_id: "ENC-100", status: "recorded" });
  assert.deepEqual(calls, [{
    encounter_id: "ENC-100",
    incident_id: incident.incident_id,
    patient_id: "OE-100",
    payload: { pulse_bpm: 92 }
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
    createObservation: async () => ({ observation_id: "OBS-100", encounter_id: "ENC-100", status: "recorded" })
  });

  await assert.rejects(
    () => orchestration.createObservationForEncounter("ENC-404", { pulse_bpm: 92 }, { correlationId: "corr-obs-5" }),
    /not found/
  );
});

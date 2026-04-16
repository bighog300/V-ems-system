import test from "node:test";
import assert from "node:assert/strict";
import { OpenEmrAdapterClient } from "../src/adapters/openemr/openemr-adapter-client.mjs";

test("openemr adapter methods route mapped payloads through transport", async () => {
  const calls = [];
  const mapper = {
    mapPatientSearchRequest: (payload) => ({ ...payload, type: "patient-search" }),
    mapPatientCreateRequest: (payload) => ({ ...payload, type: "patient-create" }),
    mapPatientSearchResponse: (response) => ({ ...response, mapped: true }),
    mapPatientCreateResponse: (response) => ({ ...response, mapped: true }),
    mapEncounterCreateRequest: (payload) => ({ ...payload, type: "encounter-create" }),
    mapEncounterCreateResponse: (response) => ({ ...response, mapped: true }),
    mapObservationCreateRequest: (payload) => ({ ...payload, type: "observation-create" }),
    mapObservationCreateResponse: (response) => ({ ...response, mapped: true }),
    mapInterventionCreateRequest: (payload) => ({ ...payload, mapped_type: "intervention-create" }),
    mapInterventionCreateResponse: (response) => ({ ...response, mapped: true })
  };

  const client = new OpenEmrAdapterClient({
    mapper,
    transport: async (request) => {
      calls.push(request);
      if (request.method === "searchPatient") return { match_status: "no_match", match_confidence: 0, candidates: [] };
      if (request.method === "createPatient") return { patient_id: "OE-123", display_name: "Jane Doe" };
      if (request.method === "createEncounter") return { encounter_id: "ENC-001", status: "Open" };
      if (request.method === "createObservation") return { observation_id: "OBS-001", encounter_id: "ENC-001", status: "recorded" };
      return { intervention_id: "INT-001", encounter_id: "ENC-001", status: "recorded" };
    }
  });

  const search = await client.searchPatient({ first_name: "Jane" });
  const created = await client.createPatient({ first_name: "Jane", last_name: "Doe", dob: "1990-01-01" });
  const encounter = await client.createEncounter({ incident_id: "INC-000001", patient_id: "OE-123", care_started_at: "2026-04-16T10:15:00Z", crew_ids: ["STAFF-001"], presenting_complaint: "Chest pain" });
  const observation = await client.createObservation({ encounter_id: "ENC-001", payload: { spo2: 98 } });
  const intervention = await client.createIntervention({ encounter_id: "ENC-001", type: "medication", name: "Aspirin" });

  assert.deepEqual(calls, [
    { method: "searchPatient", payload: { first_name: "Jane", type: "patient-search" } },
    {
      method: "createPatient",
      payload: { first_name: "Jane", last_name: "Doe", dob: "1990-01-01", type: "patient-create" }
    },
    {
      method: "createEncounter",
      payload: { incident_id: "INC-000001", patient_id: "OE-123", care_started_at: "2026-04-16T10:15:00Z", crew_ids: ["STAFF-001"], presenting_complaint: "Chest pain", type: "encounter-create" }
    },
    {
      method: "createObservation",
      payload: { encounter_id: "ENC-001", payload: { spo2: 98 }, type: "observation-create" }
    },
    {
      method: "createIntervention",
      payload: { encounter_id: "ENC-001", type: "medication", name: "Aspirin", mapped_type: "intervention-create" }
    }
  ]);
  assert.equal(search.mapped, true);
  assert.equal(created.mapped, true);
  assert.equal(encounter.mapped, true);
  assert.equal(observation.mapped, true);
  assert.equal(intervention.mapped, true);
});

test("openemr adapter without transport fails explicitly", async () => {
  const client = new OpenEmrAdapterClient();
  await assert.rejects(() => client.searchPatient({ first_name: "Jane" }), /not configured/);
});

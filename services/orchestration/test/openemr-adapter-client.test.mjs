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
    mapEncounterCreateResponse: (response) => ({ ...response, mapped: true })
  };

  const client = new OpenEmrAdapterClient({
    mapper,
    transport: async (request) => {
      calls.push(request);
      if (request.method === "searchPatient") return { match_status: "no_match", match_confidence: 0, candidates: [] };
      if (request.method === "createPatient") return { patient_id: "OE-123", display_name: "Jane Doe" };
      return { encounter_id: "ENC-001", status: "Open" };
    }
  });

  const search = await client.searchPatient({ first_name: "Jane" });
  const created = await client.createPatient({ first_name: "Jane", last_name: "Doe", dob: "1990-01-01" });
  const encounter = await client.createEncounter({ incident_id: "INC-000001", patient_id: "OE-123", care_started_at: "2026-04-16T10:15:00Z", crew_ids: ["STAFF-001"], presenting_complaint: "Chest pain" });

  assert.deepEqual(calls, [
    { method: "searchPatient", payload: { first_name: "Jane", type: "patient-search" } },
    {
      method: "createPatient",
      payload: { first_name: "Jane", last_name: "Doe", dob: "1990-01-01", type: "patient-create" }
    },
    {
      method: "createEncounter",
      payload: { incident_id: "INC-000001", patient_id: "OE-123", care_started_at: "2026-04-16T10:15:00Z", crew_ids: ["STAFF-001"], presenting_complaint: "Chest pain", type: "encounter-create" }
    }
  ]);
  assert.equal(search.mapped, true);
  assert.equal(created.mapped, true);
});

test("openemr adapter without transport fails explicitly", async () => {
  const client = new OpenEmrAdapterClient();
  await assert.rejects(() => client.searchPatient({ first_name: "Jane" }), /not configured/);
});

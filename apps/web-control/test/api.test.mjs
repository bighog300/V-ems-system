import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  createEncounterHandover,
  createEncounterIntervention,
  createEncounterObservation,
  createIncidentEncounter,
  loadCrewJobListData,
  loadDispatcherBoardData,
  loadIncidentOperationalData
} from "../src/api.mjs";

test("loadDispatcherBoardData uses GET /api/incidents list endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          incidents: [
            {
              incident_id: "INC-000123",
              priority: "high",
              status: "Awaiting Dispatch",
              location_summary: "22 Dispatch Way",
              created_at: "2026-04-16T10:00:00Z"
            }
          ]
        };
      }
    };
  };

  const result = await loadDispatcherBoardData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl });

  assert.deepEqual(calls, ["http://127.0.0.1:8080/api/incidents"]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].incident_id, "INC-000123");
});

test("loadCrewJobListData uses GET /api/incidents list endpoint", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return { incidents: [] };
      }
    };
  };

  const result = await loadCrewJobListData({ apiBaseUrl: "http://127.0.0.1:8080", fetchImpl });

  assert.deepEqual(calls, ["http://127.0.0.1:8080/api/incidents"]);
  assert.deepEqual(result.items, []);
});

test("loadIncidentOperationalData remains on incident detail read-path endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith("/api/incidents/INC-000111")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { incident_id: "INC-000111", priority: "high", status: "Assigned", address: "Main St" };
        }
      };
    }

    return {
      ok: false,
      status: 404,
      async json() {
        return { error: { code: "NOT_FOUND", message: "Not found", retryable: false, correlation_id: "123" } };
      }
    };
  };

  const result = await loadIncidentOperationalData({
    apiBaseUrl: "http://127.0.0.1:8080",
    incidentId: "INC-000111",
    fetchImpl
  });

  assert.equal(result.incident.incident_id, "INC-000111");
  assert.deepEqual(calls, [
    "http://127.0.0.1:8080/api/incidents/INC-000111",
    "http://127.0.0.1:8080/api/incidents/INC-000111/assignments",
    "http://127.0.0.1:8080/api/incidents/INC-000111/patient-link",
    "http://127.0.0.1:8080/api/incidents/INC-000111/encounters"
  ]);
});

test("createIncidentEncounter submits to POST /api/incidents/{incidentId}/encounters", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      async json() {
        return { encounter_id: "ENC-123", status: "Open", linked_incident_id: "INC-000333" };
      }
    };
  };

  const payload = {
    patient_id: "OE-123",
    care_started_at: "2026-04-16T10:15:00Z",
    crew_ids: ["STAFF-001"],
    presenting_complaint: "Chest pain"
  };

  const result = await createIncidentEncounter({
    apiBaseUrl: "http://127.0.0.1:8080",
    incidentId: "INC-000333",
    payload,
    fetchImpl
  });

  assert.equal(result.encounter_id, "ENC-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/api/incidents/INC-000333/encounters");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test("createIncidentEncounter surfaces structured backend errors", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 409,
    async json() {
      return {
        error: {
          code: "CONFLICT",
          message: "Encounter already linked",
          retryable: false,
          correlation_id: "11111111-1111-1111-1111-111111111111"
        }
      };
    }
  });

  await assert.rejects(
    createIncidentEncounter({
      apiBaseUrl: "http://127.0.0.1:8080",
      incidentId: "INC-000333",
      payload: {
        patient_id: "OE-123",
        care_started_at: "2026-04-16T10:15:00Z",
        crew_ids: ["STAFF-001"],
        presenting_complaint: "Chest pain"
      },
      fetchImpl
    }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.status, 409);
      assert.equal(error.code, "CONFLICT");
      assert.equal(error.correlationId, "11111111-1111-1111-1111-111111111111");
      return true;
    }
  );
});


test("createEncounterObservation submits to POST /api/encounters/{encounterId}/observations", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      async json() {
        return { observation_id: "OBS-100", encounter_id: "ENC-123", status: "recorded" };
      }
    };
  };

  const payload = {
    recorded_at: "2026-04-16T10:15:00Z",
    vital_signs: { heart_rate_bpm: 88, gcs: 15 }
  };

  const result = await createEncounterObservation({
    apiBaseUrl: "http://127.0.0.1:8080",
    encounterId: "ENC-123",
    payload,
    fetchImpl
  });

  assert.equal(result.observation_id, "OBS-100");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/api/encounters/ENC-123/observations");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test("createEncounterObservation surfaces structured backend errors", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    async json() {
      return {
        error: {
          code: "INVALID_PAYLOAD",
          message: "recorded_at is required",
          retryable: false,
          correlation_id: "22222222-2222-2222-2222-222222222222"
        }
      };
    }
  });

  await assert.rejects(
    createEncounterObservation({
      apiBaseUrl: "http://127.0.0.1:8080",
      encounterId: "ENC-123",
      payload: { vital_signs: { heart_rate_bpm: 90 } },
      fetchImpl
    }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.status, 400);
      assert.equal(error.code, "INVALID_PAYLOAD");
      assert.equal(error.correlationId, "22222222-2222-2222-2222-222222222222");
      return true;
    }
  );
});

test("createEncounterIntervention submits to POST /api/encounters/{encounterId}/interventions", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      async json() {
        return { intervention_id: "INT-100", encounter_id: "ENC-123", status: "recorded" };
      }
    };
  };

  const payload = {
    performed_at: "2026-04-16T10:15:00Z",
    type: "medication",
    name: "Aspirin",
    route: "oral"
  };

  const result = await createEncounterIntervention({
    apiBaseUrl: "http://127.0.0.1:8080",
    encounterId: "ENC-123",
    payload,
    fetchImpl
  });

  assert.equal(result.intervention_id, "INT-100");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/api/encounters/ENC-123/interventions");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test("createEncounterIntervention surfaces structured backend errors", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    async json() {
      return {
        error: {
          code: "INVALID_PAYLOAD",
          message: "type is invalid",
          retryable: false,
          correlation_id: "33333333-3333-3333-3333-333333333333",
          details: { field: "type" }
        }
      };
    }
  });

  await assert.rejects(
    createEncounterIntervention({
      apiBaseUrl: "http://127.0.0.1:8080",
      encounterId: "ENC-123",
      payload: { name: "Aspirin" },
      fetchImpl
    }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.status, 400);
      assert.equal(error.code, "INVALID_PAYLOAD");
      assert.equal(error.correlationId, "33333333-3333-3333-3333-333333333333");
      assert.deepEqual(error.details, { field: "type" });
      return true;
    }
  );
});

test("createEncounterHandover submits to POST /api/encounters/{encounterId}/handover", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          handover_id: "HAN-100",
          encounter_id: "ENC-123",
          handover_status: "Handover Completed",
          disposition: "transport_to_facility",
          closure_ready: true
        };
      }
    };
  };

  const payload = {
    handover_time: "2026-04-16T11:05:00Z",
    destination_facility: "General Hospital",
    receiving_clinician: "Dr. Reed",
    disposition: "transport_to_facility",
    handover_status: "Handover Completed"
  };

  const result = await createEncounterHandover({
    apiBaseUrl: "http://127.0.0.1:8080",
    encounterId: "ENC-123",
    payload,
    fetchImpl
  });

  assert.equal(result.handover_id, "HAN-100");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:8080/api/encounters/ENC-123/handover");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), payload);
});

test("createEncounterHandover surfaces structured backend errors", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    async json() {
      return {
        error: {
          code: "INVALID_PAYLOAD",
          message: "handover_status is invalid",
          retryable: false,
          correlation_id: "44444444-4444-4444-4444-444444444444",
          details: { field: "handover_status" }
        }
      };
    }
  });

  await assert.rejects(
    createEncounterHandover({
      apiBaseUrl: "http://127.0.0.1:8080",
      encounterId: "ENC-123",
      payload: { disposition: "transport_to_facility" },
      fetchImpl
    }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.status, 400);
      assert.equal(error.code, "INVALID_PAYLOAD");
      assert.equal(error.correlationId, "44444444-4444-4444-4444-444444444444");
      assert.deepEqual(error.details, { field: "handover_status" });
      return true;
    }
  );
});

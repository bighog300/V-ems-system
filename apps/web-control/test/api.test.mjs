import test from "node:test";
import assert from "node:assert/strict";
import { loadCrewJobListData, loadDispatcherBoardData, loadIncidentOperationalData } from "../src/api.mjs";

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

import assert from "node:assert/strict";
import { test } from "node:test";

import { primaryActionFor, secondaryActionFor, updateIncidentStatus } from "../src/api/incidents.ts";

test("primaryActionFor returns the transport-advancing action for each status in the pipeline", () => {
  assert.deepEqual(primaryActionFor("Assigned"), { action: "acknowledge_assignment", label: "Acknowledge" });
  assert.deepEqual(primaryActionFor("Crew Acknowledged"), { action: "depart_to_scene", label: "Depart to scene" });
  assert.deepEqual(primaryActionFor("En Route"), { action: "arrive_scene", label: "Arrived on scene" });
  assert.deepEqual(primaryActionFor("On Scene"), { action: "begin_transport", label: "Begin transport" });
  assert.deepEqual(primaryActionFor("Treating On Scene"), { action: "begin_transport", label: "Begin transport" });
  assert.deepEqual(primaryActionFor("Transporting"), { action: "arrive_destination", label: "Arrived at destination" });
  assert.deepEqual(primaryActionFor("At Destination"), { action: "complete_handover", label: "Complete handover" });
});

test("primaryActionFor returns null once handover is complete -- nowhere further for the button to go", () => {
  assert.equal(primaryActionFor("Handover Complete"), null);
  assert.equal(primaryActionFor("Closed"), null);
});

test("secondaryActionFor only offers the branch action at the two steps where the state machine actually branches", () => {
  assert.deepEqual(secondaryActionFor("On Scene"), { action: "begin_treatment", label: "Begin treatment on scene" });
  assert.deepEqual(secondaryActionFor("Treating On Scene"), { action: "complete_non_transport_handover", label: "Complete without transport" });
  assert.equal(secondaryActionFor("Assigned"), null);
  assert.equal(secondaryActionFor("Transporting"), null);
});

test("updateIncidentStatus PATCHes the incident with the given action and returns the new status", async () => {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  const fetchImpl = async (url: string, options: RequestInit = {}) => {
    calls.push({ url, method: options.method, body: options.body as string });
    return new Response(JSON.stringify({ incident_id: "INC-000001", status: "Crew Acknowledged", updated_at: "2026-09-16T10:00:00.000Z" }), { status: 200 });
  };

  const result = await updateIncidentStatus({
    apiBaseUrl: "https://api.example.test",
    authToken: "token",
    incidentId: "INC-000001",
    action: "acknowledge_assignment",
    fetchImpl: fetchImpl as unknown as typeof fetch
  });

  assert.equal(result.status, "Crew Acknowledged");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.test/api/incidents/INC-000001");
  assert.equal(calls[0].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), { action: "acknowledge_assignment" });
});

test("updateIncidentStatus throws when the server returns no data", async () => {
  const fetchImpl = async () => new Response(JSON.stringify(null), { status: 200 });
  await assert.rejects(
    () =>
      updateIncidentStatus({
        apiBaseUrl: "https://api.example.test",
        authToken: "token",
        incidentId: "INC-000001",
        action: "acknowledge_assignment",
        fetchImpl: fetchImpl as unknown as typeof fetch
      }),
    /no data/
  );
});

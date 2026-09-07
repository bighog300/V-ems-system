import assert from "node:assert/strict";
import { test } from "node:test";

import { listMyAssignments } from "../src/api/assignments.ts";

test("listMyAssignments returns the assignments array from the response", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        assignments: [
          {
            assignment_id: "ASN-000001",
            status: "Assigned",
            vehicle_status: "Assigned",
            vehicle_id: "AMB-901",
            crew_ids: ["STAFF-001"],
            updated_at: "2026-09-07T10:00:00.000Z",
            incident: {
              incident_id: "INC-000001",
              priority: "critical",
              status: "Assigned",
              location_summary: "Main St",
              created_at: "2026-09-07T09:00:00.000Z"
            }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  const jobs = await listMyAssignments({ apiBaseUrl: "https://api.example.test", authToken: "token", fetchImpl: fetchImpl as typeof fetch });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].assignment_id, "ASN-000001");
  assert.equal(jobs[0].incident?.incident_id, "INC-000001");
});

test("listMyAssignments returns an empty array when there are no assignments", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ assignments: [] }), { status: 200 });

  const jobs = await listMyAssignments({ apiBaseUrl: "https://api.example.test", authToken: "token", fetchImpl: fetchImpl as typeof fetch });

  assert.deepEqual(jobs, []);
});

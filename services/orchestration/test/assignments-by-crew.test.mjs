import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function service() { return new OrchestrationService({ dbPath: join(mkdtempSync(join(tmpdir(), "vems-crew-assignments-test-")), "platform.sqlite") }); }
function incident(o, address = "test") {
  return o.createIncident(
    { call: { call_source: "phone", received_at: "2026-09-07T00:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "test", address, patient_count: 1 } },
    { correlationId: `incident-${address}` }
  );
}

test("getAssignmentsForCrewMember returns only assignments containing the actor", () => {
  const o = service();
  const incidentA = incident(o, "Main St");
  const incidentB = incident(o, "Other St");

  const assignmentA = o.createAssignment(incidentA.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-001", "STAFF-002"], reason: "Dispatch" }, { correlationId: "a" });
  o.updateAssignment(assignmentA.assignment_id, { action: "confirm_assignment" }, { correlationId: "confirm-a" });
  const assignmentB = o.createAssignment(incidentB.incident_id, { vehicle_id: "AMB-902", crew_ids: ["STAFF-003"], reason: "Dispatch" }, { correlationId: "b" });
  o.updateAssignment(assignmentB.assignment_id, { action: "confirm_assignment" }, { correlationId: "confirm-b" });

  const mine = o.getAssignmentsForCrewMember("STAFF-001");
  assert.equal(mine.length, 1);
  assert.equal(mine[0].assignment_id, assignmentA.assignment_id);
  assert.equal(mine[0].incident.incident_id, incidentA.incident_id);
  assert.equal(mine[0].incident.location_summary, "Main St");
});

test("getAssignmentsForCrewMember excludes inactive assignments", () => {
  const o = service();
  const incidentA = incident(o, "Main St");
  const assignment = o.createAssignment(incidentA.incident_id, { vehicle_id: "AMB-901", crew_ids: ["STAFF-005"], reason: "Dispatch" }, { correlationId: "a" });

  o.updateAssignment(assignment.assignment_id, { action: "confirm_assignment" }, { correlationId: "confirm" });
  o.updateAssignment(assignment.assignment_id, { action: "accept_assignment" }, { correlationId: "accept" });
  assert.equal(o.getAssignmentsForCrewMember("STAFF-005").length, 1);

  o.updateAssignment(assignment.assignment_id, { action: "stand_down_unit" }, { correlationId: "stand-down" });
  assert.equal(o.getAssignmentsForCrewMember("STAFF-005").length, 0);
});

test("getAssignmentsForCrewMember returns an empty list for an actor with no assignments", () => {
  const o = service();
  assert.deepEqual(o.getAssignmentsForCrewMember("STAFF-999"), []);
});

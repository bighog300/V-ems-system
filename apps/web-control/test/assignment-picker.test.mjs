import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAssignmentPayload,
  eligiblePersonnel,
  eligibleVehicles,
  renderAssignmentPickerHtml,
  terminalActionForReassignment
} from "../src/assignment-picker.mjs";

function formData(entries) {
  return {
    get: (name) => (Array.isArray(entries[name]) ? entries[name][0] ?? null : entries[name] ?? null),
    getAll: (name) => (Array.isArray(entries[name]) ? entries[name] : entries[name] ? [entries[name]] : [])
  };
}

test("eligibleVehicles keeps only Available and Serviceable units", () => {
  const vehicles = [
    { vehicle_id: "AMB-001", operational_status: "Available", service_status: "Serviceable" },
    { vehicle_id: "AMB-002", operational_status: "Assigned", service_status: "Serviceable" },
    { vehicle_id: "AMB-003", operational_status: "Available", service_status: "Out of Service" }
  ];
  assert.deepEqual(eligibleVehicles(vehicles).map((v) => v.vehicle_id), ["AMB-001"]);
});

test("eligiblePersonnel keeps only Available staff", () => {
  const personnel = [
    { staff_id: "STAFF-001", operational_status: "Available" },
    { staff_id: "STAFF-002", operational_status: "On Assignment" }
  ];
  assert.deepEqual(eligiblePersonnel(personnel).map((p) => p.staff_id), ["STAFF-001"]);
});

test("terminalActionForReassignment maps each active status to the transition that frees the unit", () => {
  assert.equal(terminalActionForReassignment("Assigned"), "cancel_assignment");
  assert.equal(terminalActionForReassignment("Accepted"), "stand_down_unit");
  assert.equal(terminalActionForReassignment("Mobilised"), "stand_down_unit");
  assert.equal(terminalActionForReassignment("Active"), "reassign_assignment");
  assert.throws(() => terminalActionForReassignment("Completed"), /cannot be reassigned/);
});

test("buildAssignmentPayload requires a vehicle, at least one crew member, and a reason", () => {
  const { payload, errors } = buildAssignmentPayload(formData({ vehicle_id: "", crew_ids: [], reason: "" }));
  assert.equal(payload, null);
  assert.match(errors.join(" "), /Select a vehicle/);
  assert.match(errors.join(" "), /crew member/);
  assert.match(errors.join(" "), /reason/);
});

test("buildAssignmentPayload normalizes and de-duplicates crew ids", () => {
  const { payload, errors } = buildAssignmentPayload(formData({
    vehicle_id: "AMB-001",
    crew_ids: ["STAFF-002", "STAFF-001", "STAFF-001"],
    reason: "Nearest available unit"
  }));
  assert.deepEqual(errors, []);
  assert.deepEqual(payload, { vehicle_id: "AMB-001", crew_ids: ["STAFF-001", "STAFF-002"], reason: "Nearest available unit" });
});

test("renderAssignmentPickerHtml labels the form Assign vs Reassign and escapes fleet/personnel labels", () => {
  const vehicles = [{ vehicle_id: "AMB-001", callsign: '<img src=x onerror=alert(1)>' }];
  const personnel = [{ staff_id: "STAFF-001", full_name: "Jordan <script>" }];

  const assignHtml = renderAssignmentPickerHtml({ vehicles, personnel, currentAssignment: null });
  assert.match(assignHtml, /Assign unit/);
  assert.doesNotMatch(assignHtml, /Reassign unit \(currently/);
  assert.doesNotMatch(assignHtml, /<img src=x/);
  assert.doesNotMatch(assignHtml, /<script>/);
  assert.match(assignHtml, /&lt;img/);

  const reassignHtml = renderAssignmentPickerHtml({
    vehicles,
    personnel,
    currentAssignment: { assignment_id: "ASN-000001", status: "Active", vehicle_id: "AMB-002" }
  });
  assert.match(reassignHtml, /Reassign unit \(currently ASN-000001/);
  assert.match(reassignHtml, /data-reassign="true"/);
  assert.match(reassignHtml, /data-current-assignment-id="ASN-000001"/);
  assert.match(reassignHtml, /data-current-assignment-status="Active"/);
});

test("renderAssignmentPickerHtml notes when no eligible vehicles or personnel remain", () => {
  const noVehicles = renderAssignmentPickerHtml({ vehicles: [], personnel: [{ staff_id: "STAFF-001" }] });
  assert.match(noVehicles, /No vehicles are currently Available and Serviceable/);

  const noPersonnel = renderAssignmentPickerHtml({ vehicles: [{ vehicle_id: "AMB-001" }], personnel: [] });
  assert.match(noPersonnel, /No personnel are currently Available/);
});

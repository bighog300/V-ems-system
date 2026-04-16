import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatcherBoardItems, renderDispatcherBoardHtml } from "../src/board.mjs";

test("buildDispatcherBoardItems maps minimum operational fields", () => {
  const items = buildDispatcherBoardItems([
    {
      incident_id: "INC-000111",
      priority: "critical",
      status: "Awaiting Dispatch",
      location_summary: "123 Main St",
      closure_ready: false,
      assignment_summary: {
        assignment_id: "ASN-000111",
        status: "Assigned",
        vehicle_id: "AMB-201"
      },
    }
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].incidentId, "INC-000111");
  assert.equal(items[0].priority, "critical");
  assert.equal(items[0].status, "Awaiting Dispatch");
  assert.equal(items[0].locationSummary, "123 Main St");
  assert.equal(items[0].assignmentSummary, "ASN-000111 • Assigned • AMB-201");
  assert.equal(items[0].closureReady, false);
  assert.equal(items[0].priorityClassName, "priority-critical");
});

test("renderDispatcherBoardHtml includes drill-down incident link", () => {
  const html = renderDispatcherBoardHtml([
    {
      incidentId: "INC-000222",
      priority: "high",
      status: "Assigned",
      locationSummary: "456 Center Rd",
      assignmentSummary: "No assignment summary",
      closureReady: undefined,
      priorityClassName: ""
    }
  ]);

  assert.match(html, /\?incidentId=INC-000222/);
  assert.match(html, /Priority:/);
  assert.match(html, /Closure Ready/);
});

test("renderDispatcherBoardHtml shows explicit empty-state messaging", () => {
  const html = renderDispatcherBoardHtml([]);
  assert.match(html, /No incidents currently available for dispatch\./);
});

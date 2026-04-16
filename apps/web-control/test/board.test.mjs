import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatcherBoardItems, renderDispatcherBoardHtml } from "../src/board.mjs";

test("buildDispatcherBoardItems maps minimum operational fields", () => {
  const items = buildDispatcherBoardItems([
    {
      incident: {
        incident_id: "INC-000111",
        priority: "critical",
        status: "Awaiting Dispatch",
        address: "123 Main St",
        closure_ready: false
      },
      assignmentSummary: {
        incident_id: "INC-000111",
        assignments: [{ assignment_id: "ASN-000111", status: "Assigned", vehicle_id: "AMB-201" }]
      }
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

test("renderDispatcherBoardHtml includes drill-down incident link and board gap note", () => {
  const html = renderDispatcherBoardHtml(
    [
      {
        incidentId: "INC-000222",
        priority: "high",
        status: "Assigned",
        locationSummary: "456 Center Rd",
        assignmentSummary: "No assignment summary",
        closureReady: undefined,
        priorityClassName: ""
      }
    ],
    { discoveryGap: "Manual list loading currently required." }
  );

  assert.match(html, /\?incidentId=INC-000222/);
  assert.match(html, /Priority:/);
  assert.match(html, /Closure Ready/);
  assert.match(html, /Manual list loading currently required\./);
});

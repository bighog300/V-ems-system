import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatcherBoardItems, filterAndSortDispatcherItems, renderDispatcherBoardHtml } from "../src/board.mjs";

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

test("renderDispatcherBoardHtml renders grouped board and side panel", () => {
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
  assert.match(html, /Pending Assignment/);
  assert.match(html, /Incident Details \/ Actions/);
  assert.match(html, /Review Summary/);
});

test("filterAndSortDispatcherItems supports active, status, priority filters", () => {
  const filtered = filterAndSortDispatcherItems([
    { incidentId: "INC-001", status: "Closed", priority: "high", updatedAt: "2026-04-16T12:00:00Z" },
    { incidentId: "INC-002", status: "Awaiting Dispatch", priority: "critical", updatedAt: "2026-04-16T10:00:00Z" },
    { incidentId: "INC-003", status: "Awaiting Dispatch", priority: "high", updatedAt: "2026-04-16T09:00:00Z" }
  ], {
    activeOnly: true,
    status: "Awaiting Dispatch",
    priority: "critical",
    sort: "priority"
  });

  assert.deepEqual(filtered.map((item) => item.incidentId), ["INC-002"]);
});

test("filterAndSortDispatcherItems supports recency sorting", () => {
  const sorted = filterAndSortDispatcherItems([
    { incidentId: "INC-100", status: "Assigned", priority: "high", updatedAt: "2026-04-16T10:00:00Z" },
    { incidentId: "INC-101", status: "Assigned", priority: "high", updatedAt: "2026-04-16T12:00:00Z" }
  ], {
    sort: "recency"
  });

  assert.deepEqual(sorted.map((item) => item.incidentId), ["INC-101", "INC-100"]);
});

test("renderDispatcherBoardHtml shows explicit empty-state messaging", () => {
  const html = renderDispatcherBoardHtml([]);
  assert.match(html, /No incidents currently available for dispatch\./);
  assert.match(html, /VEMS Dispatcher Board/);
});

test("renderDispatcherBoardHtml escapes incident data to prevent XSS", () => {
  const html = renderDispatcherBoardHtml([
    {
      incidentId: "INC-<script>alert(1)</script>",
      priority: "<img src=x onerror=alert(1)>",
      status: "<svg/onload=alert(1)>",
      locationSummary: "<b>unsafe</b>",
      assignmentSummary: "<iframe src=javascript:alert(1)>",
      closureReady: "<script>bad()</script>",
      priorityClassName: "priority-high"
    }
  ]);

  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;svg\/onload=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;unsafe&lt;\/b&gt;/);
});

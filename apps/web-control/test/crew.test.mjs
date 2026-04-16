import test from "node:test";
import assert from "node:assert/strict";
import { buildCrewJobListItems, renderCrewIncidentDetailHtml, renderCrewJobListHtml } from "../src/crew.mjs";

test("buildCrewJobListItems maps crew list operational fields", () => {
  const items = buildCrewJobListItems([
    {
      incident_id: "INC-000888",
      priority: "high",
      status: "Assigned",
      location_summary: "12 River Lane",
      assignment_summary: {
        assignment_id: "ASN-000777",
        status: "Active",
        vehicle_id: "AMB-302"
      },
      closure_ready: true
    }
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].incidentId, "INC-000888");
  assert.equal(items[0].assignmentSummary, "ASN-000777 • Active • AMB-302");
  assert.equal(items[0].closureReady, true);
});

test("renderCrewJobListHtml includes drill-in link to crew incident detail", () => {
  const html = renderCrewJobListHtml([
    {
      incidentId: "INC-000888",
      priority: "high",
      status: "Assigned",
      locationSummary: "12 River Lane",
      assignmentSummary: "ASN-000777 • Active • AMB-302",
      closureReady: undefined
    }
  ]);

  assert.match(html, /\?view=crew&incidentId=INC-000888/);
  assert.match(html, /Assignment:/);
  assert.doesNotMatch(html, /Closure Ready:/);
});

test("renderCrewIncidentDetailHtml exposes summary blocks and placeholder write actions", () => {
  const html = renderCrewIncidentDetailHtml({
    incidentId: "INC-000123",
    priority: "critical",
    status: "On Scene",
    locationSummary: "7 Field Street",
    closureReady: false,
    assignmentSummary: { summary: "ASN-001 • Active • AMB-100" },
    patientLinkSummary: { summary: "Linked patient PAT-1" },
    encounterSummary: { available: false, detail: "No encounter linkage found for this incident." },
    handoverSummary: { available: false, detail: "Handover is unavailable until encounter linkage exists." }
  });

  assert.match(html, /Crew Incident Detail/);
  assert.match(html, /Patient Link Summary/);
  assert.match(html, /Write UI Pending/);
  assert.match(html, /POST \/api\/encounters\/\{encounterId\}\/observations/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { buildIncidentOperationalSummary, renderIncidentClosePanelHtml, renderOperationalSummaryHtml } from "../src/summary.mjs";

test("buildIncidentOperationalSummary includes closure readiness and encounter/handover data", () => {
  const summary = buildIncidentOperationalSummary({
    incident: {
      incident_id: "INC-000111",
      priority: "critical",
      status: "Handover Complete",
      address: "Main St",
      closure_ready: true
    },
    assignmentSummary: {
      incident_id: "INC-000111",
      assignments: [
        {
          assignment_id: "ASN-000321",
          status: "Active",
          vehicle_id: "AMB-400"
        }
      ]
    },
    patientLink: {
      incident_id: "INC-000111",
      verification_status: "verified",
      openemr_patient_id: "OE-100"
    },
    encounterLink: {
      encounter_id: "ENC-11",
      openemr_encounter_id: "ENC-11",
      openemr_patient_id: "OE-100",
      encounter_status: "Handover Completed",
      care_started_at: "2026-04-16T10:20:00Z"
    },
    handover: {
      handover_status: "Handover Completed",
      disposition: "transport_to_facility",
      closure_ready: true
    },
    interventions: [
      { intervention_id: "INT-1", status: "recorded", stock_item_id: "ITEM-1", stock_sync_status: "pending" },
      { intervention_id: "INT-2", status: "recorded" }
    ]
  });

  assert.equal(summary.incidentId, "INC-000111");
  assert.equal(summary.closureReady, true);
  assert.equal(summary.assignmentSummary.available, true);
  assert.equal(summary.patientLinkSummary.available, true);
  assert.equal(summary.encounterSummary.available, true);
  assert.equal(summary.handoverSummary.available, true);
  assert.equal(summary.stockUsageSummary.available, true);
  assert.equal(summary.stockUsageSummary.stockLinkedInterventions, 1);
});

test("renderOperationalSummaryHtml renders required operational labels", () => {
  const html = renderOperationalSummaryHtml({
    incidentId: "INC-000222",
    priority: "high",
    status: "Assigned",
    locationSummary: "123 Center Road",
    closureReady: undefined,
    assignmentSummary: { summary: "Assignment summary unavailable" },
    patientLinkSummary: { summary: "Patient link unavailable" },
    encounterSummary: { available: false, detail: "No encounter" },
    handoverSummary: { available: false, detail: "No handover" }
  });

  assert.match(html, /Incident ID/);
  assert.match(html, /Priority/);
  assert.match(html, /Closure Ready/);
  assert.match(html, /Closure State/);
  assert.match(html, /Patient Link Summary/);
  assert.match(html, /Stock Usage/);
});

test("renderIncidentClosePanelHtml shows close action for active incidents", () => {
  const html = renderIncidentClosePanelHtml({
    summary: {
      status: "Handover Complete",
      closureReady: true
    }
  });

  assert.match(html, /id="closeIncidentAction"/);
  assert.match(html, /Ready to close/);
});

test("renderIncidentClosePanelHtml hides close action when incident is already closed", () => {
  const html = renderIncidentClosePanelHtml({
    summary: {
      status: "Closed",
      closureReady: true
    }
  });

  assert.doesNotMatch(html, /id="closeIncidentAction"/);
  assert.match(html, /already closed/i);
});

test("renderIncidentClosePanelHtml renders backend rejection reason when provided", () => {
  const html = renderIncidentClosePanelHtml({
    summary: {
      status: "Handover Complete",
      closureReady: false
    },
    closeErrorMessage: "INVALID_STATUS_TRANSITION | details=required:closure_ready=true"
  });

  assert.match(html, /Not ready to close/);
  assert.match(html, /INVALID_STATUS_TRANSITION/);
});

test("renderOperationalSummaryHtml escapes untrusted summary fields", () => {
  const html = renderOperationalSummaryHtml({
    incidentId: "INC-<script>alert(1)</script>",
    priority: "<img src=x onerror=alert(1)>",
    status: "<svg/onload=alert(1)>",
    locationSummary: "<b>123 Unsafe</b>",
    closureReady: false,
    assignmentSummary: { summary: "<iframe src=javascript:alert(1)>" },
    patientLinkSummary: { summary: "<script>alert(2)</script>" },
    encounterSummary: { available: false, detail: "<script>alert(3)</script>" },
    handoverSummary: { available: false, detail: "<script>alert(4)</script>" },
    stockUsageSummary: { available: false, totalInterventions: 0 }
  });

  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;svg\/onload=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;123 Unsafe&lt;\/b&gt;/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCreateEncounterPayload,
  buildCreateObservationPayload,
  buildCrewJobListItems,
  renderCrewIncidentDetailHtml,
  renderCrewJobListHtml
} from "../src/crew.mjs";

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

test("renderCrewIncidentDetailHtml renders create encounter form when patient is linked and no encounter exists", () => {
  const html = renderCrewIncidentDetailHtml({
    incidentId: "INC-000123",
    priority: "critical",
    status: "On Scene",
    locationSummary: "7 Field Street",
    closureReady: false,
    assignmentSummary: { summary: "ASN-001 • Active • AMB-100" },
    patientLinkSummary: { summary: "Linked patient OE-1", openemrPatientId: "OE-1" },
    encounterSummary: { available: false, detail: "No encounter linkage found for this incident." },
    handoverSummary: { available: false, detail: "Handover is unavailable until encounter linkage exists." }
  });

  assert.match(html, /Create Encounter/);
  assert.match(html, /id="createEncounterForm"/);
  assert.match(html, /name="patient_id"/);
  assert.match(html, /name="care_started_at"/);
  assert.match(html, /name="crew_ids"/);
  assert.match(html, /name="presenting_complaint"/);
});

test("renderCrewIncidentDetailHtml blocks create encounter when patient link is missing", () => {
  const html = renderCrewIncidentDetailHtml({
    incidentId: "INC-000124",
    priority: "high",
    status: "On Scene",
    locationSummary: "8 Field Street",
    closureReady: false,
    assignmentSummary: { summary: "ASN-002 • Active • AMB-101" },
    patientLinkSummary: { summary: "Patient link unavailable", openemrPatientId: null },
    encounterSummary: { available: false, detail: "No encounter linkage found for this incident." },
    handoverSummary: { available: false, detail: "Handover is unavailable until encounter linkage exists." }
  });

  assert.match(html, /Cannot create encounter yet/);
  assert.doesNotMatch(html, /id="createEncounterForm"/);
});

test("renderCrewIncidentDetailHtml renders observation form when encounter exists", () => {
  const html = renderCrewIncidentDetailHtml({
    incidentId: "INC-000125",
    priority: "high",
    status: "Treating On Scene",
    locationSummary: "9 Field Street",
    closureReady: false,
    assignmentSummary: { summary: "ASN-003 • Active • AMB-102" },
    patientLinkSummary: { summary: "Linked patient OE-2", openemrPatientId: "OE-2" },
    encounterSummary: { available: true, encounter_id: "ENC-10", encounter_status: "Open" },
    handoverSummary: { available: false, detail: "No handover payload available from GET /api/encounters/{encounterId}/handover." }
  });

  assert.match(html, /Record Observation/);
  assert.match(html, /id="recordObservationForm"/);
  assert.match(html, /name="recorded_at"/);
  assert.match(html, /name="mental_status"/);
});

test("renderCrewIncidentDetailHtml shows blocked observation state when encounter is missing", () => {
  const html = renderCrewIncidentDetailHtml({
    incidentId: "INC-000126",
    priority: "medium",
    status: "On Scene",
    locationSummary: "10 Field Street",
    closureReady: false,
    assignmentSummary: { summary: "ASN-004 • Active • AMB-103" },
    patientLinkSummary: { summary: "Linked patient OE-3", openemrPatientId: "OE-3" },
    encounterSummary: { available: false, detail: "No encounter linkage found for this incident." },
    handoverSummary: { available: false, detail: "Handover is unavailable until encounter linkage exists." }
  });

  assert.match(html, /Observation entry is unavailable because no encounter is linked yet/);
  assert.doesNotMatch(html, /id="recordObservationForm"/);
});

test("buildCreateEncounterPayload validates and normalizes required fields", () => {
  const formData = new Map([
    ["patient_id", "OE-100"],
    ["care_started_at", "2026-04-16T10:15"],
    ["crew_ids", "STAFF-001, STAFF-002"],
    ["presenting_complaint", "Chest pain"]
  ]);

  const result = buildCreateEncounterPayload({ get: (key) => formData.get(key) });

  assert.deepEqual(result.validationErrors, []);
  assert.deepEqual(result.payload, {
    patient_id: "OE-100",
    care_started_at: "2026-04-16T10:15:00.000Z",
    crew_ids: ["STAFF-001", "STAFF-002"],
    presenting_complaint: "Chest pain"
  });
});

test("buildCreateObservationPayload normalizes payload to canonical observation contract", () => {
  const formData = new Map([
    ["recorded_at", "2026-04-16T10:15"],
    ["systolic_bp_mmhg", "120"],
    ["diastolic_bp_mmhg", "80"],
    ["heart_rate_bpm", "88"],
    ["respiratory_rate_bpm", "18"],
    ["spo2_pct", "97.5"],
    ["temperature_c", "37.2"],
    ["pain_score", "4"],
    ["mental_status", "alert"],
    ["source", "monitor"],
    ["notes", "Patient is stable."]
  ]);

  const result = buildCreateObservationPayload(
    { get: (key) => formData.get(key) },
    { nowMs: Date.parse("2026-04-16T10:30:00.000Z") }
  );

  assert.deepEqual(result.validationErrors, []);
  assert.deepEqual(result.payload, {
    recorded_at: "2026-04-16T10:15:00.000Z",
    source: "monitor",
    notes: "Patient is stable.",
    vital_signs: {
      systolic_bp_mmhg: 120,
      diastolic_bp_mmhg: 80,
      heart_rate_bpm: 88,
      respiratory_rate_bpm: 18,
      spo2_pct: 97.5,
      temperature_c: 37.2,
      pain_score: 4,
      gcs: 15
    }
  });
});

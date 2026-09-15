import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function service() {
  return new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-operational-reports-")), "platform.sqlite"),
    openemr: {
      createPatient: async () => ({ patient_id: "patient" }),
      createEncounter: async (p) => ({ encounter_id: "encounter", status: "Open" }),
      createObservation: async (p) => ({ observation_id: "obs", encounter_id: p.encounter_id, status: "created" }),
      createIntervention: async (p) => ({ intervention_id: `intervention-${Date.now()}-${Math.random()}`, status: "created" }),
      createHandover: async (p) => ({ ...p, handover_id: "handover" })
    }
  });
}
const meta = { correlationId: "reports-test", actorId: "STAFF-001", actorRole: "supervisor" };

async function createIncident(s, overrides = {}) {
  return s.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Reports exercise", address: "1 Main St", patient_count: 1, ...overrides }
  }, meta);
}

test("getIncidentVolumeReport rolls up status/category/priority and dispatch time within a date range", async () => {
  const s = service();
  const early = await createIncident(s, { category: "medical_emergency", priority: "high" });
  const mid = await createIncident(s, { category: "trauma", priority: "critical" });
  const late = await createIncident(s, { category: "medical_emergency", priority: "low" });

  await s.db.execute(`UPDATE incidents SET created_at='2026-01-01T00:00:00Z' WHERE incident_id='${early.incident_id}';`);
  await s.db.execute(`UPDATE incidents SET created_at='2026-06-01T00:00:00Z' WHERE incident_id='${mid.incident_id}';`);
  await s.db.execute(`UPDATE incidents SET created_at='2026-12-01T00:00:00Z' WHERE incident_id='${late.incident_id}';`);

  await s.createPersonnel({ staff_id: "STAFF-100", display_name: "Crew", role: "Paramedic", operational_status: "Available", home_station: "Test" }, meta);
  await s.createVehicle({ vehicle_id: "AMB-100", callsign: "Crew 100", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Test" }, meta);
  const assignment = await s.createAssignment(mid.incident_id, { vehicle_id: "AMB-100", crew_ids: ["STAFF-100"], reason: "dispatch" }, meta);
  await s.db.execute(`UPDATE assignments SET created_at='2026-06-01T00:05:00Z' WHERE assignment_id='${assignment.assignment_id}';`);

  const full = await s.getIncidentVolumeReport({});
  assert.equal(full.total_incidents, 3);
  assert.equal(full.by_category.medical_emergency, 2);
  assert.equal(full.by_category.trauma, 1);
  assert.equal(full.by_priority.critical, 1);
  assert.equal(full.by_status.New, 3);
  assert.equal(full.dispatch_time_ms.sample_count, 1);
  assert.equal(full.dispatch_time_ms.unassigned_count, 2);
  assert.equal(full.dispatch_time_ms.min, 5 * 60 * 1000);
  assert.equal(full.dispatch_time_ms.avg, 5 * 60 * 1000);

  const scoped = await s.getIncidentVolumeReport({ from: "2026-03-01T00:00:00Z", to: "2026-09-01T00:00:00Z" });
  assert.equal(scoped.total_incidents, 1);
  assert.equal(scoped.by_category.trauma, 1);
  assert.deepEqual(scoped.range, { from: "2026-03-01T00:00:00Z", to: "2026-09-01T00:00:00Z" });
});

test("getStockUsageReport aggregates usage by stock item and surfaces discrepancies", async () => {
  const s = service();
  const incident = await createIncident(s);
  await s.createPersonnel({ staff_id: "STAFF-200", display_name: "Crew", role: "Paramedic", operational_status: "Available", home_station: "Test" }, meta);
  await s.createVehicle({ vehicle_id: "AMB-200", callsign: "Crew 200", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Test" }, meta);
  const assignment = await s.createAssignment(incident.incident_id, { vehicle_id: "AMB-200", crew_ids: ["STAFF-200"], reason: "dispatch" }, meta);
  await s.updateAssignment(assignment.assignment_id, { action: "confirm_assignment" }, meta);
  const patientCase = await s.createPatientCase(incident.incident_id, { assignment_id: assignment.assignment_id }, meta);
  await s.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "patient" }, meta);
  await s.createEncounterForPatientCase(patientCase.patient_case_id, { care_started_at: "2026-09-06T10:05:00Z", presenting_complaint: "Exercise" }, meta);
  await s.createStockItem({ stock_item_id: "ITEM-200", name: "Test saline", category: "Fluid", unit_of_measure: "each", item_type: "Consumable" }, meta);
  await s.adjustVehicleStock("AMB-200", "ITEM-200", { type: "restock", quantity_delta: "2", reason: "Test" }, meta);

  await s.createPatientCaseMedication(patientCase.patient_case_id, {
    medication_name: "Saline", dose: "500", dose_unit: "ml", route: "IV",
    performed_at: "2026-09-06T10:10:00Z", stock_item_id: "ITEM-200", quantity_used: "1"
  }, meta);
  // Second administration exceeds the 1 unit remaining on the vehicle, producing a discrepancy.
  await s.createPatientCaseMedication(patientCase.patient_case_id, {
    medication_name: "Saline", dose: "500", dose_unit: "ml", route: "IV",
    performed_at: "2026-09-06T10:20:00Z", stock_item_id: "ITEM-200", quantity_used: "5"
  }, meta);

  const report = await s.getStockUsageReport({});
  assert.equal(report.total_usage_events, 2);
  assert.equal(report.total_discrepancies, 1);
  assert.equal(report.discrepancy_status_counts.INSUFFICIENT_STOCK, 1);
  assert.equal(report.by_stock_item.length, 1);
  assert.equal(report.by_stock_item[0].stock_item_id, "ITEM-200");
  assert.equal(report.by_stock_item[0].stock_item_name, "Test saline");
  assert.equal(report.by_stock_item[0].usage_count, 2);
  assert.equal(report.by_stock_item[0].discrepancy_count, 1);
});

test("getQaFlagReport aggregates automatically-raised flags and reflects resolution", async () => {
  const s = service();
  const incident = await createIncident(s);
  const patientCase = await s.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  await s.savePatientCaseDemographics(patientCase.patient_case_id, { first_name: "Unknown", unidentified: true, dob_unknown: true }, meta);
  await s.createPatientCaseAssessment(patientCase.patient_case_id, { section_type: "refusal_capacity", payload: { capacity: "documented" } }, meta);
  await s.setPatientCaseDisposition(patientCase.patient_case_id, { outcome: "refusal_transport", reason: "Patient declined" }, meta);
  const completed = await s.completeEpcr(patientCase.patient_case_id, meta);

  const flags = await s.listEpcrQaFlags(patientCase.patient_case_id);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].flag_type, "refusal");

  const before = await s.getQaFlagReport({});
  assert.equal(before.total_flags, 1);
  assert.equal(before.unresolved_count, 1);
  assert.equal(before.resolved_count, 0);
  assert.equal(before.by_flag_type.refusal, 1);
  assert.equal(before.by_severity.warning, 1);
  assert.equal(before.unresolved_flags.length, 1);
  assert.equal(before.unresolved_flags[0].patient_case_id, patientCase.patient_case_id);

  await s.updateEpcrQaFlag(patientCase.patient_case_id, flags[0].flag_id, { resolution_note: "Reviewed and accepted" }, meta);
  const after = await s.getQaFlagReport({});
  assert.equal(after.resolved_count, 1);
  assert.equal(after.unresolved_count, 0);
  assert.equal(after.unresolved_flags.length, 0);

  // completed.version proves the flag was raised against the version completeEpcr produced.
  assert.equal(flags[0].version_id, completed.version.version_id);
});

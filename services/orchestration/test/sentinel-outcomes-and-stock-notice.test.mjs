import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

const meta = { correlationId: "d12-test", actorId: "STAFF-200", actorRole: "field_crew" };

async function setup() {
  const s = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-d12-")), "platform.sqlite"),
    openemr: { createPatient: async () => ({ patient_id: "OE-1" }), createEncounter: async () => ({ encounter_id: "ENC-1", status: "Open" }), createObservation: async () => ({ observation_id: "OBS-1" }), createIntervention: async () => ({ intervention_id: "INT-1" }) }
  });
  const incident = await s.createIncident({ call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" }, incident: { category: "medical_emergency", priority: "critical", description: "Synthetic", address: "Test scene", patient_count: 1 } }, meta);
  await s.createPersonnel({ staff_id: "STAFF-200", display_name: "Crew", role: "Paramedic", operational_status: "Available", home_station: "Test" }, meta);
  await s.createVehicle({ vehicle_id: "AMB-200", callsign: "Crew 200", vehicle_type: "Ambulance", operational_status: "Available", service_status: "Serviceable", home_station: "Test" }, meta);
  const assignment = await s.createAssignment(incident.incident_id, { vehicle_id: "AMB-200", crew_ids: ["STAFF-200"], reason: "dispatch" }, meta);
  await s.updateAssignment(assignment.assignment_id, { action: "confirm_assignment" }, meta);
  const patientCase = await s.createPatientCase(incident.incident_id, { assignment_id: assignment.assignment_id }, meta);
  await s.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-1" }, meta);
  await s.createEncounterForPatientCase(patientCase.patient_case_id, { care_started_at: "2026-09-06T10:05:00Z", presenting_complaint: "Arrest" }, meta);
  return { s, id: patientCase.patient_case_id };
}

const flagTypes = async (s, id) => (await s.listEpcrQaFlags(id)).map((f) => `${f.flag_type}/${f.severity}/${f.source}`);

test("a terminated resuscitation and a death on scene each raise a high-severity QA flag; a routine outcome raises none", async () => {
  for (const [outcome, expected] of [["resuscitation_terminated", "termination_of_resuscitation"], ["death_on_scene", "death_on_scene"], ["treated_not_transported", null]]) {
    const { s, id } = await setup();
    await s.createPatientCaseAssessment(id, { section_type: "primary_survey", payload: { notes: "Arrest" } }, meta);
    await s.setPatientCaseDisposition(id, { outcome, reason: "Synthetic" }, meta);
    await s.createEpcrVersion(id, {}, meta);
    assert.deepEqual(await flagTypes(s, id), expected ? [`${expected}/high/system:disposition`] : [], outcome);
  }
});

test("an insufficient-stock medication or procedure tells the crew at entry, and a covered one does not", async () => {
  const { s, id } = await setup();
  await s.createStockItem({ stock_item_id: "ITEM-200", name: "Test saline", category: "Fluid", unit_of_measure: "each", item_type: "Consumable" }, meta);
  await s.adjustVehicleStock("AMB-200", "ITEM-200", { type: "restock", quantity_delta: "2", reason: "Test" }, meta);
  const med = (quantity, at) => s.createPatientCaseMedication(id, { medication_name: "Saline", dose: "500", dose_unit: "ml", route: "IV", performed_at: at, stock_item_id: "ITEM-200", quantity_used: quantity }, meta);

  assert.equal((await med("1", "2026-09-06T10:10:00Z")).stock_discrepancy, null);
  assert.equal((await med("5", "2026-09-06T10:20:00Z")).stock_discrepancy, "INSUFFICIENT_STOCK");
  const proc = await s.createPatientCaseProcedure(id, { procedure_type: "iv", procedure_name: "Cannulation", performed_at: "2026-09-06T10:30:00Z", stock_item_id: "ITEM-200", quantity_used: "9" }, meta);
  assert.equal(proc.stock_discrepancy, "INSUFFICIENT_STOCK");
  const noStock = await s.createPatientCaseProcedure(id, { procedure_type: "airway", procedure_name: "Suction", performed_at: "2026-09-06T10:40:00Z" }, meta);
  assert.equal(noStock.stock_discrepancy, null);

  // The notice is transient: the stored record and the QA flag are unchanged.
  const stored = await s.listPatientCaseMedications(id);
  assert.ok(stored.every((row) => !("stock_discrepancy" in row)));
  await s.createEpcrVersion(id, {}, meta);
  assert.ok((await flagTypes(s, id)).some((f) => f.startsWith("medication_discrepancy/high")));
});

test("weight is captured in kilograms with a sane range, and can be updated", async () => {
  const { s, id } = await setup();
  const save = (payload) => s.savePatientCaseDemographics(id, { first_name: "Sam", last_name: "Small", ...payload }, meta);
  assert.equal((await save({ weight_kg: 14.5, minor_context: true, guardian_name: "Pat Small", guardian_relationship: "Parent", guardian_phone: "555-0100" })).weight_kg, 14.5);
  assert.equal((await save({ weight_kg: 15 })).weight_kg, 15);
  for (const bad of [0, -3, 0.1, 501, "14", NaN, Infinity]) await assert.rejects(() => save({ weight_kg: bad }), /weight_kg must be a number/, String(bad));
  const stored = await s.getPatientCaseDemographics(id);
  assert.equal(stored.weight_kg, 15);
  assert.equal(stored.guardian_name, "Pat Small");
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

// Regression: getEpcrReadiness() referenced an undeclared `encounterLink` for transported outcomes,
// so crew completion of any transported case failed with a ReferenceError.

async function setup() {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-epcr-transported-")), "platform.sqlite"),
    openemr: {
      createEncounter: async () => ({ encounter_id: "enc-1", status: "Open" }),
      createObservation: async (p) => ({ observation_id: "obs", encounter_id: p.encounter_id, status: "created" }),
      createHandover: async (p) => ({ ...p, handover_id: "handover" })
    }
  });
  const meta = { correlationId: "transported-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Transported readiness", address: "1 Main St", patient_count: 1 }
  }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, {}, meta);
  const id = patientCase.patient_case_id;
  await service.linkPatientToPatientCase(id, { verification_status: "verified", openemr_patient_id: "patient-1" }, meta);
  const encounter = await service.createEncounterForPatientCase(id, { care_started_at: "2026-09-06T10:01:00Z", presenting_complaint: "Exercise" }, meta);
  await service.savePatientCaseDemographics(id, { first_name: "Dev", last_name: "Patient", dob: "1980-01-01", sex: "male" }, meta);
  await service.createPatientCaseAssessment(id, { section_type: "primary_survey", payload: { notes: "ok" } }, meta);
  return { service, meta, id, incident, encounter };
}

// The handover must precede the disposition: recording a disposition closes the case.
async function transport(service, meta, id) {
  await service.setPatientCaseDisposition(id, { outcome: "transported", destination_facility: "Dev Hospital", decision_at: "2026-09-06T11:30:00Z" }, meta);
}

test("a transported case reports missing serial observations and handover instead of throwing", async () => {
  const { service, meta, id } = await setup();
  await transport(service, meta, id);
  const readiness = await service.getEpcrReadiness(id);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing.map((item) => item.id).sort(), ["handover", "serial_observations"]);
});

test("a transported case with two observations and a completed handover is ready", async () => {
  const { service, meta, id, encounter } = await setup();
  for (const hr of [80, 84]) await service.createPatientCaseObservation(id, { vital_signs: { heart_rate_bpm: hr } }, meta);
  await service.createHandoverForEncounter(encounter.encounter_id, { handover_time: "2026-09-06T11:00:00Z", handover_status: "Handover Completed", disposition: "transport_to_facility", destination_facility: "Dev Hospital" }, meta);
  await transport(service, meta, id);
  const readiness = await service.getEpcrReadiness(id);
  assert.deepEqual(readiness.missing, []);
  assert.equal(readiness.ready, true);
});

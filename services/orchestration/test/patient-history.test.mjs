import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

const meta = { correlationId: "history-test", actorId: "STAFF-001", actorRole: "field_crew" };

function service(openemrOverrides = {}) {
  return new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-patient-history-")), "platform.sqlite"),
    openemr: {
      createPatient: async () => ({ patient_id: "patient" }),
      createEncounter: async (p) => ({ encounter_id: "encounter", status: "Open" }),
      getPatientHistory: async () => ({
        as_of: "2026-08-30T00:00:00Z",
        medications: [{ medication_name: "Metformin", dose: "500mg", frequency: "BID", status: "active" }],
        encounters: [{ encounter_date: "2026-07-12", reason: "Chest pain", facility: "General Hospital" }]
      }),
      ...openemrOverrides
    }
  });
}

async function setupLinkedCase(s) {
  const incident = await s.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "History test", address: "1 Main St", patient_count: 1 }
  }, meta);
  const patientCase = await s.createPatientCase(incident.incident_id, {}, meta);
  await s.linkPatientToPatientCase(patientCase.patient_case_id, { verification_status: "verified", openemr_patient_id: "OE-9001" }, meta);
  return patientCase;
}

test("getPatientCaseHistory returns the linked patient's prior medications/encounters and audits the access", async () => {
  const s = service();
  const patientCase = await setupLinkedCase(s);

  const history = await s.getPatientCaseHistory(patientCase.patient_case_id, meta);
  assert.equal(history.patient_case_id, patientCase.patient_case_id);
  assert.equal(history.openemr_patient_id, "OE-9001");
  assert.equal(history.as_of, "2026-08-30T00:00:00Z");
  assert.equal(history.medications.length, 1);
  assert.equal(history.medications[0].medication_name, "Metformin");
  assert.equal(history.encounters[0].facility, "General Hospital");

  const auditReport = await s.getAuditLogReport({ entityType: "patient_history", action: "view_patient_history" });
  assert.equal(auditReport.entries.length, 1);
  assert.equal(auditReport.entries[0].entity_id, "OE-9001");
  assert.equal(auditReport.entries[0].actor_id, "STAFF-001");
});

test("getPatientCaseHistory rejects a patient case with no linked patient", async () => {
  const s = service();
  const incident = await s.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "History test", address: "1 Main St", patient_count: 1 }
  }, meta);
  const patientCase = await s.createPatientCase(incident.incident_id, {}, meta);

  await assert.rejects(() => s.getPatientCaseHistory(patientCase.patient_case_id, meta), /linked patient/);
});

test("getPatientCaseHistory rejects an unknown patient case", async () => {
  const s = service();
  await assert.rejects(() => s.getPatientCaseHistory("PCR-999999", meta), /not found/i);
});

test("getPatientCaseHistory propagates a downstream OpenEMR failure rather than swallowing it", async () => {
  const s = service({
    getPatientHistory: async () => {
      const error = new Error("OpenEMR transport is not configured");
      error.code = "DOWNSTREAM_UNAVAILABLE";
      throw error;
    }
  });
  const patientCase = await setupLinkedCase(s);

  await assert.rejects(() => s.getPatientCaseHistory(patientCase.patient_case_id, meta), /DOWNSTREAM_UNAVAILABLE|OpenEMR/);
});

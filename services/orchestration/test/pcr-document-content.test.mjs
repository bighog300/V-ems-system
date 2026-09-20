import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderPcrDocument } from "../src/reporting/pcr-document.mjs";
import { OrchestrationService } from "../src/index.mjs";

// Regression: export format 1 printed only an assessment's type and time and had no vital signs,
// handover or notes section, so a signed PDF omitted content its own hash covered.

// The renderer writes uncompressed content streams with hex-encoded TJ arrays; one text object is one line.
function pdfLines(pdf) {
  const raw = pdf.toString("latin1");
  const lines = [];
  for (const block of raw.matchAll(/BT\r?\n([\s\S]*?)\r?\nET/g)) {
    let line = "";
    for (const array of block[1].matchAll(/\[((?:<[0-9a-fA-F]*>|\s|-?[\d.]+)*)\]\s*TJ/g)) {
      for (const hex of array[1].matchAll(/<([0-9a-fA-F]*)>/g)) line += Buffer.from(hex[1], "hex").toString("latin1");
    }
    if (line) lines.push(line);
  }
  // A labelled field is two text objects (bold label, then value); rejoin them.
  return lines.join("\n").replaceAll(":\n ", ": ");
}

function richVersion() {
  return {
    version_id: "EPV-1", patient_case_id: "PCR-000009", version_number: 1, lifecycle_state: "crew_complete",
    content_hash: "f".repeat(64), hash_algorithm: "sha256", created_at: "2026-09-20T10:00:00.000Z", created_by: "STAFF-001", correlation_id: "c1",
    content: {
      incident: { incident_id: "INC-000001", category: "medical_emergency", address: "1 Main St" },
      demographics: { first_name: "Ada", last_name: "Lovelace", dob: "1990-01-01", sex: "female" },
      assessments: [{ section_type: "primary_survey", performed_at: "2026-09-20T09:50:00Z", payload: { notes: "Airway clear, capacity documented, informed refusal" } }],
      observations: [
        { performed_at: "2026-09-20T09:51:00Z", observations: { heart_rate_bpm: 80, blood_pressure_systolic: 120, blood_pressure_diastolic: 80, spo2_pct: 98, temperature_c: 37, gcs_total: 15 }, notes: "first set" },
        { performed_at: "2026-09-20T09:57:00Z", observations: { heart_rate_bpm: 86, respiratory_rate_bpm: 16 }, notes: null }
      ],
      medications: [{ medication_name: "Naloxone", dose: "0.4", dose_unit: "mg", route: "IV", performed_at: "2026-09-20T09:55:00Z", indication: "Opioid overdose", response: "Improved", stock_item_id: "ITEM-001", quantity_used: "1" }],
      procedures: [{ procedure_name: "Suction", procedure_type: "Airway", performed_at: "2026-09-20T09:52:00Z", attempts: 2, success: 1, complications: "None" }],
      disposition: { outcome: "transported", destination_facility: "General Hospital", receiving_provider: "Dr Receiver", decision_at: "2026-09-20T09:58:00Z", notes: "Stable for transport" },
      encounter_link: { handover_status: "Handover Completed", handover_time: "2026-09-20T10:05:00Z", receiving_clinician: "Dr Receiver", destination_facility: "General Hospital", handover_notes: "Verbal and written handover" },
      notes: [{ authored_at: "2026-09-20T09:53:00Z", tags: ["scene_safety"], note_text: "Scene secured before contact" }]
    }
  };
}

test("the PDF renders every clinical item the hashed version content holds", async () => {
  const text = pdfLines(await renderPcrDocument({ version: richVersion(), signatures: [] }));
  for (const expected of [
    "Airway clear, capacity documented, informed refusal",
    "Blood pressure 120/80 mmHg", "Heart rate 80 bpm", "SpO2 98 %", "Temperature 37 °C", "GCS total 15", "Respiratory rate 16 /min", "first set",
    "Indication: Opioid overdose", "Response: Improved", "Stock item: ITEM-001", "Quantity used: 1",
    "Attempts: 2", "Successful: Yes", "Complications: None",
    "Receiving provider: Dr Receiver", "Stable for transport",
    "Handover", "Handover Completed", "Receiving clinician: Dr Receiver", "Verbal and written handover",
    "Crew notes", "scene_safety", "Scene secured before contact"
  ]) assert.ok(text.includes(expected), `PDF is missing: ${expected}`);
});

test("optional sections are omitted, and rendering stays deterministic", async () => {
  const version = richVersion();
  delete version.content.notes; version.content.encounter_link = null; version.content.observations = [];
  const first = await renderPcrDocument({ version, signatures: [] });
  const second = await renderPcrDocument({ version, signatures: [] });
  assert.deepEqual(first, second);
  const text = pdfLines(first);
  assert.ok(!text.includes("Crew notes") && !text.includes("Handover Completed"));
  assert.ok(text.includes("No vital signs recorded."));
});

test("a refusal case exported through the service shows its refusal documentation and vitals", async () => {
  const service = new OrchestrationService({
    dbPath: join(mkdtempSync(join(tmpdir(), "vems-pdf-content-")), "platform.sqlite"),
    openemr: {
      createEncounter: async () => ({ encounter_id: "enc-1", status: "Open" }),
      createObservation: async (p) => ({ observation_id: "obs", encounter_id: p.encounter_id, status: "created" })
    }
  });
  const meta = { correlationId: "pdf-content-test", actorId: "STAFF-001", actorRole: "field_crew" };
  const incident = await service.createIncident({ call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "PDF content", address: "1 Main St", patient_count: 1 } }, meta);
  const id = (await service.createPatientCase(incident.incident_id, {}, meta)).patient_case_id;
  await service.linkPatientToPatientCase(id, { verification_status: "verified", openemr_patient_id: "patient-1" }, meta);
  await service.createEncounterForPatientCase(id, { care_started_at: "2026-09-06T10:01:00Z", presenting_complaint: "Exercise" }, meta);
  await service.savePatientCaseDemographics(id, { first_name: "Dev", last_name: "Refusal", dob: "1990-09-09", sex: "female" }, meta);
  await service.createPatientCaseAssessment(id, { section_type: "primary_survey", payload: { notes: "Patient has capacity; informed refusal of transport documented." } }, meta);
  await service.createPatientCaseObservation(id, { vital_signs: { heart_rate_bpm: 90, blood_pressure_systolic: 130, blood_pressure_diastolic: 85 } }, meta);
  await service.setPatientCaseDisposition(id, { outcome: "refusal_transport", notes: "Refused transport with capacity" }, meta);
  await service.completeEpcr(id, meta);

  const exported = await service.getEpcrExport(id);
  const text = pdfLines(Buffer.from(exported.content_base64, "base64"));
  assert.ok(text.includes(`sha256:${exported.content_hash}`));
  for (const expected of ["Patient has capacity; informed refusal of transport documented.", "Blood pressure 130/85 mmHg", "Heart rate 90 bpm", "Refused transport with capacity"]) {
    assert.ok(text.includes(expected), `PDF is missing: ${expected}`);
  }
});

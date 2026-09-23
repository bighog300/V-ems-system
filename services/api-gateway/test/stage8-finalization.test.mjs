import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../../orchestration/src/index.mjs";
import { createApp } from "../src/server.mjs";

test("Stage 8 Patient Case endpoints expose readiness, lifecycle, signatures, review and lock errors", async t => {
  const dir = mkdtempSync(join(tmpdir(), "vems-stage8-api-"));
  const service = new OrchestrationService({ dbPath: join(dir, "stage8.sqlite") });
  const meta = { correlationId: "stage8-api", actorId: "STAFF-001", actorRole: "supervisor" };
  const incident = await service.createIncident({ call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" }, incident: { category: "medical_emergency", priority: "high", description: "Stage 8", address: "Test", patient_count: 1 } }, meta);
  const patientCase = await service.createPatientCase(incident.incident_id, { temporary_label: "Unknown" }, meta);
  await service.savePatientCaseDemographics(patientCase.patient_case_id, { first_name: "Unknown", unidentified: true, dob_unknown: true }, meta);
  await service.createPatientCaseAssessment(patientCase.patient_case_id, { section_type: "refusal_capacity", payload: { capacity: "documented", refusal: true } }, meta);
  await service.setPatientCaseDisposition(patientCase.patient_case_id, { outcome: "refusal_transport", reason: "declined" }, meta);
  const server = createApp(service); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); service.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = "GET", body) => { const response = await fetch(base + path, { method, headers: { "content-type": "application/json", "x-user-role": "supervisor", "x-actor-id": "STAFF-001", ...(method !== "GET" ? { "idempotency-key": `${method}-${path}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, body: await response.json() }; };
  const id = patientCase.patient_case_id;
  assert.equal((await request(`/api/patient-cases/${id}/readiness`)).body.ready, true);
  // Stage 13 milestone 13c: compliance (jurisdiction minimum-dataset
  // validation) is a distinct, informational check from readiness -- this
  // case satisfies Stage 8's workflow gate but not the reference profile
  // (no dob/sex charted for an unidentified patient), and completion
  // below must still succeed regardless.
  const compliance = await request(`/api/patient-cases/${id}/compliance`);
  assert.equal(compliance.status, 200);
  assert.equal(compliance.body.profile_id, "reference-nemsis-v3");
  assert.equal(compliance.body.ready, false);
  assert.equal((await request(`/api/patient-cases/${id}/complete`, "POST", {})).status, 200);
  assert.equal((await request(`/api/patient-cases/${id}/signatures`, "POST", { signer_role: "treating_clinician", signer_identity: "STAFF-001" })).status, 201);
  assert.equal((await request(`/api/patient-cases/${id}/submit`, "POST", {})).status, 200);
  assert.equal((await request(`/api/patient-cases/${id}/review`, "POST", { action: "finalize", comment: "accepted" })).status, 200);
  const locked = await request(`/api/patient-cases/${id}/assessments`, "POST", { section_type: "late", payload: {} });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error.code, "EPCR_LOCKED");
  const summary = await request(`/api/patient-cases/${id}/summary`);
  assert.equal(summary.body.final_version.hash_algorithm, "sha256");
  assert.equal(summary.body.compliance.profile_id, "reference-nemsis-v3");

  // Stage 13 milestone 13d: signed/versioned PDF export.
  const exported = await request(`/api/patient-cases/${id}/export`);
  assert.equal(exported.status, 200);
  assert.equal(exported.body.content_type, "application/pdf");
  assert.equal(exported.body.content_hash, summary.body.final_version.hash);
  // Stage 13 milestone 13h: the export document format's own version
  // number, independent of the clinical version_number above.
  assert.equal(exported.body.export_format_version, 3);
  const pdf = Buffer.from(exported.body.content_base64, "base64");
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
});

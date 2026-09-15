import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrchestrationService } from "../src/index.mjs";

function service() {
  const dir = mkdtempSync(join(tmpdir(), "vems-retention-"));
  return new OrchestrationService({ dbPath: join(dir, "platform.sqlite"), objectStorageOptions: { rootDir: join(dir, "object-storage") } });
}

async function setupFinalizedCase(s, meta) {
  const incident = await s.createIncident({
    call: { call_source: "phone", received_at: "2026-09-06T10:00:00Z" },
    incident: { category: "medical_emergency", priority: "high", description: "Retention test", address: "1 Main St", patient_count: 1 }
  }, meta);
  const patientCase = await s.createPatientCase(incident.incident_id, { temporary_label: "Unknown patient" }, meta);
  await s.savePatientCaseDemographics(patientCase.patient_case_id, { first_name: "Unknown", unidentified: true, dob_unknown: true }, meta);
  await s.createPatientCaseAssessment(patientCase.patient_case_id, { section_type: "refusal_capacity", payload: { capacity: "documented" } }, meta);
  await s.setPatientCaseDisposition(patientCase.patient_case_id, { outcome: "refusal_transport", reason: "Patient declined" }, meta);
  return { patientCase, incident };
}

async function finalize(s, patientCaseId, meta) {
  await s.completeEpcr(patientCaseId, meta);
  await s.signEpcr(patientCaseId, { signer_role: "treating_clinician", signer_identity: "STAFF-001" }, meta);
  await s.submitEpcr(patientCaseId, meta);
  await s.reviewEpcr(patientCaseId, { action: "accept", comment: "Reviewed" }, { ...meta, actorRole: "clinical_reviewer", actorId: "STAFF-002" });
  await s.reviewEpcr(patientCaseId, { action: "finalize", comment: "Final" }, { ...meta, actorRole: "supervisor", actorId: "STAFF-003" });
}

const meta = { correlationId: "retention-test", actorId: "STAFF-001", actorRole: "field_crew" };

test("setPatientCaseLegalHold applies and releases legal hold, with an audit trail", async () => {
  const s = service();
  const { patientCase } = await setupFinalizedCase(s, meta);

  const applied = await s.setPatientCaseLegalHold(patientCase.patient_case_id, { legal_hold: true, reason: "Active litigation" }, { ...meta, actorId: "STAFF-SUP" });
  assert.equal(applied.legal_hold, 1);

  const auditReport = await s.getAuditLogReport({ entityType: "patient_case", entityId: patientCase.patient_case_id, action: "legal_hold_applied" });
  assert.equal(auditReport.entries.length, 1);
  assert.equal(auditReport.entries[0].actor_id, "STAFF-SUP");
  assert.equal(auditReport.entries[0].after.reason, "Active litigation");

  const released = await s.setPatientCaseLegalHold(patientCase.patient_case_id, { legal_hold: false }, { ...meta, actorId: "STAFF-SUP" });
  assert.equal(released.legal_hold, 0);
});

test("setPatientCaseLegalHold rejects a payload without a boolean legal_hold", async () => {
  const s = service();
  const { patientCase } = await setupFinalizedCase(s, meta);
  await assert.rejects(() => s.setPatientCaseLegalHold(patientCase.patient_case_id, {}, meta), /legal_hold/);
  await assert.rejects(() => s.setPatientCaseLegalHold(patientCase.patient_case_id, { legal_hold: "yes" }, meta), /legal_hold/);
});

test("setPatientCaseLegalHold rejects an unknown patient case", async () => {
  const s = service();
  await assert.rejects(() => s.setPatientCaseLegalHold("PCR-999999", { legal_hold: true }, meta), /not found/i);
});

test("reaching final stamps retention_expires_at only when VEMS_RETENTION_DEFAULT_DAYS is configured", async () => {
  const s = service();
  const { patientCase } = await setupFinalizedCase(s, meta);
  await finalize(s, patientCase.patient_case_id, meta);

  const unstamped = await s.getPatientCase(patientCase.patient_case_id);
  assert.equal(unstamped.retention_expires_at, null);

  const priorRetention = process.env.VEMS_RETENTION_DEFAULT_DAYS;
  process.env.VEMS_RETENTION_DEFAULT_DAYS = "3650";
  try {
    const s2 = service();
    const { patientCase: case2 } = await setupFinalizedCase(s2, meta);
    const beforeFinalize = new Date();
    await finalize(s2, case2.patient_case_id, meta);
    const stamped = await s2.getPatientCase(case2.patient_case_id);
    assert.ok(stamped.retention_expires_at);
    const expectedMs = beforeFinalize.getTime() + 3650 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(new Date(stamped.retention_expires_at).getTime() - expectedMs) < 60_000);
  } finally {
    if (priorRetention === undefined) delete process.env.VEMS_RETENTION_DEFAULT_DAYS; else process.env.VEMS_RETENTION_DEFAULT_DAYS = priorRetention;
  }
});

test("purgeExpiredPatientCases archives an expired, non-held case: object storage blob written, archived_at stamped, row never deleted", async () => {
  const s = service();
  const { patientCase } = await setupFinalizedCase(s, meta);
  await finalize(s, patientCase.patient_case_id, meta);
  await s.db.execute(`UPDATE patient_cases SET retention_expires_at='2020-01-01T00:00:00Z' WHERE patient_case_id='${patientCase.patient_case_id}';`);

  const result = await s.purgeExpiredPatientCases({});
  assert.equal(result.archived_count, 1);
  assert.equal(result.archived[0].patient_case_id, patientCase.patient_case_id);

  const afterCase = await s.patientCases.find(patientCase.patient_case_id);
  assert.ok(afterCase, "the row must still exist -- purge never hard-deletes");
  assert.ok(afterCase.archived_at);

  const archives = await s.getPatientCaseArchives(patientCase.patient_case_id);
  assert.equal(archives.length, 1);
  const stored = await s.objectStorage.getObject(archives[0].storage_key);
  assert.ok(stored, "the archive blob must be retrievable from object storage");
  const archivedPayload = JSON.parse(stored.content.toString("utf8"));
  assert.equal(archivedPayload.patient_case.patient_case_id, patientCase.patient_case_id);
  assert.ok(archivedPayload.versions.length > 0);
});

test("purgeExpiredPatientCases skips a case under legal hold even if retention has expired", async () => {
  const s = service();
  const { patientCase } = await setupFinalizedCase(s, meta);
  await finalize(s, patientCase.patient_case_id, meta);
  await s.db.execute(`UPDATE patient_cases SET retention_expires_at='2020-01-01T00:00:00Z' WHERE patient_case_id='${patientCase.patient_case_id}';`);
  await s.setPatientCaseLegalHold(patientCase.patient_case_id, { legal_hold: true }, meta);

  const result = await s.purgeExpiredPatientCases({});
  assert.equal(result.archived_count, 0);
  const afterCase = await s.patientCases.find(patientCase.patient_case_id);
  assert.equal(afterCase.archived_at, null);
});

test("purgeExpiredPatientCases skips a case with no retention_expires_at set", async () => {
  const s = service();
  const { patientCase } = await setupFinalizedCase(s, meta);
  await finalize(s, patientCase.patient_case_id, meta);

  const result = await s.purgeExpiredPatientCases({});
  assert.equal(result.archived_count, 0);
});

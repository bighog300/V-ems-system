// Stage 13 milestone 13g: the retention purge/archive job. Per the design
// decision in docs/STAGE13_COMPLIANCE_REPORTING_PLAN.md, "deletion" of a
// clinical record never means a hard DELETE -- a case whose retention
// clock has expired (and which isn't under legal hold) is archived first
// (its full clinical/lifecycle history is written as one encrypted blob
// into the same object storage attachments already use) and only then
// marked archived_at on its own row. The row, its versions, signatures,
// amendments and QA flags all stay in place; nothing is destroyed.
//
// Eligibility: archived_at IS NULL (not already archived), legal_hold = 0
// (never touches a held case), retention_expires_at IS NOT NULL AND <= now
// (a case with no retention_expires_at set -- the default -- is never
// eligible; retention must be explicitly stamped, per stampRetentionOnFinal
// below, or set manually).

import { randomUUID } from "node:crypto";
import { sqlValue } from "../db.mjs";

const id = (prefix) => `${prefix}-${randomUUID()}`;

async function buildArchivePayload(service, patientCaseId) {
  const patientCase = await service.patientCases.find(patientCaseId);
  const versions = (await service.db.queryAll(`SELECT * FROM epcr_versions WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY version_number;`))
    .map((v) => ({ ...v, content: v.content_json ? JSON.parse(v.content_json) : null }));
  const lifecycleEvents = await service.db.queryAll(`SELECT * FROM epcr_lifecycle_events WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY occurred_at;`);
  const signatures = await service.getEpcrSignatures(patientCaseId);
  const qaFlags = await service.listEpcrQaFlags(patientCaseId);
  const amendments = await service.listEpcrAmendments(patientCaseId);
  return {
    archived_at: new Date().toISOString(),
    patient_case: patientCase,
    versions,
    lifecycle_events: lifecycleEvents,
    signatures,
    qa_flags: qaFlags,
    amendments
  };
}

async function archivePatientCase(service, patientCaseId, meta) {
  const payload = await buildArchivePayload(service, patientCaseId);
  const buffer = Buffer.from(JSON.stringify(payload), "utf8");
  const stored = await service.objectStorage.putObject(buffer, { contentType: "application/json" });
  const now = new Date().toISOString();
  const archive = { archive_id: id("ARCH"), patient_case_id: patientCaseId, storage_key: stored.key, checksum: stored.checksum, size_bytes: stored.sizeBytes, archived_at: now, correlation_id: meta.correlationId };
  await service.db.execute(`INSERT INTO patient_case_archives (${Object.keys(archive).join(",")}) VALUES (${Object.values(archive).map(sqlValue).join(",")});`);

  const before = await service.patientCases.find(patientCaseId);
  await service.patientCases.save({ ...before, archived_at: now, updated_at: now, correlation_id: meta.correlationId });
  await service.audit("patient_case", patientCaseId, "archived", meta, { archived_at: null }, { archived_at: now, archive_id: archive.archive_id, storage_key: archive.storage_key });
  await service.event("PatientCaseArchived", meta.correlationId, { patient_case_id: patientCaseId, archive_id: archive.archive_id });
  return archive;
}

export async function purgeExpiredPatientCases(service, { now = new Date(), limit = 100 } = {}) {
  const nowIso = now.toISOString();
  const meta = { correlationId: `system:retention-purge:${nowIso}` };
  const candidates = await service.db.queryAll(
    `SELECT patient_case_id FROM patient_cases WHERE archived_at IS NULL AND legal_hold = 0 AND retention_expires_at IS NOT NULL AND retention_expires_at <= ${sqlValue(nowIso)} ORDER BY retention_expires_at LIMIT ${sqlValue(limit)};`
  );
  const archived = [];
  for (const { patient_case_id } of candidates) {
    archived.push(await archivePatientCase(service, patient_case_id, meta));
  }
  return { archived_count: archived.length, archived };
}

export async function getPatientCaseArchives(service, patientCaseId) {
  return service.db.queryAll(`SELECT * FROM patient_case_archives WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY archived_at;`);
}

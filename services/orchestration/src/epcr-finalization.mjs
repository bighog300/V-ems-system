import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "@vems/shared";
import { sqlValue } from "./db.mjs";

export const EPCR_STATES = ["draft", "crew_complete", "signed", "submitted", "qa_review", "returned_for_correction", "final"];
const SIGNATURE_ROLES = new Set(["treating_clinician", "crew_member", "patient", "guardian", "representative", "receiving_clinician", "witness"]);
const REVIEW_ACTIONS = new Set(["accept", "return_for_correction", "request_clarification", "flag_clinical_concern", "finalize"]);
const TRANSITIONS = {
  draft: ["crew_complete"], crew_complete: ["signed"], signed: ["submitted"], submitted: ["qa_review"],
  qa_review: ["final", "returned_for_correction"], returned_for_correction: ["crew_complete"], final: ["draft"]
};

const id = prefix => `${prefix}-${randomUUID()}`;
const json = value => JSON.stringify(value);
const parseJson = (value, fallback = null) => { try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; } };

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.keys(value).sort().reduce((out, key) => { out[key] = canonicalize(value[key]); return out; }, {});
}
export function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
export function hashCanonical(value) { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }

function row(record) {
  if (!record) return null;
  return { ...record, content: parseJson(record.content_json), witness_context: parseJson(record.witness_context_json), flags: parseJson(record.flags_json, []) };
}
function requireCase(service, patientCaseId) { return service.getPatientCase(patientCaseId); }
function currentState(service, patientCaseId) {
  return service.db.queryOne(`SELECT new_state FROM epcr_lifecycle_events WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY occurred_at DESC, lifecycle_event_id DESC LIMIT 1;` )?.new_state ?? "draft";
}
function latestVersion(service, patientCaseId) {
  return row(service.db.queryOne(`SELECT * FROM epcr_versions WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY version_number DESC LIMIT 1;`));
}
function snapshot(service, patientCaseId) {
  const patientCase = requireCase(service, patientCaseId);
  const incident = service.incidents.findById(patientCase.incident_id);
  const patientLink = service.patientLinks.findByPatientCaseId(patientCaseId) ?? null;
  const encounterLink = service.encounterLinks.findByPatientCaseId(patientCaseId) ?? null;
  return canonicalize({
    patient_case: patientCase, incident, patient_link: patientLink, encounter_link: encounterLink,
    demographics: service.clinicalDemographics.find(patientCaseId) ?? null,
    assessments: service.clinicalAssessments.list(patientCaseId), observations: service.clinicalObservations.list(patientCaseId),
    medications: service.clinicalMedications.list(patientCaseId), procedures: service.clinicalProcedures.list(patientCaseId),
    disposition: service.clinicalDispositions.find(patientCaseId) ?? null, timeline: service.clinicalTimeline.list(patientCaseId)
  });
}
function requirements(service, patientCaseId) {
  const c = requireCase(service, patientCaseId), d = service.clinicalDemographics.find(patientCaseId), a = service.clinicalAssessments.list(patientCaseId);
  const observations = service.clinicalObservations.list(patientCaseId), disposition = service.clinicalDispositions.find(patientCaseId), outcome = disposition?.outcome;
  const missing = [], warnings = [], reqs = [];
  const identity = Boolean(d?.unidentified || d?.first_name || d?.last_name || c.temporary_label || c.verification_status !== "unknown");
  reqs.push({ id: "patient_identity", required: true, conditional: "all", satisfied: identity }); if (!identity) missing.push({ id: "patient_identity", message: "Patient identity or provisional/unknown identity documentation is required" });
  reqs.push({ id: "demographics", required: true, conditional: "all", satisfied: Boolean(d) }); if (!d) missing.push({ id: "demographics", message: "Demographics record is required" });
  reqs.push({ id: "assessment", required: true, conditional: "all", satisfied: a.length > 0 }); if (!a.length) missing.push({ id: "assessment", message: "At least one assessment is required" });
  reqs.push({ id: "disposition", required: true, conditional: "all", satisfied: Boolean(outcome) }); if (!outcome) missing.push({ id: "disposition", message: "Disposition/outcome is required" });
  const transported = outcome === "transported" || outcome === "transfer_other_provider";
  if (transported) {
    reqs.push({ id: "encounter", required: true, conditional: "transported", satisfied: Boolean(c.openemr_encounter_id) }); if (!c.openemr_encounter_id) missing.push({ id: "encounter", message: "OpenEMR encounter is required for transported cases" });
    reqs.push({ id: "serial_observations", required: true, conditional: "transported", satisfied: observations.length >= 2 }); if (observations.length < 2) missing.push({ id: "serial_observations", message: "At least two serial observations are required for transported cases" });
    reqs.push({ id: "handover", required: true, conditional: "transported", satisfied: Boolean(c.openemr_encounter_id && (encounterLink?.handover_status === "Handover Completed" || encounterLink?.closure_ready)) }); if (!(encounterLink?.handover_status === "Handover Completed" || encounterLink?.closure_ready)) missing.push({ id: "handover", message: "Completed handover is required for transported cases" });
  } else if (["refusal_assessment", "refusal_treatment", "refusal_transport"].includes(outcome)) {
    const refusal = a.some(x => /refusal|capacity|consent/i.test(`${x.section_type} ${JSON.stringify(x.payload)}`));
    reqs.push({ id: "refusal_documentation", required: true, conditional: "refusal", satisfied: refusal }); if (!refusal) missing.push({ id: "refusal_documentation", message: "Capacity/refusal documentation is required" });
    warnings.push({ id: "refusal_signatures", message: "Patient/representative and witness signatures may be required by configured policy" });
  } else if (!outcome) warnings.push({ id: "outcome", message: "Requirements will become more specific after a disposition is recorded" });
  return { ready: missing.length === 0, missing, warnings, requirements: reqs };
}
function createVersion(service, patientCaseId, lifecycleState, meta, sourceRevision = "clinical_record") {
  const content = snapshot(service, patientCaseId), canonical = canonicalJson(content), hash = hashCanonical(content), prior = latestVersion(service, patientCaseId);
  const version = { version_id: id("EPV"), patient_case_id: patientCaseId, version_number: (prior?.version_number ?? 0) + 1, lifecycle_state: lifecycleState, content_json: canonical, content_hash: hash, hash_algorithm: "sha256", source_revision: sourceRevision, created_at: new Date().toISOString(), created_by: meta.actorId ?? null, correlation_id: meta.correlationId };
  service.db.execute(`INSERT INTO epcr_versions (${Object.keys(version).join(",")}) VALUES (${Object.values(version).map(sqlValue).join(",")});`);
  const discrepancies = service.db.queryAll(`SELECT stock_usage_id, discrepancy_status FROM stock_usage WHERE patient_case_id=${sqlValue(patientCaseId)} AND discrepancy_status IS NOT NULL AND discrepancy_status <> '';`);
  const disposition = service.clinicalDispositions.find(patientCaseId);
  const automaticFlags = discrepancies.map(item => ({ type: "medication_discrepancy", severity: "high", source: "system:stock_discrepancy", note: item.discrepancy_status }))
    .concat(["refusal_assessment", "refusal_treatment", "refusal_transport"].includes(disposition?.outcome) ? [{ type: "refusal", severity: "warning", source: "system:disposition", note: disposition.outcome }] : []);
  for (const flag of automaticFlags) {
    const qa = { flag_id: id("QAF"), patient_case_id: patientCaseId, version_id: version.version_id, flag_type: flag.type, severity: flag.severity, source: flag.source, raised_at: version.created_at, raised_by: "system", resolved_at: null, resolved_by: null, resolution_note: flag.note, correlation_id: meta.correlationId };
    service.db.execute(`INSERT INTO epcr_qa_flags (${Object.keys(qa).join(",")}) VALUES (${Object.values(qa).map(sqlValue).join(",")});`);
  }
  return row(version);
}
function audit(service, patientCaseId, action, meta, before, after) { service.audit("epcr", patientCaseId, action, meta.correlationId, before, after); service.event(`Epcr${action[0].toUpperCase()}${action.slice(1)}`, meta.correlationId, { patient_case_id: patientCaseId, version_id: after?.version_id ?? null }); }

export const epcrFinalizationMethods = {
  assertPatientCaseClinicalMutable(patientCaseId) {
    const state = currentState(this, patientCaseId);
    if (state === "final") throw new ApiError("EPCR_LOCKED", "Finalized ePCR is locked; use the audited amendment workflow", 409);
    return true;
  },
  getEpcrReadiness(patientCaseId) { requireCase(this, patientCaseId); return requirements(this, patientCaseId); },
  getEpcrLifecycle(patientCaseId) {
    requireCase(this, patientCaseId);
    return { current_state: currentState(this, patientCaseId), events: this.db.queryAll(`SELECT * FROM epcr_lifecycle_events WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY occurred_at, lifecycle_event_id;`) };
  },
  createEpcrVersion(patientCaseId, payload = {}, meta) {
    requireCase(this, patientCaseId); const state = currentState(this, patientCaseId);
    return createVersion(this, patientCaseId, payload.lifecycle_state ?? state, meta, payload.source_revision ?? "manual");
  },
  listEpcrVersions(patientCaseId) { requireCase(this, patientCaseId); return this.db.queryAll(`SELECT version_id,patient_case_id,version_number,lifecycle_state,content_hash,hash_algorithm,source_revision,created_at,created_by,correlation_id FROM epcr_versions WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY version_number;`); },
  getEpcrVersion(patientCaseId, versionId) { requireCase(this, patientCaseId); const v = row(this.db.queryOne(`SELECT * FROM epcr_versions WHERE patient_case_id=${sqlValue(patientCaseId)} AND version_id=${sqlValue(versionId)};`)); if (!v) throw new ApiError("NOT_FOUND", "ePCR version not found", 404); return v; },
  transitionEpcr(patientCaseId, nextState, meta, reason = null, versionId = null) {
    requireCase(this, patientCaseId); const previous = currentState(this, patientCaseId);
    if (!EPCR_STATES.includes(nextState) || !TRANSITIONS[previous]?.includes(nextState)) throw new ApiError("INVALID_STATUS_TRANSITION", `Invalid ePCR transition from ${previous} to ${nextState}`, 409);
    const event = { lifecycle_event_id: id("EPL"), patient_case_id: patientCaseId, previous_state: previous, new_state: nextState, actor_id: meta.actorId ?? null, actor_role: meta.actorRole ?? null, occurred_at: new Date().toISOString(), reason, record_version_id: versionId, correlation_id: meta.correlationId };
    this.db.execute(`INSERT INTO epcr_lifecycle_events (${Object.keys(event).join(",")}) VALUES (${Object.values(event).map(sqlValue).join(",")});`);
    audit(this, patientCaseId, "lifecycleTransitioned", meta, { state: previous }, event); return this.getEpcrLifecycle(patientCaseId);
  },
  completeEpcr(patientCaseId, meta) {
    const readiness = this.getEpcrReadiness(patientCaseId); if (!readiness.ready) { const error = new ApiError("EPCR_INCOMPLETE", "ePCR is not ready for crew completion", 409); error.details = readiness; throw error; }
    const version = createVersion(this, patientCaseId, "crew_complete", meta, "crew_complete"); this.transitionEpcr(patientCaseId, "crew_complete", meta, meta.reason ?? null, version.version_id); return { version, readiness, lifecycle: this.getEpcrLifecycle(patientCaseId) };
  },
  signEpcr(patientCaseId, payload, meta) {
    const state = currentState(this, patientCaseId), version = latestVersion(this, patientCaseId);
    if (state !== "crew_complete") throw new ApiError("INVALID_STATUS_TRANSITION", "Only a crew-complete ePCR can be signed", 409);
    if (!version) throw new ApiError("CONFLICT", "A version is required before signing", 409);
    if (!SIGNATURE_ROLES.has(payload.signer_role) || typeof payload.signer_identity !== "string" || !payload.signer_identity.trim()) throw new ApiError("INVALID_PAYLOAD", "Valid signer_role and signer_identity are required", 400);
    const signature = { signature_id: id("SIG"), patient_case_id: patientCaseId, version_id: version.version_id, record_hash: version.content_hash, signer_role: payload.signer_role, signer_identity: payload.signer_identity.trim(), signer_display_name: payload.signer_display_name ?? null, personnel_id: payload.personnel_id ?? null, signed_at: new Date().toISOString(), signature_method: payload.signature_method ?? "attestation", acknowledgement: payload.acknowledgement ?? "I attest that this ePCR is accurate to the best of my knowledge.", signature_image_ref: payload.signature_image_ref ?? null, witness_context_json: payload.witness_context ?? null, correlation_id: meta.correlationId };
    this.db.execute(`INSERT INTO epcr_signatures (${Object.keys(signature).join(",")}) VALUES (${Object.values(signature).map((v, i) => sqlValue(i === 12 ? json(v) : v)).join(",")});`);
    if (state === "crew_complete") this.transitionEpcr(patientCaseId, "signed", meta, "signature recorded", version.version_id);
    audit(this, patientCaseId, "signed", meta, null, { signature_id: signature.signature_id, version_id: version.version_id, record_hash: version.content_hash, signer_role: signature.signer_role });
    return this.getEpcrSignatures(patientCaseId);
  },
  getEpcrSignatures(patientCaseId) { requireCase(this, patientCaseId); return this.db.queryAll(`SELECT * FROM epcr_signatures WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY signed_at;`).map(r => ({ ...r, witness_context: parseJson(r.witness_context_json) })); },
  submitEpcr(patientCaseId, meta) { const v = latestVersion(this, patientCaseId); if (!v) throw new ApiError("CONFLICT", "A version is required before submission", 409); this.transitionEpcr(patientCaseId, "submitted", meta, meta.reason ?? null, v.version_id); return this.getEpcrLifecycle(patientCaseId); },
  reviewEpcr(patientCaseId, payload, meta) {
    requireCase(this, patientCaseId); if (!REVIEW_ACTIONS.has(payload.action)) throw new ApiError("INVALID_PAYLOAD", "Unsupported review action", 400);
    const state = currentState(this, patientCaseId), v = latestVersion(this, patientCaseId); if (!v || !["submitted", "qa_review"].includes(state)) throw new ApiError("INVALID_STATUS_TRANSITION", "Only submitted ePCRs can enter clinical review", 409);
    if (state === "submitted") this.transitionEpcr(patientCaseId, "qa_review", meta, payload.comment ?? null, v.version_id);
    const resulting = payload.action === "return_for_correction" ? "returned_for_correction" : payload.action === "finalize" ? "final" : "qa_review";
    if (resulting !== "qa_review") this.transitionEpcr(patientCaseId, resulting, meta, payload.comment ?? null, v.version_id);
    const review = { review_id: id("REV"), patient_case_id: patientCaseId, version_id: v.version_id, reviewer_id: meta.actorId ?? null, reviewer_role: meta.actorRole ?? "clinical_reviewer", action: payload.action, comment: payload.comment ?? null, flags_json: json(payload.flags ?? []), resulting_state: resulting, created_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.db.execute(`INSERT INTO epcr_reviews (${Object.keys(review).join(",")}) VALUES (${Object.values(review).map(sqlValue).join(",")});`); audit(this, patientCaseId, "reviewed", meta, null, { review_id: review.review_id, action: review.action, version_id: v.version_id });
    return { review, lifecycle: this.getEpcrLifecycle(patientCaseId) };
  },
  listEpcrReviews(patientCaseId) { requireCase(this, patientCaseId); return this.db.queryAll(`SELECT * FROM epcr_reviews WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY created_at;`).map(r => ({ ...r, flags: parseJson(r.flags_json, []) })); },
  createEpcrAmendment(patientCaseId, payload, meta) {
    requireCase(this, patientCaseId); const base = this.getEpcrVersion(patientCaseId, payload.base_version_id ?? latestVersion(this, patientCaseId)?.version_id); if (currentState(this, patientCaseId) !== "final") throw new ApiError("CONFLICT", "Amendments are only available after finalization", 409);
    const amendment = { amendment_id: id("AMD"), patient_case_id: patientCaseId, base_version_id: base.version_id, resulting_version_id: null, author_id: meta.actorId ?? null, reason: String(payload.reason ?? "").trim(), affected_path: String(payload.affected_path ?? "").trim(), before_value_json: json(payload.before_value), after_value_json: json(payload.after_value), status: "applied", created_at: new Date().toISOString(), correlation_id: meta.correlationId };
    if (!amendment.reason || !amendment.affected_path) throw new ApiError("INVALID_PAYLOAD", "reason and affected_path are required", 400);
    const content = { ...base.content, amendment: { affected_path: amendment.affected_path, before_value: payload.before_value ?? null, after_value: payload.after_value ?? null, reason: amendment.reason } };
    const version = { version_id: id("EPV"), patient_case_id: patientCaseId, version_number: base.version_number + 1, lifecycle_state: "draft", content_json: canonicalJson(content), content_hash: hashCanonical(content), hash_algorithm: "sha256", source_revision: `amendment:${amendment.amendment_id}`, created_at: amendment.created_at, created_by: meta.actorId ?? null, correlation_id: meta.correlationId };
    this.db.withTransaction(() => {
      this.db.execute(`INSERT INTO epcr_versions (${Object.keys(version).join(",")}) VALUES (${Object.values(version).map(sqlValue).join(",")});`);
      this.db.execute(`INSERT INTO epcr_amendments (${Object.keys(amendment).join(",")}) VALUES (${Object.values({ ...amendment, resulting_version_id: version.version_id }).map(sqlValue).join(",")});`);
    });
    this.transitionEpcr(patientCaseId, "draft", meta, "amendment created", version.version_id);
    audit(this, patientCaseId, "amended", meta, { version_id: base.version_id }, { amendment_id: amendment.amendment_id, version_id: version.version_id, content_hash: version.content_hash });
    return { amendment: { ...amendment, resulting_version_id: version.version_id }, version: row(version) };
  },
  listEpcrAmendments(patientCaseId) { requireCase(this, patientCaseId); return this.db.queryAll(`SELECT * FROM epcr_amendments WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY created_at;`).map(r => ({ ...r, before_value: parseJson(r.before_value_json), after_value: parseJson(r.after_value_json) })); },
  createEpcrQaFlag(patientCaseId, payload, meta) {
    requireCase(this, patientCaseId); const flag = { flag_id: id("QAF"), patient_case_id: patientCaseId, version_id: payload.version_id ?? latestVersion(this, patientCaseId)?.version_id ?? null, flag_type: String(payload.flag_type ?? "").trim(), severity: payload.severity ?? "warning", source: payload.source ?? "manual", raised_at: new Date().toISOString(), raised_by: meta.actorId ?? null, resolved_at: null, resolved_by: null, resolution_note: null, correlation_id: meta.correlationId }; if (!flag.flag_type) throw new ApiError("INVALID_PAYLOAD", "flag_type is required", 400); this.db.execute(`INSERT INTO epcr_qa_flags (${Object.keys(flag).join(",")}) VALUES (${Object.values(flag).map(sqlValue).join(",")});`); audit(this, patientCaseId, "qaFlagRaised", meta, null, { flag_id: flag.flag_id, flag_type: flag.flag_type, version_id: flag.version_id }); return flag;
  },
  listEpcrQaFlags(patientCaseId) { requireCase(this, patientCaseId); return this.db.queryAll(`SELECT * FROM epcr_qa_flags WHERE patient_case_id=${sqlValue(patientCaseId)} ORDER BY raised_at;`); },
  updateEpcrQaFlag(patientCaseId, flagId, payload, meta) { const flag = this.db.queryOne(`SELECT * FROM epcr_qa_flags WHERE patient_case_id=${sqlValue(patientCaseId)} AND flag_id=${sqlValue(flagId)};`); if (!flag) throw new ApiError("NOT_FOUND", "QA flag not found", 404); if (payload.resolution_note === undefined) throw new ApiError("INVALID_PAYLOAD", "resolution_note is required", 400); const updated = { ...flag, resolved_at: new Date().toISOString(), resolved_by: meta.actorId ?? null, resolution_note: payload.resolution_note }; this.db.execute(`UPDATE epcr_qa_flags SET resolved_at=${sqlValue(updated.resolved_at)},resolved_by=${sqlValue(updated.resolved_by)},resolution_note=${sqlValue(updated.resolution_note)} WHERE flag_id=${sqlValue(flagId)};`); audit(this, patientCaseId, "qaFlagResolved", meta, flag, updated); return updated; },
  getEpcrSummary(patientCaseId) { const c = requireCase(this, patientCaseId), lifecycle = this.getEpcrLifecycle(patientCaseId), version = latestVersion(this, patientCaseId); return { patient_case: c, incident: this.incidents.findById(c.incident_id), readiness: this.getEpcrReadiness(patientCaseId), demographics: this.clinicalDemographics.find(patientCaseId) ?? null, assessments: this.clinicalAssessments.list(patientCaseId), observations: this.clinicalObservations.list(patientCaseId), medications: this.clinicalMedications.list(patientCaseId), procedures: this.clinicalProcedures.list(patientCaseId), disposition: this.clinicalDispositions.find(patientCaseId) ?? null, timeline: this.clinicalTimeline.list(patientCaseId), signatures: this.getEpcrSignatures(patientCaseId), lifecycle, final_version: version ? { version_id: version.version_id, version_number: version.version_number, hash: version.content_hash, hash_algorithm: version.hash_algorithm } : null, amendments: this.listEpcrAmendments(patientCaseId), reviews: this.listEpcrReviews(patientCaseId), qa_flags: this.listEpcrQaFlags(patientCaseId) }; }
};

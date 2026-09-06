import { randomUUID } from "node:crypto";
import { ApiError } from "@vems/shared";
import { sqlValue } from "./db.mjs";

const OUTCOMES = new Set([
  "transported", "treated_not_transported", "refusal_assessment", "refusal_treatment",
  "refusal_transport", "no_patient_found", "left_scene", "transfer_other_provider",
  "cancelled_before_contact", "death_on_scene", "resuscitation_terminated"
]);

const requiredCase = function (id) {
  const record = this.getPatientCase(id);
  if (!record) throw new ApiError("NOT_FOUND", `Patient case ${id} not found`, 404);
  return record;
};
const object = (value, message = "Payload must be an object") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("INVALID_PAYLOAD", message, 400);
};
const text = (value, name) => {
  if (typeof value !== "string" || value.trim().length === 0) throw new ApiError("INVALID_PAYLOAD", `${name} is required`, 400);
  return value.trim();
};
const iso = (value, name) => {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new ApiError("INVALID_PAYLOAD", `${name} must be a valid timestamp`, 400);
  return new Date(parsed).toISOString();
};
const id = prefix => `${prefix}-${randomUUID()}`;

function appendTimeline(service, record, meta) {
  service.clinicalTimeline.create({
    timeline_event_id: id("TL"), patient_case_id: record.patient_case_id,
    encounter_id: record.encounter_id ?? null, event_type: record.event_type,
    occurred_at: record.occurred_at ?? record.performed_at ?? record.decision_at ?? new Date().toISOString(), source_system: record.source_system ?? "vems",
    source_entity_type: record.source_entity_type ?? null, source_entity_id: record.source_entity_id ?? null,
    payload: record.payload ?? {}, created_at: new Date().toISOString(), correlation_id: meta.correlationId
  });
}

export const clinicalRecordMethods = {
  getPatientCaseDemographics(patientCaseId) {
    requiredCase.call(this, patientCaseId);
    return this.clinicalDemographics.find(patientCaseId) ?? null;
  },
  savePatientCaseDemographics(patientCaseId, payload, meta) {
    const current = requiredCase.call(this, patientCaseId);
    const before = this.clinicalDemographics.find(patientCaseId);
    object(payload);
    const allowed = ["first_name", "middle_name", "last_name", "preferred_name", "dob", "dob_unknown", "estimated_age_years", "sex", "gender_identity", "address_line1", "address_line2", "city", "region", "postal_code", "country_code", "phone", "identity_document_type", "identity_document_value", "identity_source", "identity_confidence", "next_of_kin_name", "next_of_kin_relationship", "next_of_kin_phone", "guardian_name", "guardian_relationship", "guardian_phone", "minor_context", "unidentified"];
    const unknown = Object.keys(payload).filter(key => !allowed.includes(key));
    if (unknown.length) throw new ApiError("INVALID_PAYLOAD", `Unknown demographics fields: ${unknown.join(", ")}`, 400);
    if (payload.dob_unknown && payload.dob) throw new ApiError("INVALID_PAYLOAD", "dob must be omitted when dob_unknown is true", 400);
    if (payload.dob && payload.dob === "1900-01-01") throw new ApiError("INVALID_PAYLOAD", "Technical provisional DOB cannot be stored as a verified DOB", 400);
    if (payload.estimated_age_years !== undefined && (!Number.isInteger(payload.estimated_age_years) || payload.estimated_age_years < 0 || payload.estimated_age_years > 130)) throw new ApiError("INVALID_PAYLOAD", "estimated_age_years must be between 0 and 130", 400);
    const now = new Date().toISOString();
    const record = { patient_case_id: patientCaseId, ...payload, created_at: before?.created_at ?? now, updated_at: now, correlation_id: meta.correlationId };
    this.clinicalDemographics.save(record);
    this.audit("patient_case_demographics", patientCaseId, "update_demographics", meta.correlationId, before, record);
    this.event("PatientCaseDemographicsUpdated", meta.correlationId, { patient_case_id: patientCaseId, incident_id: current.incident_id });
    appendTimeline(this, { patient_case_id: patientCaseId, event_type: "demographics_updated", occurred_at: now, source_entity_type: "demographics", source_entity_id: patientCaseId, payload: { identity_source: payload.identity_source ?? null } }, meta);
    return this.clinicalDemographics.find(patientCaseId);
  },
  listPatientCaseAssessments(patientCaseId) { requiredCase.call(this, patientCaseId); return this.clinicalAssessments.list(patientCaseId); },
  createPatientCaseAssessment(patientCaseId, payload, meta) {
    const current = requiredCase.call(this, patientCaseId); object(payload);
    const sectionType = text(payload.section_type, "section_type");
    const performedAt = iso(payload.performed_at ?? new Date().toISOString(), "performed_at");
    if (!payload.payload || typeof payload.payload !== "object" || Array.isArray(payload.payload)) throw new ApiError("INVALID_PAYLOAD", "payload must be an object", 400);
    const record = { assessment_id: id("ASM"), patient_case_id: patientCaseId, encounter_id: payload.encounter_id ?? current.openemr_encounter_id ?? null, section_type: sectionType, payload: payload.payload, performed_at: performedAt, clinician_id: payload.clinician_id ?? current.lead_clinician_id ?? null, created_at: new Date().toISOString(), correlation_id: meta.correlationId };
    this.clinicalAssessments.create(record);
    this.audit("patient_case_assessment", record.assessment_id, "create_assessment", meta.correlationId, undefined, record);
    this.event("PatientCaseAssessmentCreated", meta.correlationId, { patient_case_id: patientCaseId, incident_id: current.incident_id, assessment_id: record.assessment_id, section_type: sectionType });
    appendTimeline(this, { ...record, timeline_event_id: undefined, event_type: "assessment_recorded", source_entity_type: "assessment", source_entity_id: record.assessment_id }, meta);
    return record;
  },
  listPatientCaseObservations(patientCaseId) { requiredCase.call(this, patientCaseId); return this.clinicalObservations.list(patientCaseId); },
  async createPatientCaseObservation(patientCaseId, payload, meta) {
    const current = requiredCase.call(this, patientCaseId); object(payload);
    const performedAt = iso(payload.recorded_at ?? payload.performed_at ?? new Date().toISOString(), "recorded_at");
    const observations = payload.observations ?? payload.vital_signs;
    if (!observations || typeof observations !== "object" || Array.isArray(observations)) throw new ApiError("INVALID_PAYLOAD", "observations or vital_signs is required", 400);
    const record = { observation_event_id: id("OBS"), patient_case_id: patientCaseId, encounter_id: payload.encounter_id ?? current.openemr_encounter_id, performed_at: performedAt, clinician_id: payload.clinician_id ?? current.lead_clinician_id ?? null, observations, notes: payload.notes ?? null, openemr_observation_id: null, downstream_status: "pending", created_at: new Date().toISOString(), correlation_id: meta.correlationId };
    if (!record.encounter_id) throw new ApiError("CONFLICT", "An encounter is required for clinical observations", 409);
    this.clinicalObservations.create(record);
    let downstreamStatus = "not_attempted";
    try {
      const downstream = await this.openemr.createObservation({ encounter_id: record.encounter_id, incident_id: current.incident_id, patient_case_id: patientCaseId, patient_id: current.openemr_patient_id, recorded_at: performedAt, source: payload.source ?? "manual", notes: payload.notes, vital_signs: observations });
      record.openemr_observation_id = downstream.observation_id ?? null; downstreamStatus = "created";
    } catch (error) { downstreamStatus = `failed:${error.code ?? "DOWNSTREAM_UNAVAILABLE"}`; }
    this.db.execute(`UPDATE clinical_observations SET openemr_observation_id=${sqlValue(record.openemr_observation_id)},downstream_status=${sqlValue(downstreamStatus)} WHERE observation_event_id=${sqlValue(record.observation_event_id)};`);
    record.downstream_status = downstreamStatus;
    this.audit("clinical_observation", record.observation_event_id, "create_observation", meta.correlationId, undefined, { patient_case_id: patientCaseId, incident_id: current.incident_id, performed_at: performedAt, downstream_status: downstreamStatus });
    this.event("PatientCaseObservationCreated", meta.correlationId, { patient_case_id: patientCaseId, incident_id: current.incident_id, observation_id: record.observation_event_id, downstream_status: downstreamStatus });
    appendTimeline(this, { ...record, event_type: "observation_recorded", source_entity_type: "observation", source_entity_id: record.observation_event_id }, meta);
    return record;
  },
  listPatientCaseMedications(patientCaseId) { requiredCase.call(this, patientCaseId); return this.clinicalMedications.list(patientCaseId); },
  async createPatientCaseMedication(patientCaseId, payload, meta) {
    const current = requiredCase.call(this, patientCaseId); object(payload);
    const record = { medication_administration_id: id("MED"), patient_case_id: patientCaseId, encounter_id: payload.encounter_id ?? current.openemr_encounter_id, medication_name: text(payload.medication_name, "medication_name"), formulation: payload.formulation ?? null, dose: text(String(payload.dose ?? ""), "dose"), dose_unit: text(payload.dose_unit, "dose_unit"), route: text(payload.route, "route"), indication: payload.indication ?? null, performed_at: iso(payload.performed_at ?? new Date().toISOString(), "performed_at"), clinician_id: payload.clinician_id ?? current.lead_clinician_id ?? null, authorization: payload.authorization ?? null, response: payload.response ?? null, adverse_reaction: payload.adverse_reaction ?? null, stock_item_id: payload.stock_item_id ?? null, vehicle_id: payload.vehicle_id ?? current.vehicle_id ?? null, quantity_used: payload.quantity_used ?? null, openemr_reference_id: null, downstream_status: "not_attempted", created_at: new Date().toISOString(), correlation_id: meta.correlationId };
    if (!record.encounter_id) throw new ApiError("CONFLICT", "An encounter is required for medication administration", 409);
    const fingerprint = JSON.stringify({ patient_case_id: patientCaseId, medication_name: record.medication_name, dose: record.dose, performed_at: record.performed_at, route: record.route });
    if (meta.idempotencyKey) { const existing = this.idempotency.get("medication", meta.idempotencyKey); if (existing) { if (existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409); return this.clinicalMedications.find(existing.resource_id); } }
    this.clinicalMedications.create(record);
    try { const downstream = await this.openemr.createIntervention({ encounter_id: record.encounter_id, incident_id: current.incident_id, patient_case_id: patientCaseId, patient_id: current.openemr_patient_id, type: "medication", name: record.medication_name, dose: record.dose, route: record.route, performed_at: record.performed_at, response: record.response, stock_item_id: record.stock_item_id }); record.openemr_reference_id = downstream.intervention_id ?? null; record.downstream_status = "created"; } catch (error) { record.downstream_status = `failed:${error.code ?? "DOWNSTREAM_UNAVAILABLE"}`; }
    this.db.execute(`UPDATE medication_administrations SET openemr_reference_id=${sqlValue(record.openemr_reference_id)},downstream_status=${sqlValue(record.downstream_status)} WHERE medication_administration_id=${sqlValue(record.medication_administration_id)};`);
    if (record.stock_item_id) this.recordClinicalStockUsage({ ...record, intervention_id: record.medication_administration_id, incident_id: current.incident_id, encounter_id: record.encounter_id, type: "medication", name: record.medication_name, quantity_used: record.quantity_used ?? "1", patient_case_id: patientCaseId }, meta);
    if (meta.idempotencyKey) this.idempotency.save("medication", meta.idempotencyKey, record.medication_administration_id, record.created_at, fingerprint);
    this.audit("medication_administration", record.medication_administration_id, "create_medication", meta.correlationId, undefined, { patient_case_id: patientCaseId, incident_id: current.incident_id, medication_name: record.medication_name, downstream_status: record.downstream_status });
    this.event("MedicationAdministrationCreated", meta.correlationId, { patient_case_id: patientCaseId, incident_id: current.incident_id, medication_administration_id: record.medication_administration_id });
    appendTimeline(this, { ...record, event_type: "medication_administered", source_entity_type: "medication", source_entity_id: record.medication_administration_id }, meta);
    return this.clinicalMedications.find(record.medication_administration_id);
  },
  listPatientCaseProcedures(patientCaseId) { requiredCase.call(this, patientCaseId); return this.clinicalProcedures.list(patientCaseId); },
  async createPatientCaseProcedure(patientCaseId, payload, meta) {
    const current = requiredCase.call(this, patientCaseId); object(payload);
    const record = { procedure_id: id("PROC"), patient_case_id: patientCaseId, encounter_id: payload.encounter_id ?? current.openemr_encounter_id, procedure_type: text(payload.procedure_type, "procedure_type"), procedure_name: text(payload.procedure_name, "procedure_name"), performed_at: iso(payload.performed_at ?? new Date().toISOString(), "performed_at"), clinician_id: payload.clinician_id ?? current.lead_clinician_id ?? null, attempts: payload.attempts ?? null, success: payload.success ?? null, complications: payload.complications ?? null, response: payload.response ?? null, stock_item_id: payload.stock_item_id ?? null, vehicle_id: payload.vehicle_id ?? current.vehicle_id ?? null, quantity_used: payload.quantity_used ?? null, openemr_reference_id: null, downstream_status: "not_attempted", created_at: new Date().toISOString(), correlation_id: meta.correlationId };
    if (!record.encounter_id) throw new ApiError("CONFLICT", "An encounter is required for procedures", 409);
    const fingerprint = JSON.stringify({ patient_case_id: patientCaseId, procedure_type: record.procedure_type, procedure_name: record.procedure_name, performed_at: record.performed_at });
    if (meta.idempotencyKey) { const existing = this.idempotency.get("procedure", meta.idempotencyKey); if (existing) { if (existing.request_fingerprint !== fingerprint) throw new ApiError("CONFLICT", "Idempotency key was reused with a different request", 409); return this.clinicalProcedures.find(existing.resource_id); } }
    this.clinicalProcedures.create(record);
    try { const downstream = await this.openemr.createIntervention({ encounter_id: record.encounter_id, incident_id: current.incident_id, patient_case_id: patientCaseId, patient_id: current.openemr_patient_id, type: "procedure", name: record.procedure_name, performed_at: record.performed_at, response: record.response }); record.openemr_reference_id = downstream.intervention_id ?? null; record.downstream_status = "created"; } catch (error) { record.downstream_status = `failed:${error.code ?? "DOWNSTREAM_UNAVAILABLE"}`; }
    this.db.execute(`UPDATE clinical_procedures SET openemr_reference_id=${sqlValue(record.openemr_reference_id)},downstream_status=${sqlValue(record.downstream_status)} WHERE procedure_id=${sqlValue(record.procedure_id)};`);
    if (record.stock_item_id) this.recordClinicalStockUsage({ ...record, intervention_id: record.procedure_id, incident_id: current.incident_id, encounter_id: record.encounter_id, type: "procedure", name: record.procedure_name, quantity_used: record.quantity_used ?? "1", patient_case_id: patientCaseId }, meta);
    if (meta.idempotencyKey) this.idempotency.save("procedure", meta.idempotencyKey, record.procedure_id, record.created_at, fingerprint);
    this.audit("clinical_procedure", record.procedure_id, "create_procedure", meta.correlationId, undefined, { patient_case_id: patientCaseId, incident_id: current.incident_id, procedure_name: record.procedure_name, downstream_status: record.downstream_status });
    this.event("ClinicalProcedureCreated", meta.correlationId, { patient_case_id: patientCaseId, incident_id: current.incident_id, procedure_id: record.procedure_id });
    appendTimeline(this, { ...record, event_type: "procedure_performed", source_entity_type: "procedure", source_entity_id: record.procedure_id }, meta);
    return this.clinicalProcedures.find(record.procedure_id);
  },
  getPatientCaseDisposition(patientCaseId) { requiredCase.call(this, patientCaseId); return this.clinicalDispositions.find(patientCaseId) ?? null; },
  setPatientCaseDisposition(patientCaseId, payload, meta) {
    const current = requiredCase.call(this, patientCaseId); object(payload);
    const before = this.clinicalDispositions.find(patientCaseId);
    if (!OUTCOMES.has(payload.outcome)) throw new ApiError("INVALID_PAYLOAD", `outcome must be one of: ${[...OUTCOMES].join(", ")}`, 400);
    const now = new Date().toISOString();
    const record = { disposition_id: id("DISP"), patient_case_id: patientCaseId, encounter_id: payload.encounter_id ?? current.openemr_encounter_id ?? null, outcome: payload.outcome, destination_facility: payload.destination_facility ?? null, receiving_provider: payload.receiving_provider ?? null, decision_at: iso(payload.decision_at ?? now, "decision_at"), reason: payload.reason ?? null, notes: payload.notes ?? null, created_at: before?.created_at ?? now, updated_at: now, correlation_id: meta.correlationId };
    this.clinicalDispositions.save(record);
    this.audit("patient_case_disposition", patientCaseId, "set_disposition", meta.correlationId, before, record);
    this.event("PatientCaseDispositionSet", meta.correlationId, { patient_case_id: patientCaseId, incident_id: current.incident_id, outcome: record.outcome });
    appendTimeline(this, { ...record, event_type: "disposition_recorded", source_entity_type: "disposition", source_entity_id: record.disposition_id }, meta);
    if (current.status !== "Closed") this.patientCases.save({ ...this.patientCases.find(patientCaseId), status: "Closed", updated_at: now, correlation_id: meta.correlationId });
    return this.clinicalDispositions.find(patientCaseId);
  },
  listPatientCaseTimeline(patientCaseId) {
    const current = requiredCase.call(this, patientCaseId);
    return this.clinicalTimeline.list(patientCaseId)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || String(a.timeline_event_id).localeCompare(String(b.timeline_event_id)))
      .map(event => ({ ...event, incident_id: current.incident_id }));
  }
};

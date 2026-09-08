import { randomUUID } from 'node:crypto';
import { ApiError } from '@vems/shared';
import { sqlValue } from './db.mjs';
import { PROVISIONAL_DOB_SENTINEL } from './provisional-identity.mjs';

const conflict = message => { throw new ApiError('CONFLICT', message, 409); };
const invalid = message => { throw new ApiError('INVALID_PAYLOAD', message, 400); };
function objectPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid('Payload must be an object');
}

// Optional care-location context (Stage 11 milestone 11c): captured
// client-side via expo-location, never required — a crew that denied the
// permission or has no fix yet must still be able to chart. Validated
// loosely (real-world coordinate/accuracy bounds) rather than required.
function parseLocation(payload) {
  const { location_lat, location_lng, location_accuracy_m } = payload;
  if (location_lat === undefined && location_lng === undefined && location_accuracy_m === undefined) return {};
  if (typeof location_lat !== 'number' || location_lat < -90 || location_lat > 90) invalid('location_lat must be a number between -90 and 90');
  if (typeof location_lng !== 'number' || location_lng < -180 || location_lng > 180) invalid('location_lng must be a number between -180 and 180');
  if (location_accuracy_m !== undefined && (typeof location_accuracy_m !== 'number' || location_accuracy_m < 0)) invalid('location_accuracy_m must be a non-negative number');
  return { location_lat, location_lng, location_accuracy_m: location_accuracy_m ?? null };
}

const active = a => ['Assigned', 'Accepted', 'Mobilised', 'Active'].includes(a.status);

export const patientCaseMethods = {
  async getPatientCase(id) {
    const record = await this.patientCases.find(id);
    if (!record) throw new ApiError('NOT_FOUND', `Patient case ${id} not found`, 404);
    const patient = await this.patientLinks.findByPatientCaseId(id);
    const encounter = await this.encounterLinks.findByPatientCaseId(id);
    const disposition = await this.clinicalDispositions?.find(id);
    const dispositionReady = Boolean(disposition?.outcome);
    return { ...record, openemr_patient_id: patient?.openemr_patient_id ?? null,
      verification_status: patient?.verification_status ?? 'unknown',
      openemr_encounter_id: encounter?.openemr_encounter_id ?? null,
      encounter_status: encounter?.encounter_status ?? null,
      closure_ready: dispositionReady || Boolean(encounter?.closure_ready && encounter.handover_status === 'Handover Completed' && encounter.handover_time && encounter.disposition),
      provisional_identity: (await this.db.queryOne(`SELECT status FROM patient_case_provisional_requests WHERE patient_case_id=${sqlValue(id)};`)) ? { dob_unknown: true, native_dob_placeholder: PROVISIONAL_DOB_SENTINEL } : null,
      identity_reconciliations: await this.db.queryAll(`SELECT * FROM patient_case_identity_reconciliations WHERE patient_case_id=${sqlValue(id)} ORDER BY created_at;`) };
  },
  async listPatientCases(incidentId) {
    await this.getIncident(incidentId);
    const cases = await this.patientCases.list(incidentId);
    return Promise.all(cases.map(c => this.getPatientCase(c.patient_case_id)));
  },
  async resolvePatientCaseAssignment(incidentId, payload) {
    const assignments = (await this.assignments.findByIncidentId(incidentId)).filter(active);
    if (!payload.assignment_id && assignments.length > 1) conflict('Multiple active assignments: assignment_id is required');
    const assignment = payload.assignment_id ? assignments.find(a => a.assignment_id === payload.assignment_id) : assignments[0];
    if (payload.assignment_id && !assignment) conflict('Target assignment must be active and belong to the same incident');
    if (assignment?.crew_ids.length) {
      for (const id of assignment.crew_ids) {
        if (!(await this.personnel.findById(id))) conflict('Every crew member must exist in the personnel master');
      }
    }
    if (payload.lead_clinician_id && !assignment?.crew_ids.includes(payload.lead_clinician_id)) conflict('Lead clinician must belong to the assigned crew');
    return { assignment_id: assignment?.assignment_id ?? null, vehicle_id: assignment?.vehicle_id ?? null,
      crew_ids: assignment?.crew_ids ?? [], lead_clinician_id: payload.lead_clinician_id ?? null };
  },
  async createPatientCase(incidentId, payload, meta) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) invalid('Patient case payload must be an object');
    for (const key of Object.keys(payload)) if (!['assignment_id','lead_clinician_id','temporary_label'].includes(key)) invalid(`Unsupported patient case field: ${key}`);
    if (payload.temporary_label != null && (typeof payload.temporary_label !== 'string' || payload.temporary_label.length > 120)) invalid('temporary_label must be a string of at most 120 characters');
    const fingerprint = JSON.stringify({ incident_id: incidentId, assignment_id: payload.assignment_id ?? null, lead_clinician_id: payload.lead_clinician_id ?? null, temporary_label: payload.temporary_label ?? null });
    return this.db.withTransaction(async () => {
      await this.getIncident(incidentId);
      const replay = meta.idempotencyKey && await this.idempotency.get('patient_case', meta.idempotencyKey);
      if (replay) {
        if (replay.request_fingerprint !== fingerprint) conflict('Idempotency key was reused with a different request');
        return this.getPatientCase(replay.resource_id);
      }
      const context = await this.resolvePatientCaseAssignment(incidentId, payload);
      const now = new Date().toISOString();
      const existingCases = await this.patientCases.list(incidentId);
      const record = { patient_case_id: await this.patientCases.nextId(), incident_id: incidentId,
        patient_sequence: (existingCases.at(-1)?.patient_sequence ?? 0) + 1,
        status: payload.temporary_label ? 'Patient Identification Pending' : 'Created', ...context,
        temporary_label: payload.temporary_label ?? null, created_at: now, updated_at: now, correlation_id: meta.correlationId };
      await this.patientCases.save(record);
      await this.audit('patient_case', record.patient_case_id, 'create_patient_case', meta.correlationId, undefined, record);
      await this.event('PatientCaseCreated', meta.correlationId, { patient_case_id: record.patient_case_id, incident_id: incidentId, patient_sequence: record.patient_sequence });
      if (meta.idempotencyKey) await this.idempotency.save('patient_case', meta.idempotencyKey, record.patient_case_id, now, fingerprint);
      return this.getPatientCase(record.patient_case_id);
    });
  },
  async resolveLegacyPatientCase(incidentId, create, meta) {
    await this.getIncident(incidentId);
    const cases = await this.patientCases.list(incidentId);
    if (cases.length > 1) conflict('Multiple patient cases: patient_case_id is required; use /api/patient-cases/{patientCaseId}');
    if (cases.length) return cases[0].patient_case_id;
    if (create) return (await this.createPatientCase(incidentId, {}, meta)).patient_case_id;
    throw new ApiError('NOT_FOUND', `Patient case for incident ${incidentId} not found`, 404);
  },
  async changePatientCaseAssignment(id, payload, meta) {
    objectPayload(payload);
    if (!payload.assignment_id) invalid('assignment_id is required');
    return this.db.withTransaction(async () => {
      const before = await this.patientCases.find(id); await this.getPatientCase(id);
      const context = await this.resolvePatientCaseAssignment(before.incident_id, payload);
      if (payload.lead_clinician_id === undefined && context.crew_ids.includes(before.lead_clinician_id)) context.lead_clinician_id = before.lead_clinician_id;
      const after = { ...before, ...context, updated_at: new Date().toISOString(), correlation_id: meta.correlationId };
      await this.patientCases.save(after);
      await this.audit('patient_case', id, 'change_assignment', meta.correlationId, before, after);
      await this.event('PatientCaseAssignmentChanged', meta.correlationId, { patient_case_id: id, incident_id: before.incident_id, assignment_id: after.assignment_id });
      return this.getPatientCase(id);
    });
  },
  async setPatientCaseStatus(id, status, meta) {
    const before = await this.patientCases.find(id); await this.getPatientCase(id);
    const transitions = {
      'Created': ['Patient Identification Pending','Patient Linked'],
      'Patient Identification Pending': ['Patient Linked'],
      'Patient Linked': ['Encounter Open'],
      'Encounter Open': ['Care In Progress','Ready for Handover','Handover Completed'],
      'Care In Progress': ['Ready for Handover','Handover Completed'],
      'Ready for Handover': ['Handover Completed'],
      'Handover Completed': ['Closed'], 'Closed': []
    };
    if (status === before.status) return this.getPatientCase(id);
    if (!transitions[before.status]?.includes(status)) conflict(`Invalid patient case transition from ${before.status} to ${status}`);
    if (['Handover Completed','Closed'].includes(status) && !(await this.getPatientCase(id)).closure_ready) conflict('Persisted handover and disposition are required');
    await this.patientCases.save({ ...before, status, updated_at: new Date().toISOString(), correlation_id: meta.correlationId });
    await this.audit('patient_case', id, 'change_status', meta.correlationId, before, await this.patientCases.find(id));
    await this.event('PatientCaseStatusChanged', meta.correlationId, { patient_case_id: id, incident_id: before.incident_id, status });
    return this.getPatientCase(id);
  },
  async linkPatientToPatientCase(id, payload, meta) {
    objectPayload(payload);
    const c = await this.getPatientCase(id);
    const provisionalRequest = await this.db.queryOne(`SELECT status FROM patient_case_provisional_requests WHERE patient_case_id=${sqlValue(id)};`);
    if (provisionalRequest?.status === 'pending' && !meta.provisionalResult) conflict('Provisional patient creation is pending; reconciliation required');
    if (!['unknown','provisional','matched_existing','created_new','verified','duplicate_suspected'].includes(payload.verification_status)) invalid('Invalid verification_status');
    if (payload.verification_status === 'verified' && !payload.openemr_patient_id) invalid('OpenEMR patient ID is required');
    return this.db.withTransaction(async () => {
      const before = await this.patientLinks.findByPatientCaseId(id);
      const encounterLink = await this.encounterLinks.findByPatientCaseId(id);
      const encounterRequest = encounterLink || await this.db.queryOne(`SELECT patient_case_id FROM patient_case_encounter_requests WHERE patient_case_id=${sqlValue(id)};`);
      if (encounterRequest && before?.openemr_patient_id !== (payload.openemr_patient_id ?? null)) conflict('Clinical encounter already exists: use identity reconciliation');
      const now = new Date().toISOString();
      const record = { patient_case_id: id, incident_id: c.incident_id, openemr_patient_id: payload.openemr_patient_id ?? null,
        temporary_label: payload.temporary_label ?? c.temporary_label, verification_status: payload.verification_status,
        created_at: before?.created_at ?? now, updated_at: now, correlation_id: meta.correlationId };
      await this.patientLinks.save(record);
      await this.audit('patient_case', id, 'link_patient', meta.correlationId, before, record);
      await this.event('PatientCasePatientLinked', meta.correlationId, { patient_case_id: id, incident_id: c.incident_id, verification_status: record.verification_status });
      if (record.openemr_patient_id && ['Created','Patient Identification Pending'].includes(c.status)) await this.setPatientCaseStatus(id, 'Patient Linked', meta);
      return record;
    });
  },
  async reconcilePatientCaseIdentity(id, payload, meta) {
    objectPayload(payload);
    const c = await this.getPatientCase(id);
    if (!c.openemr_patient_id || !payload.verified_patient_id || typeof payload.reason !== 'string' || !payload.reason.trim()) invalid('Clinical patient, verified_patient_id and reason are required');
    if (payload.verified_patient_id === c.openemr_patient_id) return this.linkPatientToPatientCase(id, { openemr_patient_id: c.openemr_patient_id, verification_status: 'verified' }, meta);
    return this.db.withTransaction(async () => {
      const existing = c.identity_reconciliations.find(r => r.verified_patient_id === payload.verified_patient_id);
      if (existing) return c;
      const record = { reconciliation_id: randomUUID(), patient_case_id: id, clinical_patient_id: c.openemr_patient_id,
        verified_patient_id: payload.verified_patient_id, reason: payload.reason, created_at: new Date().toISOString(), correlation_id: meta.correlationId };
      await this.db.execute(`INSERT INTO patient_case_identity_reconciliations(${Object.keys(record).join(',')}) VALUES (${Object.values(record).map(sqlValue).join(',')});`);
      await this.audit('patient_case', id, 'reconcile_identity', meta.correlationId, { patient_case_id: id, incident_id: c.incident_id, clinical_patient_id: c.openemr_patient_id }, { ...record, incident_id: c.incident_id });
      await this.event('PatientIdentityReconciled', meta.correlationId, { patient_case_id: id, incident_id: c.incident_id, administrative_merge_required: true });
      return this.getPatientCase(id);
    });
  },
  async createProvisionalPatientForCase(id, meta) {
    const c = await this.getPatientCase(id);
    if (c.openemr_patient_id) {
      if (c.verification_status !== 'provisional') conflict('Patient case already has an identified patient');
      return c;
    }
    await this.db.withTransaction(async () => {
      if (await this.db.queryOne(`SELECT patient_case_id FROM patient_case_provisional_requests WHERE patient_case_id=${sqlValue(id)};`)) conflict('Provisional patient creation is pending or outcome unknown; reconciliation required');
      await this.db.execute(`INSERT INTO patient_case_provisional_requests VALUES (${sqlValue(id)},'pending',${sqlValue(new Date().toISOString())});`);
    });
    // Native validation requires DOB. This explicitly marked technical date is
    // never treated as a known birth date by the Patient Case aggregate.
    const patient = await this.openemr.createPatient({ first_name: 'Unidentified', last_name: id,
      dob: PROVISIONAL_DOB_SENTINEL, sex: 'Unknown', provisional_identity: true });
    if (!patient.patient_id) conflict('OpenEMR returned no patient ID; reconciliation required');
    await this.linkPatientToPatientCase(id, { verification_status: 'provisional', openemr_patient_id: patient.patient_id }, { ...meta, provisionalResult: true });
    await this.db.execute(`UPDATE patient_case_provisional_requests SET status='completed' WHERE patient_case_id=${sqlValue(id)};`);
    return this.getPatientCase(id);
  },
  async getPatientCasePatientLink(id) {
    await this.getPatientCase(id);
    const link = await this.patientLinks.findByPatientCaseId(id);
    if (!link) throw new ApiError('NOT_FOUND', 'Patient link not found', 404);
    return link;
  },
  async getPatientCaseEncounter(id) {
    await this.getPatientCase(id);
    const link = await this.encounterLinks.findByPatientCaseId(id);
    if (!link) throw new ApiError('NOT_FOUND', 'Encounter not found', 404);
    return { ...link, encounter_id: link.openemr_encounter_id, status: link.encounter_status, linked_incident_id: link.incident_id };
  },
  async createEncounterForPatientCase(id, payload, meta) {
    objectPayload(payload);
    const c = await this.getPatientCase(id);
    if (!c.openemr_patient_id) conflict('Cannot create encounter without linked patient; create a provisional OpenEMR patient first');
    if (!['verified','provisional'].includes(c.verification_status)) throw new ApiError('INVALID_STATUS_TRANSITION', `Cannot create encounter when patient link is ${c.verification_status}`, 409);
    if (c.status === 'Closed') conflict('Patient case is closed');
    if (payload.patient_id && payload.patient_id !== c.openemr_patient_id) invalid('patient_id must match linked patient case patient');
    if (!payload.care_started_at || !Number.isFinite(Date.parse(payload.care_started_at)) || typeof payload.presenting_complaint !== 'string' || !payload.presenting_complaint.trim()) invalid('care_started_at and presenting_complaint are required');
    const location = parseLocation(payload);
    const scope = `patient_case_encounter:${id}`;
    const fingerprint = JSON.stringify({ care_started_at: payload.care_started_at, presenting_complaint: payload.presenting_complaint });
    const existing = await this.encounterLinks.findByPatientCaseId(id);
    const replay = meta.idempotencyKey && await this.idempotency.get(scope, meta.idempotencyKey);
    if (replay && replay.request_fingerprint !== fingerprint) conflict('Idempotency key was reused with a different request');
    if (existing) return this.getPatientCaseEncounter(id);
    // Durable reservation prevents duplicate remote writes across workers/restarts.
    // Unknown outcomes require administrative reconciliation, never blind replay.
    await this.db.withTransaction(async () => {
      if (await this.db.queryOne(`SELECT * FROM patient_case_encounter_requests WHERE patient_case_id=${sqlValue(id)};`)) conflict('Encounter creation is pending or outcome unknown; reconciliation required');
      await this.db.execute(`INSERT INTO patient_case_encounter_requests VALUES (${sqlValue(id)},${sqlValue(fingerprint)},'pending',${sqlValue(new Date().toISOString())});`);
    });
    const created = await this.openemr.createEncounter({ incident_id: c.incident_id, patient_case_id: id,
      patient_id: c.openemr_patient_id, assignment_id: c.assignment_id, vehicle_id: c.vehicle_id,
      crew_ids: meta.legacy && !c.assignment_id ? (payload.crew_ids ?? []) : c.crew_ids, care_started_at: payload.care_started_at, presenting_complaint: payload.presenting_complaint });
    if (!created.encounter_id) conflict('OpenEMR returned no encounter ID; reconciliation required');
    return this.db.withTransaction(async () => {
      const now = new Date().toISOString();
      const record = { patient_case_id: id, incident_id: c.incident_id, openemr_patient_id: c.openemr_patient_id,
        openemr_encounter_id: created.encounter_id, encounter_status: created.status, care_started_at: payload.care_started_at,
        ...location, created_at: now, updated_at: now, correlation_id: meta.correlationId };
      await this.encounterLinks.save(record);
      await this.setPatientCaseStatus(id, 'Encounter Open', meta);
      await this.audit('patient_case', id, 'create_encounter', meta.correlationId, undefined, record);
      await this.event('PatientCaseEncounterCreated', meta.correlationId, { patient_case_id: id, incident_id: c.incident_id, encounter_id: created.encounter_id });
      await this.db.execute(`UPDATE patient_case_encounter_requests SET status='completed' WHERE patient_case_id=${sqlValue(id)};`);
      if (meta.idempotencyKey) await this.idempotency.save(scope, meta.idempotencyKey, created.encounter_id, now, fingerprint);
      return this.getPatientCaseEncounter(id);
    });
  }
};

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OrchestrationService } from '../src/index.mjs';
import { SqliteClient } from '../src/db.mjs';

const meta = { correlationId: 'case-test' };
const payload = { call: { call_source: 'phone', received_at: '2026-09-06T10:00:00Z' }, incident: { category: 'medical_emergency', priority: 'critical', description: 'Synthetic exercise', address: 'Test scene', patient_count: 4 } };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'vems-case-test-'));
  const calls = [];
  const service = new OrchestrationService({ dbPath: join(dir, 'db.sqlite'), openemr: {
    createPatient: async () => ({ patient_id: `patient-${calls.push('patient')}` }),
    createEncounter: async p => { calls.push(p); return { encounter_id: `encounter-${calls.length}`, status: 'Open' }; },
    createObservation: async p => { calls.push(p); return { observation_id: 'obs', encounter_id: p.encounter_id, status: 'created' }; },
    createHandover: async p => ({ ...p, handover_id: 'handover' })
  } });
  t.after(() => { service.db.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const incident = service.createIncident(payload, meta);
  return { service, incident, calls };
}

test('four independent patients and encounters preserve one operational incident and identity timeline', async t => {
  const { service: s, incident: i, calls } = fixture(t);
  const cases = [];
  for (let n = 0; n < 4; n++) {
    const c = s.createPatientCase(i.incident_id, n === 2 ? { temporary_label: 'Unknown patient' } : {}, { ...meta, idempotencyKey: `case-${n}` });
    assert.equal(c.patient_case_id, `PCR-00000${n + 1}`); assert.equal(c.patient_sequence, n + 1);
    assert.equal(s.createPatientCase(i.incident_id, n === 2 ? { temporary_label: 'Unknown patient' } : {}, { ...meta, idempotencyKey: `case-${n}` }).patient_case_id, c.patient_case_id);
    const patient = n === 0 ? { patient_id: 'existing-patient' } : n === 2 ? { patient_id: (await s.createProvisionalPatientForCase(c.patient_case_id, meta)).openemr_patient_id } : await s.createPatient({ first_name: 'Synthetic', last_name: `Case ${n}` }, { ...meta, idempotencyKey: `patient-${n}` });
    s.linkPatientToPatientCase(c.patient_case_id, { openemr_patient_id: patient.patient_id, verification_status: n === 2 ? 'provisional' : 'verified' }, meta);
    const request = { care_started_at: '2026-09-06T10:01:00Z', presenting_complaint: 'Exercise' };
    const enc = await s.createEncounterForPatientCase(c.patient_case_id, request, { ...meta, idempotencyKey: 'same-key-is-case-scoped' });
    assert.equal((await s.createEncounterForPatientCase(c.patient_case_id, request, { ...meta, idempotencyKey: 'same-key-is-case-scoped' })).encounter_id, enc.encounter_id);
    cases.push({ ...c, patient, enc });
  }
  assert.equal(new Set(cases.map(c => c.enc.encounter_id)).size, 4);
  assert.equal(new Set(s.listPatientCases(i.incident_id).map(c => c.openemr_patient_id)).size, 4);
  assert.equal(calls.filter(c => c.patient_case_id).length, 4);
  assert.equal(s.incidents.listAll().length, 1);
  assert.equal(s.listSyncIntents().filter(x => x.operation === 'createIncidentMirror').length, 1);
  assert.throws(() => s.getPatientLink(i.incident_id), /patient_case_id is required/);
  await assert.rejects(() => s.createEncounterForIncident(i.incident_id, {}, meta), /patient_case_id is required/);
  const unknown = cases[2];
  await s.createObservationForEncounter(unknown.enc.encounter_id, { vital_signs: { heart_rate_bpm: 80 } }, meta);
  assert.throws(() => s.linkPatientToPatientCase(unknown.patient_case_id, { openemr_patient_id: 'identified', verification_status: 'verified' }, meta), /reconciliation/);
  const reconciled = s.reconcilePatientCaseIdentity(unknown.patient_case_id, { verified_patient_id: 'identified', reason: 'Identity confirmed' }, meta);
  assert.equal(reconciled.openemr_patient_id, unknown.patient.patient_id);
  assert.equal(reconciled.openemr_encounter_id, unknown.enc.encounter_id);
  assert.equal(reconciled.identity_reconciliations[0].verified_patient_id, 'identified');
  assert.equal(s.db.queryAll('PRAGMA foreign_key_check').length, 0);
  for (const c of cases) await s.createHandoverForEncounter(c.enc.encounter_id, { handover_time: '2026-09-06T11:00:00Z', handover_status: 'Handover Completed', disposition: 'transport_to_facility' }, meta);
  assert.equal(s.getIncident(i.incident_id).closure_ready, true);
  s.assertClosureAllowed(i.incident_id);
});

for (const [count, complete, ready] of [[1,1,true],[2,2,true],[2,1,false],[4,4,true]]) test(`closure considers all cases: ${complete}/${count}`, async t => {
  const { service: s, incident: i } = fixture(t);
  for (let n = 0; n < count; n++) {
    const c = s.createPatientCase(i.incident_id, {}, meta);
    s.linkPatientToPatientCase(c.patient_case_id, { verification_status: 'verified', openemr_patient_id: `p-${n}` }, meta);
    const e = await s.createEncounterForPatientCase(c.patient_case_id, { care_started_at: '2026-09-06T10:00:00Z', presenting_complaint: 'Exercise' }, meta);
    if (n < complete) await s.createHandoverForEncounter(e.encounter_id, { handover_status: 'Handover Completed', handover_time: '2026-09-06T11:00:00Z', disposition: 'transport_to_facility' }, meta);
  }
  assert.equal(s.getIncident(i.incident_id).closure_ready, ready);
  if (ready) s.assertClosureAllowed(i.incident_id); else assert.throws(() => s.assertClosureAllowed(i.incident_id), /closure metadata/);
});

test('assignment context, ambiguity, lead validation and responsibility transfer', t => {
  const { service: s, incident: i } = fixture(t);
  const staff = [1,2].map(n => s.createPersonnel({ staff_id: `STAFF-00${n}`, display_name: `Crew ${n}`, role: 'Paramedic', operational_status: 'Available', home_station: 'Test' }, meta));
  const a = s.createAssignment(i.incident_id, { vehicle_id: 'AMB-001', crew_ids: [staff[0].staff_id], reason: 'dispatch' }, meta);
  s.updateAssignment(a.assignment_id, { action: 'confirm_assignment' }, meta);
  const c = s.createPatientCase(i.incident_id, { lead_clinician_id: staff[0].staff_id }, meta);
  assert.equal(c.assignment_id, a.assignment_id); assert.equal(c.vehicle_id, a.vehicle_id); assert.deepEqual(c.crew_ids, a.crew_ids);
  assert.throws(() => s.createPatientCase(i.incident_id, { lead_clinician_id: staff[1].staff_id }, meta), /Lead clinician/);
  const b = s.createAssignment(i.incident_id, { vehicle_id: 'AMB-002', crew_ids: [staff[1].staff_id], reason: 'dispatch' }, meta);
  s.updateAssignment(b.assignment_id, { action: 'confirm_assignment' }, meta);
  assert.throws(() => s.createPatientCase(i.incident_id, {}, meta), /Multiple active assignments/);
  const moved = s.changePatientCaseAssignment(c.patient_case_id, { assignment_id: b.assignment_id }, meta);
  assert.equal(moved.vehicle_id, b.vehicle_id); assert.deepEqual(moved.crew_ids, b.crew_ids); assert.equal(moved.lead_clinician_id, null);
  assert.throws(() => s.assertClosureAllowed(i.incident_id), /active assignments/);
  assert.throws(() => s.setPatientCaseStatus(c.patient_case_id, 'Closed', meta), /Invalid patient case transition/);
});

test('unknown encounter outcome is durable and never blindly replayed', async t => {
  const { service: s, incident: i } = fixture(t);
  const c = s.createPatientCase(i.incident_id, { temporary_label: 'Unknown' }, meta);
  s.linkPatientToPatientCase(c.patient_case_id, { verification_status: 'provisional', openemr_patient_id: 'native-provisional' }, meta);
  let writes = 0; s.openemr.createEncounter = async () => { writes++; throw new Error('response lost'); };
  const p = { care_started_at: '2026-09-06T10:00:00Z', presenting_complaint: 'Exercise' };
  await assert.rejects(() => s.createEncounterForPatientCase(c.patient_case_id, p, meta), /response lost/);
  await assert.rejects(() => s.createEncounterForPatientCase(c.patient_case_id, p, meta), /reconciliation required/);
  assert.equal(writes, 1);
});

test('Stage 5 migration retains every legacy link field and fresh schema has no orphan links', t => {
  const dir = mkdtempSync(join(tmpdir(), 'vems-case-migration-')); const path = join(dir, 'legacy.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const migrations = new URL('../src/migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(f => f.endsWith('.sql') && f < '008').sort()) {
    db.exec(readFileSync(new URL(file, migrations), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(file.replace('.sql',''), 'before');
  }
  db.exec(`INSERT INTO incidents VALUES ('INC-000001','CALL-000001','Active','medical','critical','exercise','test',1,'created','updated','correlation');
    INSERT INTO patient_links VALUES ('INC-000001','patient','unknown','provisional','p-created','p-updated','p-correlation');
    INSERT INTO encounter_links VALUES ('INC-000001','patient','encounter','Handover Completed','care-start','handover','Handover Completed','transport','destination','clinician','notes',1,'e-created','e-updated','e-correlation');`);
  db.exec(`INSERT INTO incidents VALUES ('INC-000002','CALL-000002','Active','medical','critical','exercise','test',1,'created','updated','correlation');
    INSERT INTO encounter_links SELECT 'INC-000002',openemr_patient_id,'encounter-only',encounter_status,care_started_at,handover_time,handover_status,disposition,destination_facility,receiving_clinician,handover_notes,closure_ready,created_at,updated_at,correlation_id FROM encounter_links WHERE incident_id='INC-000001';`);
  const patient = db.prepare('SELECT * FROM patient_links').get(); const encounter = db.prepare('SELECT * FROM encounter_links').get(); db.close();
  const upgraded = new SqliteClient(path);
  const { patient_case_id: pId, ...p } = upgraded.queryOne('SELECT * FROM patient_case_patient_links');
  const { patient_case_id: eId, ...e } = upgraded.queryOne('SELECT * FROM patient_case_encounter_links');
  assert.deepEqual(p, { ...patient }); assert.deepEqual(e, { ...encounter }); assert.equal(pId,eId);
  assert.equal(upgraded.queryOne("SELECT openemr_patient_id FROM patient_case_patient_links WHERE incident_id='INC-000002'").openemr_patient_id, 'patient');
  assert.equal(upgraded.queryAll('PRAGMA foreign_key_check').length,0); upgraded.db.close();
});

test('patient case IDs never reuse deleted IDs and idempotency rejects changed incident/payload', t => {
  const { service: s, incident: i } = fixture(t);
  const first = s.createPatientCase(i.incident_id, {}, { ...meta, idempotencyKey: 'stable' });
  assert.throws(() => s.createPatientCase(i.incident_id, { temporary_label: 'different' }, { ...meta, idempotencyKey: 'stable' }), /different request/);
  const second = s.createPatientCase(i.incident_id, {}, meta);
  s.db.execute(`DELETE FROM patient_cases WHERE patient_case_id='${second.patient_case_id}'`);
  const third = s.createPatientCase(i.incident_id, {}, meta);
  assert.equal(first.patient_case_id, 'PCR-000001'); assert.equal(third.patient_case_id, 'PCR-000003');
  assert.throws(() => s.db.execute(`UPDATE patient_cases SET patient_sequence=1 WHERE patient_case_id='${third.patient_case_id}'`), /UNIQUE/);
  assert.throws(() => s.createPatientCase('INC-999999', {}, meta), /not found/);
});

test('legacy wrappers resolve a single case and relinking before encounter preserves audit history', async t => {
  const { service: s, incident: i } = fixture(t);
  const first = s.linkPatientToIncidentContext(i.incident_id, { verification_status: 'provisional', temporary_label: 'Unknown' }, meta);
  assert.equal(first.patient_case_id, 'PCR-000001');
  s.linkPatientToIncidentContext(i.incident_id, { verification_status: 'verified', openemr_patient_id: 'known' }, meta);
  assert.equal(s.getPatientLink(i.incident_id).openemr_patient_id, 'known');
  const history = s.db.queryAll("SELECT * FROM audit_logs WHERE action='link_patient'");
  assert.equal(history.length, 2); assert.equal(JSON.parse(history[1].before_json).verification_status, 'provisional');
  const e = await s.createEncounterForIncident(i.incident_id, { patient_id: 'known', care_started_at: '2026-09-06T10:00:00Z', presenting_complaint: 'Exercise', crew_ids: [] }, meta);
  assert.equal(s.getEncounterByIncident(i.incident_id).encounter_id, e.encounter_id);
});

test('concurrent encounter creation writes once and patient relinking is blocked during remote write', async t => {
  const { service: s, incident: i } = fixture(t);
  const c = s.createPatientCase(i.incident_id, {}, meta);
  s.linkPatientToPatientCase(c.patient_case_id, { verification_status: 'verified', openemr_patient_id: 'patient' }, meta);
  let release; let writes = 0;
  s.openemr.createEncounter = async () => { writes++; await new Promise(resolve => { release = resolve; }); return { encounter_id: 'one-encounter', status: 'Open' }; };
  const request = { care_started_at: '2026-09-06T10:00:00Z', presenting_complaint: 'Exercise' };
  const pending = s.createEncounterForPatientCase(c.patient_case_id, request, meta);
  await assert.rejects(() => s.createEncounterForPatientCase(c.patient_case_id, request, meta), /reconciliation required/);
  assert.throws(() => s.linkPatientToPatientCase(c.patient_case_id, { verification_status: 'verified', openemr_patient_id: 'other' }, meta), /reconciliation/);
  release(); await pending; assert.equal(writes, 1);
});

test('responsibility transfer preserves native links and stock authorship follows each current vehicle', async t => {
  const { service: s, incident: i } = fixture(t);
  const assignments = [];
  for (let n = 1; n <= 2; n++) {
    const staff = s.createPersonnel({ staff_id: `STAFF-00${n}`, display_name: 'Crew', role: 'Paramedic', operational_status: 'Available', home_station: 'Test' }, meta);
    s.createVehicle({ vehicle_id: `AMB-00${n}`, callsign: `Crew ${n}`, vehicle_type: 'Ambulance', operational_status: 'Available', service_status: 'Serviceable', home_station: 'Test' }, meta);
    const a = s.createAssignment(i.incident_id, { vehicle_id: `AMB-00${n}`, crew_ids: [staff.staff_id], reason: 'dispatch' }, meta);
    s.updateAssignment(a.assignment_id, { action: 'confirm_assignment' }, meta); assignments.push(a);
  }
  const c = s.createPatientCase(i.incident_id, { assignment_id: assignments[0].assignment_id }, meta);
  s.linkPatientToPatientCase(c.patient_case_id, { verification_status: 'verified', openemr_patient_id: 'patient' }, meta);
  const e = await s.createEncounterForPatientCase(c.patient_case_id, { care_started_at: '2026-09-06T10:00:00Z', presenting_complaint: 'Exercise' }, meta);
  s.createStockItem({ stock_item_id: 'ITEM-001', name: 'Test dressing', category: 'Consumable', unit_of_measure: 'each', item_type: 'Consumable' }, meta);
  for (const a of assignments) s.adjustVehicleStock(a.vehicle_id, 'ITEM-001', { type: 'restock', quantity_delta: '10', reason: 'Test' }, meta);
  let count = 0; s.openemr.createIntervention = async () => ({ intervention_id: `treatment-${++count}`, status: 'created' });
  const treatment = { stock_item_id: 'ITEM-001', quantity_used: '1', performed_at: '2026-09-06T10:05:00Z', type: 'procedure', name: 'Dressing' };
  await s.createInterventionForEncounter(e.encounter_id, treatment, { ...meta, idempotencyKey: 'first' });
  s.changePatientCaseAssignment(c.patient_case_id, { assignment_id: assignments[1].assignment_id }, meta);
  await s.createInterventionForEncounter(e.encounter_id, treatment, { ...meta, idempotencyKey: 'second' });
  const usage = s.db.queryAll('SELECT * FROM stock_usage ORDER BY intervention_id');
  assert.deepEqual(usage.map(u => u.vehicle_id), ['AMB-001','AMB-002']);
  assert.ok(usage.every(u => u.patient_case_id === c.patient_case_id));
  assert.equal(s.getPatientCase(c.patient_case_id).openemr_encounter_id, e.encounter_id);
  assert.equal(s.getPatientCase(c.patient_case_id).openemr_patient_id, 'patient');
});

test('fresh reference schema executes with case linkage foreign keys', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='patient_cases'").get().n, 1);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally { db.close(); }
});

test('unidentified native creation requires no invented user demographics and replays once', async t => {
  const { service: s, incident: i } = fixture(t);
  const c = s.createPatientCase(i.incident_id, { temporary_label: 'Unknown' }, meta);
  const calls = []; s.openemr.createPatient = async p => { calls.push(p); return { patient_id: 'native-unknown' }; };
  const linked = await s.createProvisionalPatientForCase(c.patient_case_id, meta);
  assert.equal(linked.verification_status, 'provisional'); assert.equal(linked.provisional_identity.dob_unknown, true);
  assert.equal((await s.createProvisionalPatientForCase(c.patient_case_id, meta)).openemr_patient_id, 'native-unknown');
  assert.equal(calls.length, 1); assert.equal(calls[0].provisional_identity, true);
  assert.equal(calls[0].last_name, c.patient_case_id);
});

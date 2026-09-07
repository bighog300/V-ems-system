import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPatientCasesPanel, renderEpcrFinalizationPanel } from '../src/crew.mjs';
import { loadPatientCaseData, patientCaseWrite } from '../src/api.mjs';

test('patient case panel displays independent context and escapes temporary labels', () => {
  const html = renderPatientCasesPanel([{ patient_case_id: 'PCR-000001', patient_sequence: 1, temporary_label: '<script>', verification_status: 'provisional', assignment_id: 'ASN-000001', vehicle_id: 'AMB-001', lead_clinician_id: 'STAFF-001', closure_ready: false }], 'PCR-000001');
  for (const text of ['Patient Cases','PCR-000001','ASN-000001','AMB-001','STAFF-001','provisional','false','&lt;script&gt;']) assert.ok(html.includes(text));
  assert.ok(!html.includes('<script>'));
});

test('switching case reads only selected patient clinical chain and writes to case scope', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    let data = {};
    if (url.endsWith('/encounter')) data = { encounter_id: 'selected-encounter' };
    if (url.endsWith('/patient-link')) data = { openemr_patient_id: 'selected-patient' };
    if (url.endsWith('/interventions')) data = [];
    return { status: 200, ok: true, json: async () => data };
  };
  const data = await loadPatientCaseData({ apiBaseUrl: 'http://test', patientCaseId: 'PCR-000002', fetchImpl });
  assert.equal(data.patientLink.openemr_patient_id, 'selected-patient');
  assert.ok(urls.every(url => !url.includes('/incidents/')));
  assert.ok(urls.filter(url => url.includes('/encounters/')).every(url => url.includes('selected-encounter')));
  await patientCaseWrite({ apiBaseUrl: 'http://test', patientCaseId: 'PCR-000002', action: 'encounters', payload: {}, fetchImpl });
  assert.equal(urls.at(-1), 'http://test/api/patient-cases/PCR-000002/encounters');
});

test('Stage 8 ePCR panel exposes readiness, lifecycle, hash, review, QA and amendment controls', () => {
  const html = renderEpcrFinalizationPanel({
    readiness: { ready: false, missing: [{ message: 'Assessment required' }], warnings: [] },
    lifecycle: { current_state: 'submitted' },
    final_version: { version_id: 'EPV-1', hash_algorithm: 'sha256', hash: 'abc123' }
  }, 'PCR-000002');
  for (const marker of ['Assessment required', 'submitted', 'sha256:abc123', 'epcrSignatureForm', 'epcrReviewForm', 'epcrFlagForm', 'epcrAmendmentForm']) assert.ok(html.includes(marker));
});

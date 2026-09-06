# Stage 7 Clinical Model Impact Audit

## Baseline

Stage 7 begins from `143848d9a9877e9927ee1958f22b0005e3ba8d27` (`Implement multi-patient ePCR patient cases`). The Stage 6 `Patient Case` architecture remains authoritative and must not be redesigned unless a concrete blocker is found.

## Architecture boundaries to preserve

- Vtiger remains the operational system of record for incidents, dispatch, assignments, vehicles, personnel, equipment and operational stock.
- OpenEMR remains the clinical system of record for patient identity, native encounters and downstream clinical documentation.
- V-EMS owns orchestration, Patient Case lifecycle, cross-system linkage, idempotency, audit/events, stock coordination and the normalized ePCR API/domain.
- Vtiger and OpenEMR must never call each other directly.
- Future mobile clients call V-EMS only.

## Current Stage 6 clinical flow

### Patient Case

`patient_cases` provides the first-class patient-within-incident identity (`PCR-*`) with assignment, vehicle, crew and lead-clinician context. Patient and encounter links are stored per Patient Case.

### Patient identity

Patient search/create is proxied through V-EMS to OpenEMR. Current native OpenEMR patient creation maps only:

- first name
- last name
- DOB
- sex
- phone
- provisional identity marker

Stage 7 needs a normalized demographics profile owned by the Patient Case workflow so identity metadata that is not safely/native-mappable to OpenEMR is not lost.

### Encounter

Each Patient Case can own one native OpenEMR encounter. Current encounter linkage already tracks care start, handover/disposition fields and closure readiness.

### Observations

`POST /api/encounters/{encounterId}/observations` currently passes `vital_signs` to OpenEMR's native encounter vital endpoint. V-EMS records audit/event metadata but does not persist its own immutable observation series.

Gap: Stage 7 requires serial observations to remain a first-class chronological V-EMS clinical timeline even if downstream representations change or fail.

### Interventions

Generic interventions are currently forwarded to OpenEMR as SOAP notes. V-EMS records audit/events and can link an intervention to stock usage with exactly-once decrement/idempotency behavior.

Gap: Stage 7 requires separate medication-administration and procedure records, while preserving stock linkage and a common clinical timeline.

### Handover / disposition

Handover is stored in the Patient Case encounter link and mirrored to OpenEMR as a SOAP note. Existing closure readiness is tied to `Handover Completed`.

Gap: non-transport/refusal/no-patient/death/cancelled outcomes need first-class disposition rules that can complete a Patient Case without requiring hospital handover.

### Web control

The existing web-control app already exercises Patient Case selection, patient search/create/link, encounter creation, observations, interventions and handover. It should remain the browser acceptance client while Stage 7 APIs mature rather than being replaced.

## Stage 7 persistence design

Add migration `009_epcr_clinical_record.sql` and keep `schema.sql` aligned for fresh databases.

Recommended first-class V-EMS tables:

1. `patient_case_demographics`
   - normalized patient/identity profile
   - estimated age / DOB unknown
   - address/contact
   - identity source/confidence
   - next-of-kin / guardian context
   - unidentified state

2. `patient_case_assessments`
   - versioned/immutable section records for chief complaint, HPI, SAMPLE, ABCDE, secondary survey, clinical impression and optional specialist extensions
   - section type + payload JSON + authored/performed timestamp + clinician + audit correlation

3. `clinical_observations`
   - immutable serial time-series observations
   - Patient Case + encounter + performed_at + normalized vital payload + OpenEMR reference/status

4. `medication_administrations`
   - drug, formulation, dose, unit, route, indication, performed_at, clinician, response/adverse event, protocol metadata
   - optional stock item, vehicle and quantity linkage
   - idempotency-safe

5. `clinical_procedures`
   - procedure type/name, performed_at, clinician, attempts, success, complications and response
   - optional stock linkage
   - idempotency-safe

6. `patient_case_dispositions`
   - first-class patient outcome independent of hospital handover
   - transported, treated-not-transported, refusal variants, no patient found, left scene, transfer, cancelled before contact, death on scene, resuscitation terminated

7. `patient_case_timeline_events`
   - immutable common timeline for clinical and selected operational milestones
   - references source entity/event rather than duplicating source-of-record operational data

## API direction

Keep encounter-scoped legacy endpoints compatible while adding Patient Case-native clinical endpoints. New writes should resolve Patient Case explicitly and then map downstream to OpenEMR where a supported native representation exists.

Proposed Stage 7 endpoint families:

- `GET/PUT /api/patient-cases/{patientCaseId}/demographics`
- `POST/GET /api/patient-cases/{patientCaseId}/assessments`
- `POST/GET /api/patient-cases/{patientCaseId}/observations`
- `POST/GET /api/patient-cases/{patientCaseId}/medications`
- `POST/GET /api/patient-cases/{patientCaseId}/procedures`
- `POST/GET /api/patient-cases/{patientCaseId}/disposition`
- `GET /api/patient-cases/{patientCaseId}/timeline`

Existing encounter endpoints remain compatibility adapters and must never silently select among multiple Patient Cases.

## OpenEMR mapping policy

Do not invent unsupported OpenEMR endpoints.

- patient demographics: map fields supported by native patient resources; retain EMS-only identity metadata in V-EMS
- serial vitals: native OpenEMR vital resources where supported, with V-EMS retaining the normalized immutable event
- medication/procedure/assessment: use supported native forms/resources only after acceptance verification; until then preserve the normalized V-EMS record and use an approved clinical-note representation only where clinically appropriate
- handover/disposition: continue supported OpenEMR clinical documentation mapping while retaining the authoritative V-EMS outcome model

Every downstream write must expose synchronization/reference state so V-EMS does not claim OpenEMR persistence that did not occur.

## Implementation slices

### 7A — Clinical persistence foundation

- migration 009
- repositories for demographics, assessment records, observations, medications, procedures, dispositions and timeline events
- immutable event/time-series semantics
- fresh DB and Stage 6 -> Stage 7 migration tests

### 7B — Demographics + assessment API

- expanded demographics and unknown identity metadata
- chief complaint/HPI/SAMPLE
- ABCDE + secondary survey
- clinical impression
- optional specialist extension payloads

### 7C — Serial observations

- persist normalized observations before/with downstream OpenEMR mapping
- chronological list endpoint
- pupils, glucose, EtCO2, ECG/rhythm and configurable additional observation support
- no overwrite semantics

### 7D — Medications + procedures

- split generic intervention model
- preserve compatibility endpoint
- medication stock linkage with existing exactly-once decrement
- procedure audit/history

### 7E — Disposition + timeline

- refusal/non-transport/cancel/no-patient/transfer/death outcomes
- clinical/operational timeline aggregation
- closure-readiness rules that do not require hospital handover for every outcome

### 7F — Web-control completion + acceptance

- extend existing crew workflow instead of rebuilding it
- complete synthetic medical case
- complete synthetic trauma case
- unknown patient case
- refusal/non-transport case
- serial vitals chronology
- medication/procedure audit and stock reconciliation
- real disposable OpenEMR acceptance
- Vtiger regression
- full Stage 1–6 regression

## Key risks

1. Treating OpenEMR SOAP notes as the primary structured ePCR store would make medication/procedure querying and offline synchronization brittle.
2. Writing only to OpenEMR vitals would leave V-EMS without the durable normalized timeline needed by mobile/offline Stage 10.
3. Reusing the generic intervention identity for both medications and procedures can create ambiguous stock/idempotency semantics.
4. Requiring `Handover Completed` for all closure would incorrectly block valid non-transport outcomes.
5. Storing mutable current-state assessment blobs without history would conflict with the Stage 7 auditability requirement and future Stage 8 amendments/finalization.

## First implementation checkpoint

Implement **7A Clinical persistence foundation** first. Do not change external behavior until migration and repository tests prove the new model on both a fresh database and a Stage 6 database. Then layer Stage 7 API behavior onto the persisted domain incrementally.

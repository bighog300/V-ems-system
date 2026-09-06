# Stage 6 Patient Cases

Vtiger owns operational incidents, assignments, vehicles, personnel and stock. OpenEMR owns patients and native clinical encounters. V-EMS owns the Patient Case aggregate and durable cross-system links. Creating another case does not create another Vtiger incident or assignment. Neither downstream system calls the other.

An incident has zero or more cases, each identified by a permanent `PCR-000001`-style public identifier and a unique positive `patient_sequence`. Each case has at most one current patient link and one native encounter link. Crew IDs are a compact snapshot of current operational responsibility, not duplicated personnel records. Clinical stock usage records carry the case ID and use its vehicle context.

## API

- `POST /api/incidents/{incidentId}/patient-cases`: create with optional `temporary_label`, `assignment_id`, `lead_clinician_id`; supports `Idempotency-Key` with request fingerprint checking.
- `GET /api/incidents/{incidentId}/patient-cases`: `{ patient_cases: [...] }`, ordered by sequence.
- `GET /api/patient-cases/{patientCaseId}`: case, current links, verification, encounter status, closure readiness and identity reconciliation history.
- `PATCH /api/patient-cases/{patientCaseId}/assignment`: select an active assignment belonging to the same incident; optional lead clinician. Updates current responsibility and audits before/after; clinical links and authorship remain unchanged.
- `POST /api/patient-cases/{patientCaseId}/provisional-patient`: create and link a marked native unidentified patient without demographic input; case-scoped durable reservation and replay.
- `POST|GET /api/patient-cases/{patientCaseId}/patient-link`: patient identification/linkage. Verified links require `openemr_patient_id`. Provisional links can exist without an ID until a native provisional patient is created.
- `POST /api/patient-cases/{patientCaseId}/encounters`: supply `care_started_at` and `presenting_complaint`. Patient, assignment, vehicle and crew derive from the case. `GET .../encounter` returns the persisted link.
- `PATCH /api/patient-cases/{patientCaseId}/status`: guarded lifecycle transition.
- `POST /api/patient-cases/{patientCaseId}/identity-reconciliation`: supervisor/admin supplies `verified_patient_id` and `reason`.

Patient search and creation remain `POST /api/patients/search` and `POST /api/patients`. Clinical observations, interventions and handover remain encounter-scoped.

Active assignment means Assigned, Accepted, Mobilised or Active, following the existing assignment repository. A sole active assignment is inherited; multiple require explicit selection. Proposed and terminal assignments do not establish current clinical responsibility. Crew IDs must exist in personnel master data; an explicitly selected lead must belong to that crew. No lead is inferred.

New case routes allow dispatcher list/view/create, assigned field crew list/view/create/link/encounter, clinical reviewer reads, crew lead responsibility/status actions, and supervisor/admin management. Field crew access to these routes also checks the authenticated actor's assignment membership. Existing role conventions remain in force for global patient and encounter routes.

## Unknown identity and reconciliation

Create a case with a temporary label before definitive identity is available. The native OpenEMR encounter API requires an actual patient resource, and its [patient validator](https://github.com/openemr/openemr/blob/master/src/Validators/PatientValidator.php) requires name, sex and DOB. The case-scoped `provisional-patient` action creates a real native resource named `Unidentified / PCR-xxxxxx`, sex `Unknown`, with the centralized technical DOB sentinel `PROVISIONAL_DOB_SENTINEL`. Native `genericname1`/`genericval1` explicitly mark the identity provisional and DOB unknown. V-EMS returns `provisional_identity: { dob_unknown: true, native_dob_placeholder: PROVISIONAL_DOB_SENTINEL }` and links the returned real ID with `verification_status: provisional`. This sentinel is not a clinical birth date and must never drive age-based clinical decisions; the UI explains this before creation. No definitive identity or demographic input is required. The original clinical record retains this warning during identity reconciliation. Deployments must include this convention in their native OpenEMR clinical workflow; Stage 6 does not infer age.

Successful provisional creation replays the same patient link. A durable reservation prevents concurrent creates or blind retries after an uncertain native result. No OpenEMR patient ID is fabricated locally.

Before an encounter exists, relinking updates the sole active patient link and preserves the prior link in the audit log. Once an encounter exists, changing its clinical patient ID through patient-link returns 409. Identity reconciliation retains the original provisional patient and encounter and appends the verified identity reference and reason. Observations, interventions, handover and stock stay on that original timeline. A verified reference is not a second active clinical patient link. An actual OpenEMR merge is deferred to an administrative process; Stage 6 does not claim or perform native encounter re-parenting. Repeated reconciliation to the same identity returns the existing result.

Encounter creation uses a durable per-case reservation before the remote write and a case-scoped idempotency fingerprint after success. Successful replay returns the same encounter. Concurrent or uncertain-outcome attempts return 409 requiring reconciliation, rather than blindly issuing another native create. Native encounter `external_id` carries the patient-case ID. Operators must inspect the native clinical record for an uncertain request before recovery; do not delete a reservation and retry without establishing the downstream outcome.

## Lifecycle and closure

Created → Patient Identification Pending → Patient Linked → Encounter Open → Care In Progress → Ready for Handover → Handover Completed → Closed. Direct patient linking can skip identification pending; persisted completed handover can advance from open/care states. Clinical writes advance an open case to care in progress. Handover completion and closure require persisted handover/disposition evidence. Stage 7 refusal, death and no-patient dispositions are not introduced.

Incident closure requires no active assignments and completed persisted handover/disposition for every case. A case without an encounter remains incomplete. Operational incidents with no patient cases retain their existing closure behavior.

## Migration and legacy clients

Migration `008_epcr_patient_cases.sql` deterministically orders legacy incident IDs, creates one case for every legacy patient and/or encounter link, and copies every link column including timestamps, correlations, verification, care start and handover metadata. Migration runs in one transaction. Old link tables remain read-only conversion archives; current repositories use the case link tables. Fresh databases apply migrations 001–008.

Legacy incident patient-link writes create the first case if needed. Incident-scoped patient-link and encounter routes work only with exactly one case, preserving their existing response contracts. With multiple cases they return 409 requiring `patient_case_id` and use of the case routes. GET never guesses or creates a case. The crew UI explicitly selects a case and discards unsaved forms only after confirming a switch.

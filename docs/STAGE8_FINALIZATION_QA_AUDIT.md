# Stage 8 ePCR Finalization and Clinical QA Audit

## Scope and baseline

This audit was performed before Stage 8 source changes on branch `stage8/epcr-finalization-qa` at commit `d76cf67cd6de886c206dc7d8cbf0b7d881145f99` (Stage 7 merge). The protected local changes in `infra/.env.development` and `infra/.env.development.bak`, and `env/development.local.env`, are outside Stage 8 scope.

## Patient Case lifecycle and closure semantics

`patient_cases` is the Stage 7 aggregate root. It stores the Patient Case, incident, sequence, assignment, vehicle, crew IDs, lead clinician, temporary label, operational `status`, timestamps, and correlation ID. Stage 7 status transitions are implemented in `services/orchestration/src/patient-cases.mjs` and cover identity and care progression (`Created`, `Patient Identification Pending`, `Patient Linked`, `Encounter Open`, `Care In Progress`, `Ready for Handover`, `Handover Completed`, and `Closed`, with related operational paths).

The existing `status` is therefore an operational/care status, not an ePCR legal lifecycle. `closure_ready` is derived from a disposition or persisted OpenEMR encounter handover/disposition metadata and is used by incident closure. It does not prove completeness, signature, submission, QA review, finalization, or immutable version state. Stage 8 must add a separate first-class ePCR lifecycle and transition history without replacing Stage 7 operational status or incident closure behavior.

## Clinical record persistence

Migration `009_epcr_clinical_record.sql` and the matching fresh-schema section persist:

* `patient_case_demographics`, including provisional/unknown identity fields;
* `patient_case_assessments`;
* `clinical_observations`;
* `medication_administrations`;
* `clinical_procedures`;
* `patient_case_dispositions`; and
* `patient_case_timeline_events`.

Repositories in `clinical-record-repository.mjs` serialize JSON payloads and expose create/list or save operations. `clinical-record.mjs` owns validation, Patient Case existence checks, timeline append, audit calls, and Stage 7 clinical events. It currently permits normal writes based on Patient Case existence and operational closure rules; there is no shared finalization lock. Stage 8 must guard every Stage 7 clinical mutation category through one centralized mutability check while retaining append-only historical rows.

The existing stock path records `stock_usage`, quantity, vehicle/source resolution, and discrepancy statuses such as unresolved vehicle/loadout or insufficient stock. Medication and procedure rows reference stock where applicable. Stage 8 can derive automatic QA flags from these persisted discrepancy signals instead of creating a second stock discrepancy system.

## OpenEMR boundary and linkage

Stage 7 keeps V-EMS Patient Case links in `patient_case_patient_links` and `patient_case_encounter_links`, while the OpenEMR adapter remains responsible for native patient, encounter, observation, intervention, and handover transport. A Patient Case stores the OpenEMR patient and encounter identifiers; identity reconciliation is explicitly audited and does not re-parent native encounters. Stage 8 should bind snapshots, signatures, reviews, and QA metadata in V-EMS and should not invent OpenEMR signature/finalization endpoints or alter the validated transport boundary.

## Timeline, audit, events, and idempotency

The shared `audit_logs` table stores timestamp, entity type/id, action, correlation ID, and before/after JSON. `OrchestrationService.audit()` writes these records. The `event_outbox` table stores event type, occurrence time, source system, correlation ID, and a JSON payload. Both are already used by Patient Case and clinical record operations and should remain the Stage 8 audit/event infrastructure.

The `idempotency_keys` table has `(scope, idempotency_key)` as its key and stores resource ID, timestamp, and request fingerprint. The API gateway passes the `Idempotency-Key` header into orchestration metadata. New lifecycle, version, signature, review, flag, and amendment mutations should use scoped idempotency where a request creates a durable resource or transition.

The clinical timeline is an append-only event table scoped by Patient Case. Lifecycle transitions and review actions should be represented in the Stage 8 lifecycle/review tables and shared audit/event infrastructure; timeline projection may be added where useful, without treating timeline rows as the legal version source.

## Actor, crew identity, and RBAC

Authentication yields `actorId` and a lower-case role from JWT claims or trusted development headers. The API request context adds correlation ID, actor ID, and role. Assignment membership is enforced for `field_crew` and `field_crew_lead` on Patient Case routes by checking active incident assignments and crew IDs. Existing policy entries distinguish field crew, lead, clinical reviewer, supervisor, and sys admin for Patient Case reads/writes. Dispatcher access is intentionally separate from clinical signing policy.

Personnel are persisted in `personnel` with staff ID, display name, operational role, and contact/assignment metadata. Stage 8 should capture both authenticated actor identity and supplied signer/personnel identity, validate role capabilities at the gateway/service boundary, and never treat `sys_admin` as a substitute for clinical authorship. Existing assignment crew IDs and lead clinician fields are the reusable source for crew/lead identity checks.

## API gateway and web-control seams

`services/api-gateway/src/server.mjs` uses explicit Patient Case route matching, request validation, request context metadata, idempotency headers, and the shared RBAC policy in `authorization-policy.mjs`. Existing Stage 7 routes cover Patient Case retrieval, identity/linkage, operational assignment/status, demographics, assessments, observations, medications, procedures, disposition, and timeline. Stage 8 should add a second explicit route family for readiness, lifecycle, versions, signatures, submit, amendments, review, and QA flags without changing existing route contracts.

`apps/web-control` is a browser acceptance client with development actor/role selectors, API helpers, crew/incident summaries, workflow actions, and tests for request/render behavior. It currently guides patient linkage, encounter creation, assessment/treatment, handover, and incident closure. It has no Stage 8 lifecycle, readiness, signature, review queue, QA flag, version/hash, or amendment controls. The Stage 8 UI should add focused acceptance controls and display the server contract rather than redesigning the existing dispatcher/crew screens.

## SQLite migrations and fresh schema

`SqliteClient` creates `schema_migrations`, discovers lexically ordered SQL files under `services/orchestration/src/migrations`, and applies each unapplied migration transactionally. `009_epcr_clinical_record.sql` is the current Stage 7 migration. `services/orchestration/src/schema.sql` is used for fresh schema inspection/bootstrap paths and includes the Stage 7 tables as an authoritative aligned section. Stage 8 persistence belongs in `010_epcr_finalization_qa.sql` and must be represented in the fresh schema with equivalent tables, foreign keys, indexes, uniqueness rules, and defaults. Upgrade testing can construct a pre-010 database, apply migration 010, and verify the same objects as a fresh database.

## Hashing and canonicalization

The repository uses Node.js `node:crypto` in authentication but has no existing ePCR snapshot/hash utility. JSON payloads are currently serialized with ordinary `JSON.stringify`, which is not a suitable legal snapshot canonicalization contract because object insertion order can vary. Stage 8 must add deterministic recursive canonical serialization with sorted object keys and deterministic array handling, then hash the canonical bytes with SHA-256. Tests must prove equivalent records hash identically and a material change hashes differently.

## Stage 8 additions versus reuse

Stage 8 must add:

* an ePCR lifecycle independent of the operational Patient Case status, with explicit transition validation and immutable transition history;
* conditional, structured readiness evaluation and exact missing requirements;
* immutable version snapshots, canonical content, SHA-256 hashes, source revision metadata, and version listing/retrieval;
* structured version-bound signatures for the required signer roles and future handwritten-signature metadata;
* a centralized finalization mutability guard used by all Stage 7 clinical mutation paths;
* explicit amendments that preserve finalized versions and create a new version/hash with before/after values;
* review actions, returned-for-correction/resubmission handling, review queues, and audited QA flags;
* Stage 8 RBAC policy and Patient Case-native endpoints;
* a stable finalized ePCR summary/export contract; and
* focused web-control acceptance workflows and integration tests.

Stage 8 should reuse:

* Patient Case identity, incident, assignment, crew, lead clinician, OpenEMR patient, and encounter links;
* Stage 7 demographics, assessment, observation, medication, procedure, disposition, and timeline repositories;
* existing stock discrepancy data and clinical events;
* the shared audit log, event outbox, correlation IDs, and idempotency repository;
* existing authentication, assignment membership, personnel identity, and RBAC policy patterns;
* the migration runner and fresh-schema conventions; and
* the existing API gateway and web-control request/render patterns.

No Stage 7 redesign is required by this audit. The concrete Stage 8 defect to address is the absence of a medico-legal lifecycle/version boundary and a centralized lock that can prevent all normal clinical mutations after finalization.

## Acceptance risks to carry into implementation

The lifecycle must not be inferred from or overwrite operational `patient_cases.status`. Readiness must allow unknown/provisional identity when the case is otherwise complete and must vary requirements by disposition/outcome. Signatures must bind to a specific immutable version/hash and must not transfer silently across corrections. Review return/resubmit must preserve the earlier submitted version. Finalization must return a clear conflict for every Stage 7 mutation category. Multi-patient isolation must be enforced by Patient Case foreign keys and route scoping. Audit records should contain actor/action/version references and avoid copying unnecessary PHI.

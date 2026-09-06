# V-EMS ePCR + Mobile Completion Plan

## Purpose

This plan converts the September 2026 ePCR readiness review into an execution sequence for turning V-EMS from an operational/clinical integration platform into a complete field ePCR system with native mobile apps.

Stage 5 established the stable integration baseline:

- Vtiger operational incident, vehicle, personnel, assignment, stock, loadout and stock-usage integration.
- Native OpenEMR 8.3 OAuth/API integration for patient, encounter, observations, interventions and handover.
- Idempotent orchestration, retry/recovery, audit/events and cross-system linkage.

Baseline commit: `e462b247500762027783fedbe95dcf786334e7bd`.

The remaining work is product/domain completion, mobile/offline capability, production clinical infrastructure and field validation.

---

## Architecture boundary to preserve

- **Vtiger** — operational system of record: calls/incidents, dispatch, assignments, vehicles, personnel, equipment and stock.
- **OpenEMR** — clinical system of record: patient identity/demographics, encounters, observations, clinical treatment records and handover documentation.
- **V-EMS** — ePCR/orchestration layer: patient-case lifecycle, API gateway, cross-system links, idempotency, offline sync, completion/signatures/QA, mobile-facing normalized contracts and reporting coordination.
- **Mobile Crew App** — field client of V-EMS only. It must not call Vtiger or OpenEMR directly.

---

# Delivery sequence

## Stage 6 — Multi-patient Patient Case domain

Tracking: #63

### Objective
Create a first-class `patient_case`/ePCR aggregate so one operational incident can contain one or many independent patient records.

### Required outcomes
- Incident 1:N patient cases.
- Patient case owns OpenEMR patient/encounter linkage.
- Unknown/unidentified patient supported before definitive identity.
- Assignment, vehicle, crew and lead-clinician context automatically inherited when possible.
- Audited responsibility transfer between crews/vehicles.
- Existing single-patient records migrate safely.

### Exit gate
One Vtiger incident with multiple patients must create independent native OpenEMR patient/encounter chains without breaking Stage 1–5 integrations.

---

## Stage 7 — Complete clinical ePCR record

Tracking: #64

### Objective
Expand the basic encounter/vitals/intervention workflow into a complete EMS patient care record.

### Required outcomes
- Complete demographics and unidentified-patient workflow.
- HPI/SAMPLE history.
- ABCDE primary survey and secondary/trauma assessment.
- Serial time-series observations.
- Structured clinical impression/differentials.
- Structured medication administrations and procedures.
- Clinical extensions for stroke, sepsis, obstetric, paediatric and mental-health care.
- Refusal/non-transport/death/cancelled/no-patient workflows.
- Complete scene/transport/handover timeline and disposition.

### Exit gate
Synthetic medical and trauma cases can be fully charted from contact through disposition using native OpenEMR-backed clinical records.

---

## Stage 8 — Signatures, finalization, amendments and QA

Tracking: #65

### Objective
Make the PCR medico-legally complete and reviewable.

### Required outcomes
- Lifecycle: Draft -> Crew Complete -> Signed -> Submitted -> QA Review -> Final.
- Conditional completeness rules by case type/outcome.
- Crew, patient/representative, witness and receiving-clinician signatures where required.
- Signatures bound to record version/hash.
- Finalized PCRs immutable except through audited amendments.
- Supervisor/clinical-review queues and return-for-correction workflow.
- Clinical governance flags and full audit trail.

### Exit gate
A complete PCR can be signed, submitted, reviewed, finalized and later amended without destroying the original record.

---

## Stage 9 — Native crew mobile foundation

Tracking: #66

### Objective
Build `apps/mobile-crew` as the native field ePCR client.

### Preferred implementation
React Native/Expo unless an ADR selects an alternative.

### Required outcomes
- Real authenticated session bootstrap.
- Secure token storage and local lock/biometric hooks.
- Encrypted local database.
- Assigned-job list and incident context.
- Multi-patient patient-case workflow.
- Demographics, encounter, assessment, serial vitals, history, interventions, medications, transport, handover and signatures.
- ePCR completeness/status view.
- Android and iOS build configurations.

### Exit gate
A crew member can complete one connected-mode PCR end to end on the native app and submit it through V-EMS.

---

## Stage 10 — Offline-first synchronization

Tracking: #67

### Objective
Make field operation independent of continuous connectivity.

### Required outcomes
- Durable encrypted local drafts.
- Durable mutation outbox/change journal.
- Stable client-generated identities/idempotency keys.
- Queued/sending/acknowledged/retrying/conflict/failed sync state model.
- Background/foreground sync.
- Explicit conflict policy.
- Token-expiry/re-auth recovery without data loss.
- Exactly-once behavior for clinical events and stock usage.
- App-kill/device-reboot recovery.

### Exit gate
A full PCR can be completed offline, the device can restart, and later synchronization produces no lost or duplicate clinical/stock records.

---

## Stage 11 — Mobile-native field capabilities and UX

Tracking: #68

### Objective
Optimize the app for ambulance-field use and native hardware integration.

### Required outcomes
- Rapid repeat-vitals and medication/procedure entry.
- Camera/document attachment capture.
- Barcode/QR medication/stock scanning.
- GPS/location context with privacy controls.
- Push assignment notifications.
- Biometric re-entry and device/session identity.
- Patient/crew/receiving-clinician signature canvas.
- Tablet and phone layouts, accessibility and field ergonomics.
- Vendor-neutral hooks for future monitor/defibrillator imports.

### Exit gate
Physical Android/iOS devices can complete realistic field workflows with attachments, notifications and rapid clinical entry online and offline.

---

## Stage 12 — Production clinical infrastructure

Tracking: #69

### Objective
Harden central infrastructure for concurrent crews and protected health information.

### Required outcomes
- PostgreSQL authoritative V-EMS server persistence.
- SQLite retained for tests/local/mobile use.
- Production migrations and rollback/data migration tooling.
- Encrypted object storage for attachments.
- Backup/restore and disaster recovery.
- Production OIDC, token rotation, MFA hooks, session/device revocation.
- PHI-safe logs/telemetry.
- Production secrets management and secure defaults.
- Staging environment mirroring production.
- Capacity/load testing and dependency health/readiness.

### Exit gate
Production-mode PostgreSQL + object storage + identity stack passes the entire ePCR/mobile regression suite and a backup/restore drill.

---

## Stage 13 — Compliance, reporting and clinical governance

Tracking: #70

### Objective
Add the jurisdiction-aware reporting and governance layer required for operational ePCR deployment.

### Required outcomes
- Target-jurisdiction minimum datasets and validation profiles.
- Canonical terminology/coding for complaints, impressions, medications, procedures, disposition and outcome.
- Signed/versioned final PCR report/PDF.
- Patient care/handover, operational, drug/stock and QA reports.
- Access/audit reports.
- Retention, archival, deletion/legal-hold and privacy workflows.
- Versioned exports and schema compatibility tests.

### Exit gate
A finalized PCR can be rendered/exported under a defined deployment profile with a complete audit trail and governance rules.

---

## Stage 14 — Field validation and release readiness

Tracking: #71

### Objective
Prove the complete system under realistic field conditions before general rollout.

### Required outcomes
- Android/iOS physical-device matrix tests.
- Ambulance tablet usability tests.
- Multi-patient/MCI drill.
- Prolonged offline/app-kill/reboot/reconnect drill.
- Identity correction, refusal, trauma, paediatric and cardiac-arrest scenarios.
- OpenEMR/Vtiger/V-EMS outage and recovery drills.
- Lost/revoked-device test.
- Timezone/DST verification.
- Security/privacy penetration review.
- Clinical-safety/hazard review.
- Backup/DR verification.
- Signed release builds, rollout/rollback/support process and training.

### Exit gate
End-to-end dispatch -> patient care -> handover -> QA -> final report passes on physical devices, including offline operation, with no unresolved critical/high safety or security findings.

---

# Cross-stage engineering rules

Every stage must preserve these rules:

1. No direct Vtiger <-> OpenEMR coupling.
2. Mobile clients call V-EMS only.
3. Clinical care is not blocked solely by downstream operational/inventory outages.
4. Stable identities and idempotency are required for all retryable writes.
5. PHI and credentials must not appear in ordinary logs, telemetry or source control.
6. Clinical changes must be attributable and auditable.
7. Finalized clinical records are versioned/immutable; corrections are amendments.
8. Tests must cover offline/retry/uncertain-outcome behavior where applicable.
9. Existing accepted stages remain regression gates.
10. Environment/runtime credentials stay outside Git.

---

# Completion gates per stage

Before a stage is considered complete:

- Unit/contract tests pass.
- Integration tests pass against real disposable downstream services where relevant.
- Full repository regression suite passes.
- Smoke/health/readiness checks pass.
- `git diff --check` passes.
- No temporary diagnostics, test identities, tokens or secrets remain in production source.
- Acceptance criteria in the corresponding GitHub issue are demonstrated.
- Stage changes are reviewed before commit/push.

---

# Recommended execution order

Execute sequentially where domain dependencies require it:

`Stage 6 -> Stage 7 -> Stage 8 -> Stage 9 -> Stage 10 -> Stage 11 -> Stage 12 -> Stage 13 -> Stage 14`

Some work may overlap safely after contracts stabilize:

- Stage 12 infrastructure design can begin while Stages 9–11 are underway.
- Stage 13 jurisdiction research/terminology design can begin during Stage 7, but implementation should target the stabilized Stage 7/8 model.
- Stage 14 test-plan drafting should begin early, but field acceptance happens last.

---

# Definition of fully functional V-EMS ePCR

V-EMS can be considered a fully functional ePCR platform with mobile apps when:

- one operational incident can support one or many patients;
- every patient has a complete structured clinical timeline and native OpenEMR record;
- crews can work from native Android/iOS devices without continuous connectivity;
- all offline writes reconcile safely and exactly once;
- signatures, finalization, QA and amendments are defensible and audited;
- production infrastructure protects PHI and supports concurrent crews;
- required jurisdictional reports/exports and retention controls exist;
- physical-device field trials and outage drills pass documented release gates.

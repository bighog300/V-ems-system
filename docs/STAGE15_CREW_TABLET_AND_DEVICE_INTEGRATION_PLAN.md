# Stage 15 — Crew Tablet Workflow and Device Integration: Execution Plan

Tracking: no GitHub issue yet — this stage was scoped from a product conversation, not a
pre-existing issue like Stage 13/14 (#70/#71). Create one before starting 15a if this
plan is approved to build against.

Builds on Stage 13 (compliance/reporting/governance, merged in full) and two
stage-adjacent gap-closure PRs merged directly against `main`: the patient
prior-history endpoint (`GET /api/patient-cases/{id}/history`) and the
identity-number/hospital-card-number patient search fix. Both were flagged in
a structural sketch of a landscape tablet shell for crews (published as an
artifact during this planning conversation, not committed to the repo) and
are now real, tested backend surface this stage's client-side work builds on.

## Where this stage starts

The mobile crew app (`apps/mobile-crew`) is a portrait-locked, single-column
stack of eleven screens today — nothing in it is landscape-aware, nothing
shows call-status action buttons (the incident status state machine in
`packages/shared/src/state-machine.mjs` is fully built server-side and
completely unused client-side), and patient identification/history has no UI
at all (`IncidentDetailScreen.tsx` literally says so: *"Patient identification
... and the assessment/vitals/handover workflow land in the next
milestone"*). Two real backend gaps this stage depends on are already closed:
history retrieval and multi-identifier search. Two are new capability this
stage adds outright: structured notes, and Bluetooth vitals-monitor
integration.

## Design decisions

Four scope-boundary questions were resolved before starting:

### Tablet shell: one codebase, one width breakpoint, not a separate app

`apps/mobile-crew` already targets both platforms via Expo/React Native.
**Decided**: a `useWindowDimensions` breakpoint swaps the existing phone
stack navigator for a landscape split-view shell above a tablet width
threshold; the screen/form components already in `src/screens/` become the
content rendered inside each pane. No second app, no duplicated business
logic — only the navigation shell differs by form factor.

### On-device history: scoped to the active transport, not a general cache

Per direction: prior history/medications are only useful to a crew while
they're actively caring for and transporting that specific patient — keeping
it on-device after hospital delivery is pure PHI-at-rest risk with no
clinical upside. **Decided**: history is fetched once per patient case (via
the now-live history endpoint) into an in-memory/short-lived store keyed to
`patient_case_id`, never written to the app's durable offline cache
(`src/offline/cacheStore.ts`), and explicitly purged the moment that case's
incident reaches `At Destination`/`Handover Complete` in the status pipeline
— not on a timer, not on app background, tied to the actual clinical event
that ends the need for it.

### Notes: a small controlled tag vocabulary plus free text

Per direction, mirroring the existing `epcr_qa_flags` shape
(`flag_type` + `resolution_note`) rather than inventing a new pattern:
`tags: string[]` (multi-select, not exclusive) plus `text` (free text).
Initial vocabulary: `scene_safety`, `mechanism_of_injury`,
`family_bystander_report`, `refusal_context`, `communication_barrier`,
`safeguarding_concern`, `law_enforcement_involvement`, `general`. A note
tagged `safeguarding_concern` auto-raises a QA flag the same way a refusal
disposition already does in `createVersion()` — everything else stays purely
informational, matching 13c's "informational, not a new hard gate" precedent
for compliance validation.

### Bluetooth vitals monitors: a driver-per-vendor pattern, not a single integration

Real cardiac/vitals monitors overwhelmingly use proprietary Bluetooth GATT
profiles that vary by vendor and model; a single hard-coded integration would
mean rebuilding from scratch for every new manufacturer. **Decided**: the
same adapter/mapper/transport shape this codebase already uses for
Vtiger/OpenEMR, applied to BLE — a common `VitalsDeviceDriver` interface,
one implementation per vendor, a driver registry that matches an
advertisement to a driver, and a generic IEEE 11073 Health Device Profile
driver as a fallback baseline for any standards-compliant device. Every
driver, regardless of vendor wire format, must resolve to the same
normalized reading shape `clinical_observations.vital_signs` already uses —
no vendor-specific data ever exists above the driver boundary. New vendor
support means a new driver file registered into the existing pipeline, never
a change to the scan/connect/normalize logic itself.

## Milestones

Same incremental-PR pattern as Stages 9–14 — each step independently
reviewable and testable. 15a is a prerequisite for 15b–15d (all render inside
its shell); 15e is a prerequisite for 15f–15g. 15h (field validation) folds
into Stage 14's existing framework rather than duplicating it, and only makes
sense once 15a–15g are built.

1. **15a — Tablet shell foundation.** Landscape orientation
   (`app.json`), the `useWindowDimensions` breakpoint, and a master-detail
   split-view replacing the Jobs→Incident push stack. The call/status
   workflow: a status stepper over the existing incident state machine
   (`acknowledge_assignment → depart_to_scene → arrive_scene →
   begin_transport → arrive_destination → complete_handover`) with one
   primary action button per current status, plus a `Navigate` deep link to
   the device's own maps app. No backend changes — this is entirely new
   client UI over already-tested endpoints (`PATCH /api/incidents/{id}`).
2. **15b — Patient identity in the shell.** The three-mode search screen
   (ID number / hospital card / name+DOB+address) wired to the now-fixed
   `POST /api/patients/search`, the no-match → provisional-patient path
   (`createProvisionalPatientForCase`, already built), and camera-based
   barcode scanning (`BarcodeScannerModal` already exists, unwired) decoding
   a scanned ID/hospital-card barcode directly into the matching search
   field. Barcode symbology/payload format needs confirming against a real
   card from the deployment before the decode step can be finalized — flagged
   as a blocking input, not guessed.
3. **15c — On-device patient history.** Client-side only: fetch via
   `GET /api/patient-cases/{id}/history` into a short-lived, non-cached store
   per the design decision above, rendered as the leading tab in the
   patient-record shell, purged on `arrive_destination`/`complete_handover`.
   Needs a regression test proving the purge actually fires on that
   transition and that history never lands in the durable offline cache.
4. **15d — Structured notes.** New backend: a `patient_case_notes` table/
   endpoint (`POST`/`GET /api/patient-cases/{id}/notes`), following the exact
   audit/versioning conventions `clinical-record.mjs` already uses for
   medications/procedures — this is new data, but not a new pattern. Client:
   the tag-picker + free-text entry screen from the design decision above.
   `safeguarding_concern` wired to raise a QA flag automatically.
5. **15e — BLE device driver framework.** The `VitalsDeviceDriver`
   interface, the driver registry (advertisement matching → driver
   selection), and the generic IEEE 11073 HDP driver as the first working
   implementation (heart rate, SpO2, blood pressure GATT services). Proves
   the pipeline end-to-end against any standards-compliant device before any
   vendor-specific work exists.
6. **15f — Device pairing and reading provenance (backend).** A
   `device_pairings` registry (serial number, vendor, model, paired vehicle,
   paired patient case, paired/unpaired timestamps) and a provenance link
   from a BLE-sourced `clinical_observations` row back to the pairing that
   produced it — so a reading is traceably device-sourced vs.
   crew-manually-entered, and a specific physical unit's history is
   queryable if it's later found miscalibrated or recalled. RBAC and audit
   trail follow the same conventions Stage 13 already established for
   sensitive reads/writes.
7. **15g — First named-vendor driver.** Blocked on the deployment naming a
   real monitor make/model — written against that vendor's actual GATT
   profile or SDK documentation, not guessed. Serves as the template every
   subsequent vendor driver follows.
8. **15h — Field validation of the device-integration path.** Not a new
   framework — folds device-pairing reliability, reconnect-on-signal-loss,
   and low-battery/dropped-connection behavior into the existing Stage 14
   test plan's drill catalog (`docs/STAGE14_FIELD_VALIDATION_TEST_PLAN.md`)
   as additional scenarios, since it's the same physical-device-required,
   real-crew validation Stage 14 already exists to cover.

## Exit gate

A crew can identify a patient by scan or search on a landscape tablet shell,
see that patient's recent history for the duration of the transport only,
take tagged structured notes, and pair at least one real vitals monitor that
streams readings directly into the patient record with full device
provenance — end to end, on the same physical-device validation bar Stage 14
already sets.

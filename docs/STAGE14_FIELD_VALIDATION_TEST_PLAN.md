# Stage 14 — Field Validation and Release Readiness: Test Plan

Tracking: issue [#71](https://github.com/bighog300/v-ems-system/issues/71). Follows Stage 13
(issue #70, merged in full — compliance profiles, coded terminology, PCR completeness
validation, signed/versioned PDF export, operational/drug-stock/QA/audit reporting,
retention/legal-hold, export-format compatibility).

## Why this document exists, and what it is not

Every prior stage (6 through 13) was validated the way this repository validates
everything: automated unit/integration tests, run against SQLite in CI and against a
real local Postgres instance before merge, per each stage's own completion gate. That
proves the *code* is correct against the contracts it was written to. It does not prove
the *system* — real devices, real network conditions, real crews, a real ambulance cab —
behaves correctly, because none of that exists in an automated test run or in this
environment. Stage 14 is that second, distinct kind of proof, and this document is the
plan for gathering it: what to test, on what, how to tell pass from fail, and what
"done" means.

This document is written to be **executed by a human team with physical devices**, not
by this session. Nothing in it can be completed here — that is the reason Stage 14 was
called out as unstartable when Stages 10–13 were surveyed for what this environment
could actually execute. What *is* in scope for this environment, and done as of this
document: drafting the plan itself (issue #71 explicitly calls for starting test-plan
drafting early, ahead of the drills themselves), and keeping it grounded in the features
Stages 6–13 actually built rather than a generic device-testing checklist.

## Scope

**In scope**: everything in Stage 14's required-outcomes list (issue #71) as it applies
to the V-EMS mobile crew app, its offline/sync behavior, and its interaction with the
API gateway, OpenEMR and Vtiger in a real deployment topology.

**Out of scope, and why**:
- Anything already covered by an existing automated suite is *referenced*, not
  re-specified here — e.g. RBAC enforcement (`docs/ops/security-compliance.md`), sync
  worker duplicate-processing correctness under concurrent Postgres connections
  (`docs/ops/09-capacity-and-load-testing.md`), backup/restore mechanics
  (`docs/ops/06-backup-recovery-checklist.md`, `docs/ops/07-disaster-recovery-runbook.md`).
  Stage 14 exercises these *on real infrastructure under field conditions*, not their
  logic from scratch.
- Load/capacity targets are Stage 12 milestone 12j's job, already measured and
  documented; Stage 14's outage/recovery drills below are about *operator-visible
  behavior* during an outage, not throughput.
- Formal penetration testing and clinical-safety review require qualified third-party
  reviewers this session cannot stand in for; this document specifies what they need to
  cover and the acceptance bar, not the review itself.

## Device and environment matrix

| Axis | Coverage required |
|---|---|
| OS | Android (current + previous major release), iOS (current + previous major release) |
| Form factor | Phone, and the specific ambulance-mount tablet model(s) the deployment will actually use |
| Network | Wi-Fi, cellular (LTE/5G), airplane mode, and a simulated poor-cellular profile (high latency + packet loss, not just "off") |
| Power | Normal, low-battery power-saving mode active (OS may throttle background sync) |
| Locale/timezone | At minimum the deployment's home timezone and one DST-transition date; `apps/web-control/test/crew-timezones.test.mjs` and its fixture already cover the *display-layer* timezone-conversion logic under test — Stage 14 confirms real-device clocks agree with server time under the same rules |
| Bluetooth (device integration, Stage 15) | At least one physical unit of each named-vendor vitals monitor the deployment actually carries (Stage 15 milestone 15g's drivers), covering a forced range-loss disconnect and a low-battery/dropped-connection condition per model — see Scenario 10 |

Every scenario below runs at minimum once against a physical Android device and once
against a physical iOS device unless marked platform-specific.

## Test scenario catalog

Each scenario lists preconditions, steps, and pass/fail criteria. "Pass" criteria are
written to be checkable by an observer without needing to read source code.

### 1. Golden path: dispatch → patient care → handover → QA → final report

**Preconditions**: crew logged in, assigned to a vehicle, incident dispatched to that
vehicle's assignment.

**Steps**: accept assignment on device → chart demographics, at least one assessment, one
medication (against a stocked item, to exercise the stock-usage path), one procedure,
disposition → complete → sign → submit → (as a second reviewer account) accept → finalize
→ export the signed PDF.

**Pass criteria**: every step succeeds with no error dialog attributable to the app
itself (a deliberately-induced network failure inside a later scenario is not a failure
here); the exported PDF opens in a standard PDF viewer, shows the correct patient case
ID, version number, content hash, and every charted item; the audit report
(`GET /api/reports/audit`) shows an entry for each mutating step with the correct
`actor_id`.

**Repeat** for at least one refusal-outcome case and one transported-to-facility case,
since those two disposition paths drive different completeness-validation rules
(`services/orchestration/src/compliance/profiles/reference-nemsis.mjs`).

### 2. Multi-patient / MCI drill

The schema already supports multiple independent patient cases per incident
(`patient_cases.patient_sequence`, exercised in
`services/orchestration/test/patient-cases.test.mjs`'s four-independent-patients test) —
this scenario proves that holds up with real crews on real devices, not just in a
single-process test.

**Steps**: dispatch one incident, create 4+ patient cases against it from 2+ physical
devices concurrently, assign different crew members as lead clinician on different
cases, chart all of them to completion in parallel.

**Pass criteria**: no case's data leaks into another's on-device or in the exported
report; the incident's audit trail and QA-flag report correctly attribute each entry to
its own patient case; no device shows another crew member's in-progress case as its own.

### 3. Prolonged offline / app-kill / reboot / reconnect drill

**Steps**: put device in airplane mode → chart a complete PCR fully offline (this is
Stage 10 milestone 10h's own drill, folded in here rather than duplicated as a separate
exercise) → force-kill the app mid-charting and relaunch → reboot the device entirely and
relaunch → leave offline for at least 4 hours → reconnect.

**Pass criteria**: no chart data is lost at any interruption point; on reconnect, sync
completes and the server-side record matches on-device state exactly (compare the
device's local copy against `GET /api/patient-cases/{id}/summary`); no duplicate
patient case, medication, or procedure record is created server-side from a retried
sync (this is the same duplicate-processing guarantee 12j proved under load — this
drill proves it under a real flaky-radio device, not a load-test harness).

### 4. Identity correction and reconciliation scenarios

**Steps**: chart a patient as unidentified/provisional → later reconcile to a verified
identity mid-case → attempt the same for a case where two crews independently created
provisional identities for what turns out to be the same patient.

**Pass criteria**: `POST /api/patient-cases/{id}/identity-reconciliation` correctly
merges without data loss; the audit trail shows the reconciliation event; no downstream
OpenEMR/Vtiger record ends up orphaned or duplicated.

### 5. Clinical scenario drills: trauma, paediatric, cardiac arrest

Run the golden path (Scenario 1) once per scenario type, using each type's actual
required documentation:

- **Trauma**: multiple procedures with stock consumption sufficient to trigger a real
  `INSUFFICIENT_STOCK` discrepancy on at least one run (proving the crew sees and can
  work around a real discrepancy, not just that the report shows one).
- **Paediatric**: weight-based dosing entry, guardian signature role
  (`signer_role: "guardian"` in `epcr-finalization.mjs`'s `SIGNATURE_ROLES`).
- **Cardiac arrest**: refusal-of-resuscitation or termination-of-efforts disposition path,
  and the automatic QA flag it's expected to raise (`createVersion`'s automatic
  QA-flag-on-refusal logic in `epcr-finalization.mjs`) actually appears in
  `GET /api/reports/qa-flags` after sync.

**Pass criteria**: each scenario's specific required fields are actually collectible on
the real device UI within a clinically reasonable time (measure and record time-to-chart
per scenario — this is a usability signal, not a hard pass/fail gate, but a large
outlier here is itself a finding).

### 6. OpenEMR / Vtiger / V-EMS outage and recovery drills

Run each of the three independently: stop OpenEMR, stop Vtiger, stop the V-EMS API
gateway itself, while a crew is actively charting.

**Pass criteria**: per cross-stage engineering rule 3 (`docs/EPCR_MOBILE_COMPLETION_PLAN.md`),
clinical charting continues uninterrupted during an OpenEMR/Vtiger outage — the app
must not block chart entry on a downstream system being reachable. A V-EMS API gateway
outage is expected to degrade to offline-queued mode (Scenario 3's behavior), not data
loss. On each system's recovery, queued work drains automatically without manual
intervention, and `/api/support/diagnostics` reflects a clean recovered state (no
stuck `processing` sync intents past their lease, per the dead-letter/backoff behavior
already covered in `services/orchestration/test/sync-worker.test.mjs`).

### 7. Lost / revoked device test

**Steps**: while a device is mid-session, revoke it (`POST /api/revocations`, scope
`device`) from another device/console. Separately, test scope `actor` revocation.

**Pass criteria**: matches the already-automated behavior in
`services/api-gateway/test/revocation.test.mjs` — the revoked device/actor is denied
with `401 SESSION_REVOKED` on its very next request — but confirmed here against a real
device's real request timing (e.g., a request already in flight when revocation lands),
and that the on-device UI surfaces a clear "access revoked, contact your supervisor"
state rather than a raw error or silent failure.

### 8. Timezone / DST verification

**Steps**: chart a PCR with the device set to the deployment's home timezone, then
repeat with the device clock spanning a DST transition (either simulate the date or use
a real transition date in the drill calendar).

**Pass criteria**: every timestamp charted on-device matches server-recorded UTC
correctly converted; the exported PDF and the web-control dashboard
(`apps/web-control/test/crew-timezones.test.mjs` covers the conversion logic itself)
show the same local time for the same event; no event appears to occur before dispatch
or after handover due to a conversion error.

### 9. Ambulance tablet usability test

Distinct from the functional drills above: with real crews, in a real (or realistic
mock) ambulance cab, chart a full PCR under actual field conditions — gloved hands,
vehicle motion, daylight glare, one-handed operation.

**Pass criteria**: no required interaction is impossible or unreasonably difficult under
these conditions; collect structured usability feedback (task completion, time,
subjective difficulty per screen) from at least 3 distinct crew members per platform.
This is the one scenario in this catalog whose "pass" bar is a documented go/no-go
judgment call by the clinical/operations sponsor, not a binary technical check — record
the judgment and its rationale in the execution log (see below).

### 10. Device pairing and vitals-monitor integration drill

Stage 15 milestone 15h: not a new framework, folded into this catalog per that
milestone's own scoping — device-pairing reliability, reconnect-on-signal-loss, and
low-battery/dropped-connection behavior are the same physical-device-required,
real-crew validation this document already exists to cover, exercised against the
driver framework, generic IEEE 11073 driver, and device-pairing/provenance registry
Stage 15 milestones 15e/15f already built and automated-tested (fake-transport and
fake-connection tests only — this drill is what proves the same guarantees hold
against a real Bluetooth radio, a real monitor, and a real crew, exactly as Scenario 3
does for offline/reconnect behavior more broadly).

**Blocked until**: Stage 15 milestone 15g (first named-vendor driver, written against
a real monitor's actual GATT profile or SDK) exists and at least one physical unit of
that make/model is available. The generic IEEE 11073 driver's own correctness (GATT
parsing, SFLOAT decoding, registry matching) is already proven by
`apps/mobile-crew/test/devices/*.test.ts` against fake transports — this drill is
about real Bluetooth radio behavior a fake transport cannot exercise: real range loss,
real reconnection timing, a real device's real battery draining. Do not attempt to
satisfy this scenario's pass criteria against a fake/simulated transport.

**Preconditions**: a named-vendor driver (15g) registered in the app; a real physical
vitals monitor of that vendor/model; a vehicle already paired to it
(`POST /api/vehicles/{id}/device-pairings`, per 15f); an active patient case with an
open encounter.

**Steps**:
1. Pair the physical monitor to the vehicle and confirm the resulting
   `device_pairings` row has the correct `serial_number`/`vendor`/`model`
   (`GET /api/vehicles/{id}/device-pairings`).
2. Link the pairing to the active patient case
   (`PATCH /api/device-pairings/{id}/patient-case`), begin streaming, and confirm at
   least one BLE-sourced vital appears in
   `GET /api/patient-cases/{id}/observations` with `device_pairing_id` set to this
   pairing.
3. Walk the monitor out of Bluetooth range mid-stream. Confirm the app detects and
   surfaces the disconnect to the crew — never silently stops receiving readings
   without the crew knowing charting has degraded to manual entry — then walk back
   into range and confirm reconnection, whether automatic or via a clear
   manual-retry path.
4. Drain or simulate the monitor's battery to critically low/dead while paired and
   mid-transport. Confirm the app distinguishes a low-battery/dead-device state from
   an ordinary range-loss disconnect, and that the crew can fall back to manual vitals
   entry on the same encounter without losing anything already charted.
5. Unpair the unit, then re-pair the same physical unit (same serial number) to a
   different patient case within the same shift. Confirm the original pairing's
   history and `patient_case_id` are untouched and the new pairing is a distinct
   `device_pairings` row — the same traceability `services/orchestration/test/device-pairings.test.mjs`
   already proves at the API level, now confirmed end-to-end from a real re-pair.
6. Chart one vital manually on the same encounter (a value the monitor doesn't
   support, or during the manual-fallback window from step 4) and confirm its
   observation has `device_pairing_id: null` — provenance must correctly distinguish
   device-sourced from manually-entered readings within the same encounter, not just
   across separate sessions.

**Pass criteria**: every disconnect (range loss or battery) is detected and surfaced
to the crew within a clinically reasonable time (record the actual time, same
usability-signal pattern as Scenario 5); no BLE reading is ever attributed to the
wrong patient case or wrong physical unit (cross-check every `device_pairing_id` in
the drill's observations against the actual pairing history); a crew member can
always fall back to manual entry without data loss; unpair/re-pair behavior matches
the automated suite's guarantees (idempotent unpair, rejected linking of an
already-unpaired pairing) when triggered by a real dropped connection, not just a
direct API call.

## Non-functional reviews

These are qualified-reviewer activities, not device drills, but are Stage 14 exit-gate
requirements per issue #71:

- **Security/privacy penetration review.** Scope: the deployed API gateway, mobile app
  binary, and object storage. Start from `docs/ops/security-compliance.md` as the
  baseline control set already implemented (JWT verification, RBAC enforcement, rate
  limiting, PHI-safe logging, encrypted object storage, device revocation) — the review's
  job is to find what that baseline missed, not re-verify what's already covered by
  `services/api-gateway/test/*`. A qualified external or internal security reviewer,
  independent of this build, must sign off.
- **Clinical-safety/hazard review.** Scope: every clinical workflow path in Stages 6–13
  (assessment, medication, procedure, disposition, refusal, amendment, QA flagging).
  Reviewer: a qualified clinical safety officer. Focus specifically on failure modes a
  code review cannot catch — e.g., whether a discrepancy warning is *clinically*
  actionable in the moment it's shown, not just technically correct.
- **Backup/DR verification, at field scale.** `docs/ops/07-disaster-recovery-runbook.md`
  already specifies the mechanics; Stage 14's job is running an actual restore drill
  against a copy of real (de-identified, if using production-shaped data) field data
  volume, timing it, and confirming the RTO/RPO in that runbook hold at real scale.

## Release process

- Signed release builds for both platforms, built from the exact commit that passed
  every drill above (record the commit SHA in the execution log).
- Documented rollout plan (phased/staged rollout vs. all-at-once) and rollback plan
  (what triggers a rollback, and the actual mechanical steps — app-store rollback
  mechanics differ meaningfully between Android and iOS and both must be rehearsed, not
  just documented).
- Support process: an on-call/escalation path for a crew hitting an issue in the field
  during initial rollout, distinct from ordinary engineering support.
- Training materials and a training session for crews, dispatchers, and clinical
  reviewers, covering at minimum: offline charting behavior, what a QA flag means and
  what to do about it, and the device-revocation "contact your supervisor" flow from
  Scenario 7.

## Execution log

Every scenario run gets one row: scenario, device/OS/network condition, date, tester,
commit SHA under test, result (pass/fail/blocked), and a link to any filed defect. Keep
this log in the same repository (a simple table or linked spreadsheet is fine) so exit-gate
sign-off can point at it directly rather than relying on memory. A scenario is not
"done" until it has a passing row on **both** platforms at minimum once.

All rows below are Android emulator runs on the Windows-native topology, synthetic data only,
by Claude Code under user direction. No iOS run exists yet, so no scenario is complete.
Evidence detail: `docs/STAGE14_EXECUTION_REPORT_2026-09-17.md`, section "Windows-native
environment and C2 acceptance — 2026-09-20".

| Scenario | Device / OS / network | Date | Tester | Commit under test | Result | Defect |
|---|---|---|---|---|---|---|
| Environment: Windows bootstrap, `vems-dev` stack, adapters, idempotent rerun | Windows 11, Docker Desktop, loopback | 2026-09-20 | Claude Code | `52a4dd8`, then `48529e4` | PASS | Fixed in `52a4dd8`, `48529e4` |
| Android debug build, install, non-mutating smoke (sign-in to jobs list) | Pixel_Tablet AVD, Android 15 (API 35), x86_64, `10.0.2.2` to host | 2026-09-20 | Claude Code | `52a4dd8` (APK) | PASS | none |
| Section A navigation: jobs list, incident workspace, patient case, vitals form | Pixel_Tablet AVD, Android 15, `10.0.2.2` | 2026-09-20 | Claude Code | `48529e4` (API), `52a4dd8` (APK) | PASS | none |
| C2: vitals recorded through the rendered UI (one tap, PCR-000002) | Pixel_Tablet AVD, Android 15, `10.0.2.2` | 2026-09-20 | Claude Code | `48529e4` (API), `52a4dd8` (APK) | PASS | none |
| Scenario 1 golden path, transported-to-facility (PCR-000003) | Pixel_Tablet AVD, Android 15, `10.0.2.2` | 2026-09-20 | Claude Code | `48529e4` + working-tree fix (later committed) | FAIL | PDF omits vitals and other charted items (D2); transported readiness threw ReferenceError (D1, fixed) |
| Scenario 1 repeat, refusal outcome (PCR-000004) | Pixel_Tablet AVD, Android 15, `10.0.2.2` | 2026-09-20 | Claude Code | as above | FAIL | PDF omits the refusal and capacity documentation (D2); only one signature per version (D4b) |
| Scenario 1 PDF-content criterion, re-export of PCR-000003 and PCR-000004 after the D2 fix (export format 2) | Windows host API, Pixel_Tablet data as above | 2026-09-20 | Claude Code | this commit | PASS (criterion only; scenario not re-run end to end) | D2 fixed |
| Scenarios 2 to 10 | not executed | | | | NOT RUN | |

## Exit gate

Per issue #71, restated as checkable conditions:

- [ ] Every scenario in this catalog has at least one passing execution-log row on both
      Android and iOS.
- [ ] Scenario 10 (device pairing and vitals-monitor integration) has at least one
      passing execution-log row per named-vendor driver Stage 15 milestone 15g ships —
      not just once overall, since each vendor's real GATT behavior is distinct.
- [ ] The security/privacy penetration review and clinical-safety/hazard review are both
      complete with sign-off, and every critical/high finding from either is resolved
      (not merely triaged) before release.
- [ ] The backup/DR field-scale drill has a passing execution-log row with measured
      RTO/RPO meeting `docs/ops/07-disaster-recovery-runbook.md`'s targets.
- [ ] Signed release builds exist for the commit that passed every drill, with rollout,
      rollback, support, and training materials all reviewed and ready.
- [ ] No unresolved critical/high safety or security finding remains open anywhere in
      the execution log.

Stage 14, and with it the full V-EMS build-out (Stages 6–14) plus Stage 15's
device-integration path folded into it via Scenario 10, is complete only when every
box above is checked.

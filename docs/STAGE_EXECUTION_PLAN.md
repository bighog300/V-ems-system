# ePCR Stage Execution Plan (Stages 8–14)

Sequencing and milestone breakdown on top of the per-stage scope already defined in
[`EPCR_MOBILE_COMPLETION_PLAN.md`](EPCR_MOBILE_COMPLETION_PLAN.md) and tracked in
issue [#72](https://github.com/bighog300/v-ems-system/issues/72). That plan and its
linked issues (#65–#71) already carry the detailed task/acceptance-criteria checklists
per stage — this document is the "what order, what's parallelizable, what's the risk"
layer on top, so it deliberately doesn't repeat those checklists.

## Status snapshot (as of this update)

| Stage | Issue | State |
|---|---|---|
| 6 — Multi-patient patient cases | #63 | Merged |
| 7 — Complete clinical record model | #64 | Merged (PR #73). **Note:** issue #72's checklist still shows #64 unchecked — stale, worth ticking off. |
| 8 — Signatures/finalization/QA | #65 | Implemented, **PR #74 open and unmerged**, CI not yet reported |
| 9 — Mobile app foundation | #66 | Not started |
| 10 — Offline-first sync | #67 | Not started |
| 11 — Mobile field UX/hardware | #68 | Not started |
| 12 — Production infrastructure | #69 | Not started |
| 13 — Compliance/reporting/governance | #70 | Not started |
| 14 — Field validation/release | #71 | Not started |

**Immediate next step, before anything else in this plan:** get PR #74 through CI and
merged. Everything from Stage 9 onward builds on the Stage 8 API/lifecycle contracts,
so an unmerged, unreviewed Stage 8 is a hard blocker, not a parallel track.

## Why this order

The dependency chain in the underlying issues is real, not just suggested — Stage 9
explicitly depends on 6–8 (it charts against the Stage 7 clinical APIs and Stage 8
readiness/signature APIs), Stage 10 depends on Stage 9 existing, Stage 11 depends on
9–10, Stage 12 depends on the model stabilizing, and Stage 13 depends on 7/8 plus
Stage 12's infrastructure. Stage 14 depends on all of it. So the mobile/offline spine
(9 → 10 → 11) and the infrastructure/compliance spine (12, 13) are the two tracks that
matter; 14 is the closing gate.

## Track A — Mobile/offline spine (primary path, sequential)

This is the long pole. Each step needs the previous one's contracts to exist before it
can be built against, so treat it as sequential even though the underlying issues have
internal parallelism (e.g. Android/iOS build config work within Stage 9 can overlap).

1. **Stage 9 — Mobile foundation** (#66)
   - Milestone 9a: framework ADR (React Native/Expo per the plan's default) + `apps/mobile-crew` scaffold, auth bootstrap, secure token storage, encrypted local DB.
   - Milestone 9b: read/navigate flows — assigned jobs, incident context, patient-case list/select.
   - Milestone 9c: write flows — demographics, encounter, assessment/vitals/history/interventions/medications/transport/handover against Stage 7 APIs, plus Stage 8 readiness/signature UI.
   - Milestone 9d: Android debug/release build + iOS build config, physical-device smoke test.
   - Exit gate: one full connected-mode PCR chartable end-to-end on the app.

2. **Stage 10 — Offline-first sync** (#67)
   - Milestone 10a: durable local outbox + client-generated idempotency identities for every offline-capable write (this is the piece most likely to need real design time — get the conflict policy and sync-state model written down before coding).
   - Milestone 10b: sync engine (queued/sending/acknowledged/retrying/conflict/failed) with background/foreground orchestration and backoff.
   - Milestone 10c: hostile-condition tests — app kill, device reboot, token expiry mid-queue, duplicate/out-of-order delivery.
   - Exit gate: full PCR completed offline, device restarted, reconnect produces no duplicate/lost clinical or stock records.

3. **Stage 11 — Field UX/hardware** (#68)
   - Rapid vitals/med entry, barcode/QR scanning, camera/document capture, GPS, push notifications, biometric unlock, signature canvas, tablet layouts.
   - This stage is naturally decomposable into independent feature slices once 9–10 land — a good place to parallelize across contributors if more than one person is working the mobile app.
   - Exit gate: realistic field workflow with attachments/notifications passes online and offline on physical devices.

## Track B — Infrastructure & governance (can start early, overlaps Track A)

Per the plan's own overlap notes, design/research on these can start now rather than
waiting for Stage 11 to finish:

4. **Stage 12 — Production infrastructure** (#69) — *design can start alongside Stage 9*
   - Milestone 12a (can start now): Postgres migration design, object-storage/encryption design, OIDC/secrets approach — these don't depend on the mobile app existing.
   - Milestone 12b (needs Stage 9–10 contracts stable): actual migration off SQLite while preserving idempotency/audit/outbox semantics, attachment storage wired to Stage 11's capture features, load testing with real mobile sync traffic.
   - Exit gate: Postgres + object storage + identity stack passes full regression suite and a backup/restore drill.

5. **Stage 13 — Compliance/reporting/governance** (#70) — *terminology/jurisdiction research can start now*
   - Milestone 13a (can start now): jurisdiction minimum-dataset research, canonical terminology model design — this is largely research/data-modeling work independent of mobile/infra.
   - Milestone 13b (needs Stage 8 finalization model + Stage 12 infra): PDF/report generation, retention/legal-hold, access-history reporting, export/schema compatibility tests.
   - Exit gate: finalized PCR renders a complete signed/versioned report under a deployment profile with full audit trail.

## Track C — Closing gate (sequential, last)

6. **Stage 14 — Field validation & release** (#71)
   - Test-plan drafting can start early (per the underlying plan), but the actual drills need 6–13 complete: physical-device matrix, MCI/multi-patient drill, offline/app-kill/reboot drill, outage drills for all three systems, security/clinical-safety review, signed release builds, rollout/rollback process.
   - Exit gate: end-to-end dispatch → care → handover → QA → final report passes on physical devices with no unresolved critical/high findings.

## Recommended near-term sequence

1. Get PR #74 (Stage 8) reviewed, CI green, merged. Tick off #64/#65 on issue #72.
2. Write the Stage 9 mobile-framework ADR and scaffold `apps/mobile-crew` (#66, milestone 9a) — this is the actual next unblocked work.
3. In parallel if capacity allows: start Stage 12's Postgres/object-storage design doc and Stage 13's jurisdiction/terminology research (#69/#70, the "can start now" milestones) — low-risk to start early, high-risk to leave until Stage 11 is done since they can reshape data models Stage 9–11 will build on.
4. Treat Stage 10's conflict-policy design as a design task to finish *before* Stage 9's write flows are considered done — retrofitting conflict handling after the UI assumes always-online is the most expensive mistake this roadmap could make.

## Open decisions worth resolving before Stage 9 starts

- Mobile framework: confirm React Native/Expo or write the ADR that picks something else — this gates all of Track A.
- Conflict policy for concurrent edits (demographic edits, clinical event append, signatures/finalization, assignment changes) — referenced as a Stage 10 task but easier to decide before Stage 9's data model is locked in.
- Postgres migration timing — doing Stage 12's schema migration before or after Stage 9-11 changes the ePCR write model is a real sequencing choice; this plan assumes design-now/migrate-later, but confirm that's acceptable given no production traffic exists yet.

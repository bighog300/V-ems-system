# Stage 16 — Production Hardening: Milestone Plan

Follows Stage 15 (crew tablet + device integration, merged in full — landscape tablet
shell, patient identity search/history, structured notes, BLE vitals-monitor driver
framework, device-pairing/provenance registry, LIFEPAK 15/LIFENET integration, and the
Stage 14 drill-catalog fold-in).

## Why this stage exists, and what it is not

Stages 6–15 built a feature-complete single-agency EMS platform and specified how to
validate it in the field (Stage 14). Nothing in that arc addresses what changes once
the platform has to run in production for real: a second (or third, or hundredth)
agency, credentials that need to rotate without a deploy, an operator who needs to know
something broke before a crew member reports it, and a release process that can
actually ship a signed build to an app store. This stage is that work.

**This is not Stage 14.** Stage 14 is real-device, real-crew *validation* of behavior
already built. Stage 16 *builds* the operational infrastructure Stage 14's own exit
gate already assumes exists (signed release builds, rollout/rollback plans, an on-call
path) and closes architectural gaps (single-tenant schema, one globally-active
compliance profile, credentials read straight from `process.env`) that don't block a
single-agency pilot but block calling this platform "production."

**Out of scope, and why:**
- Actually running Stage 14's drills, or executing the security/clinical-safety
  reviews it specifies. Those need real devices, real crews, and qualified external
  reviewers this session cannot stand in for — unchanged from Stage 14's own scoping.
- Completing 15g's LIFENET transport against a real endpoint/schema. That is blocked on
  Physio-Control's actual data-sharing agreement, not on anything a hardening stage can
  unblock.
- New clinical features. Every milestone below is infrastructure, operations, or a
  second real deployment configuration — nothing here changes what a crew charts.

## Current state, as it actually is (not assumed)

Grounding each milestone below in what the codebase actually does today, not a generic
production-readiness checklist:

- **Single tenant, single active compliance profile.** No `tenant_id`/`agency_id`
  column exists anywhere in the schema. `services/orchestration/src/compliance/registry.mjs`'s
  `getActiveProfile()` reads one profile ID from `VEMS_COMPLIANCE_PROFILE`, globally,
  for the whole deployment. Only one profile (`reference-nemsis.mjs`) has ever been
  built or tested — the registry seam Stage 13 built for "swap a real jurisdiction's
  profile through" has never actually been exercised with a second profile.
- **Credentials are raw environment variables.** Every adapter transport factory in
  `services/orchestration/src/adapters/transports.mjs` (OpenEMR, Vtiger, LIFENET, Expo
  push) reads its token/secret directly from `process.env` with no rotation mechanism —
  rotating a credential means a redeploy, not an operation.
  Not a defect in the code as written (see `docs/ops/security-compliance.md`, which is
  a real, already-implemented control baseline for RBAC/JWT/rate-limiting/PHI-safe
  logging); rotation-without-redeploy is simply a capability that was never built.
- **No error-tracking or metrics/alerting vendor integration exists.**
  `services/api-gateway/src/server.mjs` emits structured JSON logs per request
  (`request_received`/`rbac_evaluated`/`request_completed`/`request_failed`), which is
  a real, useful signal — but nothing ships those logs anywhere, turns them into a
  dashboard, or pages anyone. `docs/ops/09-capacity-and-load-testing.md` already
  measured throughput; nothing watches it in production.
- **The mobile release pipeline builds an unsigned Android debug APK and nothing
  else.** `.github/workflows/mobile-crew-android-build.yml` runs `expo prebuild` +
  `gradlew assembleDebug` and uploads the artifact — there is no iOS build, no code
  signing on either platform, and no store-submission or staged-rollout mechanism,
  despite an `eas.json` already present with `production`/`preview` build profiles
  defined but never invoked by CI.
- **No on-call/escalation tooling exists.** Stage 14's release-process section names
  "an on-call/escalation path for a crew hitting an issue in the field" as an exit-gate
  requirement; nothing in the codebase or `docs/ops/` implements one.

## Milestones

Same incremental-PR pattern as Stages 6–15 — each independently reviewable and
testable. 16a is a prerequisite for 16e and 16f (both need a real tenant concept to
onboard into or scope a profile to); everything else is independent and can ship in
any order.

1. **16a — Multi-tenancy foundation.** A `tenant_id`/`agency_id` column added to every
   tenant-scoped table (incidents, patient_cases, vehicles, personnel, stock_items, and
   their dependents), threaded through RBAC context and every repository query. Backend
   only — no new client screens. The compliance-profile registry's `getActiveProfile()`
   becomes tenant-aware (`VEMS_COMPLIANCE_PROFILE` becomes a per-tenant setting, not a
   single global env var). Existing single-tenant deployments get a default tenant row
   via migration, so this ships with zero behavior change until a second tenant exists.
2. **16b — Secrets management and rotation.** Replace direct `process.env` reads in
   `adapters/transports.mjs` with a secrets-provider abstraction (interface first,
   mirroring the adapter/transport pattern already used throughout this codebase) with
   at least one real backing implementation (e.g. AWS Secrets Manager or HashiCorp
   Vault — chosen against the deployment's actual infrastructure, not guessed here) and
   a documented rotation runbook. Every existing adapter (OpenEMR, Vtiger, LIFENET,
   Expo) resolves its credential through the new abstraction; none change their own
   logic.
3. **16c — Observability: metrics, dashboards, alerting, error tracking.** Ship the
   existing structured request logs to a real metrics/log pipeline, build dashboards
   against the SLOs a production deployment actually needs (request latency/error rate,
   sync-worker lag, OpenEMR/Vtiger/LIFENET downstream health — the same dependencies
   `/api/support/diagnostics` already reports on, now graphed and alerted on rather than
   polled), and integrate an error-tracking vendor for unhandled exceptions on both the
   API gateway and the mobile app.
4. **16d — Signed mobile release pipeline.** An iOS build workflow alongside the
   existing Android one; real code signing on both platforms using `eas.json`'s
   already-defined `production` profile (currently unused by CI); a staged/phased
   rollout mechanism (percentage rollout or ring deployment, whichever each app store's
   real mechanics support — verified against real store documentation, not assumed);
   and the rollback runbook Stage 14's release-process section requires but never
   specifies mechanically.
5. **16e — Tenant onboarding and data-migration tooling.** Scripted setup for a new
   agency joining a multi-tenant deployment (16a): seed vehicles/personnel/stock items,
   assign RBAC roles, select and validate a compliance profile, and a dry-run/validation
   mode that catches a bad onboarding config before it's live. Depends on 16a.
6. **16f — Second jurisdiction compliance profile.** Build and test a real second
   compliance profile against `services/orchestration/src/compliance/`'s existing
   registry/validation framework — proving 13a's "swap a real jurisdiction's profile
   through" seam actually works with a second profile, not just the one it was built
   against. Requires the deployment to name the actual second jurisdiction/dataset
   standard (e.g. a different NEMSIS version, or a non-US equivalent) — flagged as a
   blocking input, not guessed, matching this build's established practice for
   real-world specifics (15b's barcode symbology, 15g's LIFENET schema). Depends on 16a
   for a place to scope the second profile to.
7. **16g — On-call and support tooling.** The actual escalation path Stage 14 names as
   an exit-gate requirement: paging/on-call rotation integration (tied to 16c's
   alerting), a support runbook for a crew-reported field issue distinct from ordinary
   engineering support, and confirmation that `/api/support/diagnostics` and
   `/api/support/sync-intents/{id}/replay` (already built) are the tools that runbook
   actually points support staff to.

## Exit gate

- [ ] A second tenant can be onboarded (16e) and operate with its own compliance
      profile (16a/16f) with zero cross-tenant data visibility, verified by automated
      tests exercising RBAC/query scoping across two tenants.
- [ ] Every credential currently read from `process.env` is resolved through the 16b
      secrets abstraction in at least one real deployment, with a documented and
      exercised rotation procedure.
- [ ] Dashboards and alerting (16c) cover the same dependency set
      `/api/support/diagnostics` already reports on, with alerting thresholds tied to
      `docs/ops/09-capacity-and-load-testing.md`'s measured baselines.
- [ ] Signed release builds exist for both platforms via CI (16d), with a rehearsed
      (not just documented) rollback for each app store.
- [ ] The on-call/escalation path (16g) has been used at least once in a drill,
      satisfying the same requirement Stage 14's release-process section names but
      leaves unbuilt.

Stage 16 is complete only when every box above is checked — at which point the
platform, not just its features, is ready to run in production for more than one
agency.

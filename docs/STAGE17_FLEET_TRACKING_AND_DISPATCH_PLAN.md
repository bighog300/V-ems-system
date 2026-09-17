# Stage 17 — Fleet GPS Tracking and Dispatch Allocation: Milestone Plan

Follows Stage 16 (production-hardening plan, scoped but not yet built) and the
dispatcher-console review that surfaced this stage's reason to exist.

## Why this stage exists, and what it is not

A review of `apps/web-control` (the only operator-facing app) against the backend it
calls found that the "dispatcher board" is entirely read-only: it monitors incidents
with good urgency grouping and KPIs, but has no UI to create an incident from an
incoming call or assign a vehicle/crew to one — despite the backend already supporting
both (`POST /api/incidents`, `POST /api/incidents/{id}/assignments`, tested and
RBAC'd). Separately, no vehicle GPS/live-location tracking exists anywhere in this
codebase; the only location capture today is Stage 11's one-shot clinical-event
capture (`apps/mobile-crew/src/location/captureLocation.ts`), foreground-only,
per-event, not continuous fleet tracking. This stage builds both: the dispatch
console's missing write path, and the live-fleet-visibility capability a real dispatch
operation needs to allocate and reassign resources well.

**Out of scope, and why:**
- Turn-by-turn navigation or a routing/traffic engine. The crew tablet already has a
  `Navigate` deep link (15a) into the device's own maps app for point-to-point
  routing — this stage adds dispatcher-side visibility of where vehicles *are*, not a
  competing navigation product.
- Automatic (non-suggested) dispatch. 17g below is explicitly a *suggestion* a
  dispatcher acts on, never an auto-assign — matching how this codebase has
  consistently kept a human in the loop for consequential actions (RBAC-gated writes,
  explicit confirmation dialogs in the crew app).
- Multi-tenancy-aware fleet views. Stage 16's 16a (multi-tenancy foundation) isn't
  built yet; if it lands first, fleet queries here get tenant-scoped the same way
  every other query would, but building that scoping twice is wasted work.

## Current state, grounded in the actual code

- **No vehicle location data exists anywhere.** No `vehicle_locations` table, no
  location column on `vehicles`, no reporting endpoint. Confirmed by searching the
  whole monorepo for any GPS/live-location reference outside the one-shot clinical
  capture.
- **`vehicles.operational_status` already has GPS-relevant states** (`Available`,
  `Reserved`, `Assigned`, `En Route`, `On Scene`, `Transporting`,
  `Returning to Base`, `Restocking` — `services/api-gateway/src/server.mjs`'s
  `VEHICLE_OPERATIONAL_STATUSES`), a real foundation a fleet map can color-code
  against immediately.
- **The assignment state machine already models reassignment** —
  `packages/shared/src/state-machine.mjs`'s `assignmentTransitions` includes
  `Active:reassign_assignment -> Reassigned` — but `updateAssignment()` in
  `services/orchestration/src/index.mjs` only ever changes `status`; `vehicle_id` and
  `crew_ids_json` are fixed at row creation (`migrations/001_initial_schema.sql`).
  A real reassignment (different vehicle/crew) is therefore stand-down-current +
  create-new today, not an in-place edit — 17f formalizes that as one dispatcher
  action rather than two manual steps.
- **`apps/mobile-crew/src/location/captureLocation.ts` is foreground-only and
  one-shot** (`expo-location`'s `getCurrentPositionAsync`, called once per clinical
  event). Continuous fleet tracking needs background permission
  (`requestBackgroundPermissionsAsync`/`startLocationUpdatesAsync`), a materially
  larger privacy/permissions surface with real app-store review implications —
  flagged as a blocking design decision in 17c, not assumed away.
- **The dispatcher board's client API (`apps/web-control/src/api.mjs`) has no
  `createIncident` and no assignment call at all.** Every write it makes is
  patient-case/encounter-scoped or `closeIncident`. This is a pure UI gap — the
  backend endpoints exist, tested, RBAC'd to `dispatcher` already.

## Milestones

Same incremental-PR pattern as Stages 6–16 — each independently reviewable and
testable. 17a has no dependencies and closes the most basic functional gap first.
17c/17d depend on 17b (a place to report/read positions). 17f depends on 17e (reuses
its vehicle/crew picker). 17g depends on 17b/17d (needs live positions) and 17e (needs
somewhere to surface into). 17h is lower-priority polish, independent otherwise.

1. **17a — Call intake UI.** The dispatcher board gains a call-intake form (call
   source, received-at, category, priority, description, address, patient count)
   wired to the already-tested `POST /api/incidents`. Closes the most basic gap found
   in the console review: today nothing in this codebase lets a dispatcher actually
   create an incident from a call. No backend changes.
2. **17b — Vehicle location data model and reporting API (backend).** A
   `vehicle_locations` table (or last-known-position columns on `vehicles`, decided
   during implementation against real query patterns) plus `POST
   /api/vehicles/{id}/location` (report a position) and a fleet-snapshot read
   endpoint. RBAC: reporting restricted to the vehicle's own assigned crew device
   (mirroring how `field_crew`/`field_crew_lead` are already scoped to their own
   assignment elsewhere); reading restricted to dispatcher-and-above, matching
   `/api/vehicles`'s existing RBAC. No client changes — proves the data model and API
   against fakes/synthetic positions first.
3. **17c — Crew tablet background GPS reporting (client).** Background location
   permission request/consent flow, a periodic (battery-aware interval, not
   continuous high-frequency) reporting job posting to 17b's endpoint. Explicit
   blocking design decisions, flagged rather than guessed: reporting interval/battery
   tradeoff, what happens offline (queue and replay like other patient-case-scoped
   mutations, or a distinct fire-and-forget model — decide and document, don't
   silently pick one), and the real iOS/Android background-location permission
   disclosure text app-store review requires. Depends on 17b.
4. **17d — Dispatcher live fleet map.** A map view on the dispatcher board (alongside,
   not replacing, the existing urgency-grouped card list) showing every vehicle,
   color-coded by `operational_status`, with a staleness indicator (age since last
   report) so a dispatcher can distinguish "stopped reporting" from "stationary."
   Depends on 17b; can be built and tested against 17b's API with synthetic positions
   before 17c ships real ones.
5. **17e — Assignment picker UI.** A vehicle + crew picker on the incident detail
   side-panel, filtered to `operational_status: Available` and
   `service_status: Serviceable`, wired to the already-tested `POST
   /api/incidents/{id}/assignments`. Closes the second gap found in the console
   review. No GPS dependency — ships independently of 17b–17d.
6. **17f — Real reassignment as one action.** Formalizes "stand down the current
   assignment, create a new one against a different vehicle/crew" (today two manual
   API calls) into a single dispatcher action reusing 17e's picker. Audit trail via
   the existing `service.audit()` call already made in `updateAssignment`; push
   notification to both the newly assigned crew and the crew being reassigned away
   (the `pushIntent` call already exists in `updateAssignment`, extended to cover the
   displaced crew, not just the newly assigned one). Depends on 17e.
7. **17g — Nearest-available-unit suggestion.** A backend calculation (distance,
   and ETA if a routing estimate is available) ranking `Available`/`Serviceable`
   vehicles by proximity to an incident's address/coordinates, surfaced in 17e's
   picker as a ranked suggestion — never an auto-assign; the dispatcher always picks.
   Depends on 17b/17d for live positions and 17e for a picker to rank within.
8. **17h — Multi-unit (MCI) assignment and historical trail.** Two smaller,
   independent additions bundled as this stage's polish milestone: assigning several
   vehicles to one incident from 17e's picker (the backend already supports multiple
   patient cases per incident; assignment creation is already a repeatable action, so
   this is mostly a UI affordance for "assign another unit" rather than new backend
   work), and a breadcrumb/trail view over 17b's location history for a specific run
   (QA/after-action use, not live ops). Depends on 17b/17e.

## Exit gate

- [ ] A dispatcher can take a call and create an incident entirely from the console
      (17a), with no other tool required.
- [ ] Every vehicle with a reporting crew device shows a live position on the
      dispatcher fleet map (17b–17d), with staleness visibly flagged rather than
      silently stale.
- [ ] A dispatcher can assign a vehicle/crew to a new incident (17e) and reassign an
      already-assigned unit to a different incident (17f) entirely from the console,
      with the same audit trail and crew notification guarantees the backend already
      provides.
- [ ] The nearest-available-unit suggestion (17g) is present but never bypasses
      dispatcher judgment — verified by a test asserting the suggestion is advisory
      data in the response, not an assignment side effect.
- [ ] MCI multi-unit assignment and the historical trail view (17h) both have
      passing test coverage exercising the real multi-patient-case /
      multi-assignment paths already proven elsewhere in this codebase.

Stage 17 is complete only when every box above is checked — at which point the
dispatcher console can do the two things a dispatch operation actually needs: know
where every unit is, and put the right one on the next call.

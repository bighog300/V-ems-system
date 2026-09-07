# Stage 10 — Offline-First Sync: Execution Plan

Tracking: issue [#67](https://github.com/bighog300/v-ems-system/issues/67). Builds on the
`apps/mobile-crew` app shipped in Stage 9 (#66, PRs #76–#88) and the backend
idempotency-key architecture already used by Stages 6–8's mutating endpoints.

This is the milestone-level "what order, what's the risk, what's out of scope" layer —
issue #67 already carries the full task/acceptance-criteria checklist and isn't
repeated here.

## Where Stage 9 leaves off

Stage 9's mobile app is entirely online-only today: every screen calls its API module
(`src/api/*.ts`) directly against `fetch`, with no local write buffering. If the device
loses connectivity mid-chart, the write simply fails and the crew sees an error banner
(`setError(...)` in every screen) — nothing is queued, nothing is retried automatically.
Stage 10 replaces that failure path with a durable local outbox and a sync engine, for
every mutating call the app makes.

## Backend groundwork already in place — and the one real gap

The backend already has the exact mechanism an offline outbox needs: a global
`idempotency-key` request header (read once in `services/api-gateway/src/server.mjs:629`
and threaded into every orchestration call as `meta.idempotencyKey`), backed by
`IdempotencyKeyRepository` (`scope` + `idempotency_key` + `resource_id` +
`request_fingerprint`, `INSERT OR IGNORE`-safe). A replayed request with the same key and
the same fingerprint returns the original resource instead of creating a duplicate; a
reused key with a *different* fingerprint is rejected with 409. That's precisely the
"exactly-once… on replay" acceptance criterion in issue #67 — largely already solved.

**But it isn't wired everywhere the mobile app needs it.** In
`services/orchestration/src/clinical-record.mjs`, `createPatientCaseMedication` and
`createPatientCaseProcedure` check `meta.idempotencyKey` before writing (lines 107 and
125). `createPatientCaseAssessment`, `createPatientCaseObservation`, and
`setPatientCaseDisposition` do not — replaying any of those three today creates a
duplicate assessment/observation, or silently re-saves a disposition. That gap is
concrete, small, and blocks everything else in this stage: an outbox that replays
against a non-idempotent endpoint doesn't give you exactly-once, it gives you
duplicates-once-you're-unlucky.

## Design decisions

### Local storage: `expo-sqlite` + field-level encryption, not SQLCipher

Stage 9's ADR (`docs/adr/0001-mobile-crew-framework.md`) picked Expo's managed workflow
specifically to avoid native build complexity. SQLCipher (the usual "encrypted SQLite"
answer) needs a native config plugin and changes the build story `BUILD.md` just
documented in Stage 9. Recommended instead: plain `expo-sqlite` for structure (ids,
scope, status, timestamps, retry counts — nothing PHI-bearing, needed in the clear for
querying/sorting the outbox), with the JSON request payload itself AES-256-GCM encrypted
before it's written, using a key generated on first launch and held in
`expo-secure-store` (the same primitive `src/auth/session.ts` already uses for the
session token). This satisfies "encrypted local database for offline ePCR data" without
a native toolchain change. Worth a second opinion before committing — this is the one
decision in this plan with a real alternative (SQLCipher) that trades build complexity
for defense-in-depth if the SecureStore key itself were ever compromised.

### Outbox shape

One table, one row per pending mutation:

```
outbox_entries(
  entry_id TEXT PRIMARY KEY,       -- client-generated UUID; reused as the idempotency-key header
  scope TEXT NOT NULL,             -- "medication" | "procedure" | "observation" | "assessment" | "disposition" | "demographics" | "encounter" | ...
  patient_case_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  encrypted_payload BLOB NOT NULL,
  status TEXT NOT NULL,            -- queued | sending | acknowledged | retrying | conflict | failed
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TEXT,
  last_error TEXT,
  server_resource_id TEXT,
  created_at TEXT NOT NULL
)
```

`entry_id` is generated client-side at the moment the crew taps "Record" — before any
network call — and is sent as the `idempotency-key` header on every attempt, online or
offline. That means the *online* path changes too: even a same-session, never-queued
write becomes idempotent-safe against double-taps or a dropped response, which is a
correctness improvement independent of connectivity.

### Conflict policy, by write type

- **Append-only clinical events** (observations, assessments, medications, procedures):
  no real conflicts are possible by construction — replay returns the existing record.
  Once 10a closes the idempotency gap above, this category needs no further conflict
  handling.
- **Upserts** (demographics, disposition): last-write-wins by `updated_at`, *except*
  reject when `assertPatientCaseClinicalMutable` says the case is already finalized —
  surfaced to the crew as an explicit conflict entry ("this case was finalized elsewhere,
  your change wasn't applied"), never silently dropped.
- **Lifecycle transitions** (Stage 8's complete/sign/submit): highest risk — a state
  machine transition, not a value, so two devices completing the same ePCR offline is a
  real scenario. The state machine already rejects invalid transitions; the sync engine
  should treat that rejection as "already applied elsewhere, not an error" rather than
  something to retry.
- **Assignment/incident data**: crew-app is read-only here (assignments come from
  dispatch), so this category is out of scope for conflict handling — only a
  freshness/staleness concern for the read cache below.

### Sync triggers — no OS-level background execution in this stage

True silent background sync (woken by the OS, not the app) needs push notifications and
background task registration, which is explicitly Stage 11 scope (`push assignment
notifications` is a Stage 11 outcome, not Stage 10's). Scoping that into Stage 10 would
blow up this stage's size for marginal benefit before Stage 11's infrastructure exists
anyway. Stage 10's sync triggers: app foreground/focus (`AppState`, already used for
app-lock in `RootNavigator`), a network-reconnect event via `@react-native-community/netinfo`,
and a manual "Sync now" affordance. Foreground-timer-based periodic sync while the app is
open is in scope; OS-woken background sync is not.

### Read-path caching is in scope, and shares the same storage

Issue #67's acceptance criteria implicitly require more than write-buffering — a crew
needs to *navigate* to a patient case while offline, which today requires a successful
GET. Scope: cache the last successful response per screen-relevant GET (assignments,
patient case, encounter, observations/assessments/medications/procedures lists) in the
same local DB, keyed by URL, with a "showing cached data — offline" affordance rather
than a blank error state. This reuses the outbox's storage/encryption layer instead of
building a second cache mechanism.

## Milestones

Same incremental-PR pattern Stage 9 used (9a–9j) — each step is independently reviewable
and testable, and later steps depend on earlier ones' contracts existing.

1. **10a — Backend idempotency completeness.** Add `meta.idempotencyKey` handling to
   `createPatientCaseAssessment`, `createPatientCaseObservation`, and
   `setPatientCaseDisposition`, mirroring the existing medication/procedure pattern in
   the same file. Backend-only, small, unblocks everything else.
2. **10b — Local storage layer.** `src/offline/db.ts` (expo-sqlite schema + migrations),
   `src/offline/crypto.ts` (key generation/retrieval via SecureStore, encrypt/decrypt
   helpers). Unit-testable in isolation, same pattern as `session.ts`'s injectable-store
   tests.
3. **10c — Outbox write path.** Every mutating call in `src/api/*.ts` gains an
   offline-aware wrapper: generate `entry_id`, attempt the network call with that
   idempotency key, and on failure (or when already known-offline) write to the outbox
   instead of throwing. Screens keep their existing optimistic-UI patterns.
4. **10d — Sync engine.** Processes `queued`/`retrying` entries in creation order per
   `patient_case_id` (ordering matters within a case — e.g. encounter before
   observations), exponential backoff, the trigger set from the design section above.
5. **10e — Conflict/failure surfacing.** A sync-status affordance (badge + detail screen)
   so `conflict`/`failed` entries are visible to the crew without exposing raw
   payloads/PHI — satisfies the "sync diagnostics visible to crew without exposing
   PHI/secrets" acceptance criterion directly.
6. **10f — Read-path caching.** Cached-GET layer + offline indicators on the screens that
   need it (JobsList, PatientCaseDetail, and the clinical charting screens).
7. **10g — Hostile-condition test suite.** App-kill mid-write (simulate by not clearing
   in-memory queue state, only re-reading from the DB on next launch), duplicate
   delivery, out-of-order delivery, token-expiry-mid-queue (re-auth without losing queued
   entries — the queue survives sign-out/sign-in since it's keyed by patient case, not
   session).
8. **10h — Manual verification.** Airplane-mode PCR completion drill: chart a full PCR
   with networking disabled, force-quit the app, relaunch, reconnect, confirm no
   duplicate/lost records server-side. This is issue #67's actual exit gate and needs a
   real device/emulator, which (like Stage 9's device-install acceptance criterion) this
   sandbox can't perform — flag it the same way for follow-up outside this environment.

## Open decisions before 10b starts

- **Encryption approach**: field-level AES via SecureStore-held key (recommended above)
  vs. SQLCipher native plugin. Worth explicit confirmation since it's a real trade-off,
  not an obvious default.
- **Retry ceiling**: is there a maximum retry count/age after which a `failed` entry stops
  auto-retrying and requires explicit crew acknowledgment, or does it retry forever in
  the background? Affects both the sync engine's state machine and the conflict-UI
  design in 10e.
- **Blocking behavior**: should an unresolved conflict/failed entry ever block the crew
  from continuing to chart the same patient case, or only surface a non-blocking banner?
  Recommendation: never block charting — only block re-attempting the specific
  conflicting action (e.g. don't let them re-submit a finalization that already
  conflicted) — but this is a product call, not just an engineering one.

# Stage 13 — Compliance, Reporting and Clinical Governance: Execution Plan

Tracking: issue [#70](https://github.com/bighog300/v-ems-system/issues/70). Builds on
Stage 12's completed production infrastructure (issue #69, merged in full — Postgres,
encrypted object storage, device revocation, PHI-safe logging, production secrets
enforcement, backup/DR, health/readiness, rate limiting, and a real duplicate-sync-
processing race found and fixed under load).

This is the milestone-level "what order, what's in scope, what's deferred" layer —
issue #70 already carries the full task/acceptance-criteria checklist and isn't
repeated here.

## Where Stage 12 leaves off

The platform now runs safely under concurrent crews on production-grade
infrastructure, but it still can't answer the questions a real EMS deployment is
legally and operationally required to answer: is this PCR complete enough to submit
under our jurisdiction's rules, what does the final signed record look like as a
document, what happened to a given record over its lifetime, and how long are we
required (or permitted) to keep it. Concretely, per a codebase survey done before
scoping this stage:

- **Versioning/signatures already exist** (`epcr_versions`, `epcr_signatures` from
  Stage 8) — every version is content-hashed (sha256) and every signature binds to
  that hash. There is no rendered artifact (PDF or otherwise) tied to a version,
  only the JSON snapshot + hash.
- **The audit trail is write-only.** `audit_logs` (`entity_type`, `entity_id`,
  `action`, `before_json`, `after_json`, `correlation_id`, `timestamp`) is populated
  throughout `epcr-finalization.mjs`, but `AuditLogRepository` has no read method
  and no endpoint exposes it — and the table itself has no actor column, so today's
  audit trail can't even answer "who".
- **Clinical content is free text, not coded terminology.** Medication names,
  procedure types, disposition outcomes, and clinical impressions are all plain
  `TEXT` columns with no code-list backing (`DISPOSITION_OUTCOMES` exists only as a
  client-side mobile constant, unenforced server-side). Only operational categories
  (`INCIDENT_CATEGORIES`, priorities, statuses) have any shared enum today, in
  `packages/shared/src/enums.mjs`, and even those aren't DB-constrained.
- **No cross-case reporting exists at all.** Every existing GET endpoint is scoped
  to one entity or one patient case (or, for `/api/support/*`, to system/operational
  health). There's nothing for incident volume, drug/stock usage rollups, or a
  QA-flag dashboard.
- **No retention/deletion/legal-hold story for database records.** Stage 12 built
  `VEMS_OBJECT_STORAGE_RETENTION_DAYS`/`pruneExpired()` for attachment *blobs*, but
  there's no equivalent for the clinical records themselves — no soft-delete column,
  no legal-hold flag, anywhere in the schema.
- **No PDF/document-generation capability exists anywhere in the repo.** Not even a
  library dependency — Stage 13 starts from zero on rendering a document.

## Design decisions

Four scope-boundary questions were resolved before starting:

### Jurisdiction dataset: a pluggable profile framework, not one hard-coded jurisdiction

Issue #70 calls for "target-jurisdiction minimum datasets and validation profiles,"
but no jurisdiction has been specified anywhere in this repo, and picking the wrong
one (US NEMSIS vs. a different country's EMS reporting standard, say) would mean
redoing most of this stage's validation/terminology work later. **Decided**: build a
jurisdiction-*agnostic* framework — a `ComplianceProfile` definition (required
fields, per-field validators, and code lists for complaint/impression/medication/
procedure/disposition/outcome) that the finalization and reporting layers validate
and code against generically, seeded with exactly one reference profile shaped like
NEMSIS (since it's the most complete public EMS minimum-dataset spec to model
against) but not hard-wired to it. Swapping in a real jurisdiction's actual profile
later is a data/config change, not a rewrite of 13a–13c's validation or terminology
plumbing.

### Terminology: profile-supplied code lists, not adopting SNOMED/RxNorm wholesale

Real clinical coding systems (SNOMED CT, RxNorm, ICD-10) are large, often
licensed, and far beyond what a from-scratch build needs to prove the *mechanism*
of coded terminology. **Decided**: canonical code lists (for complaint, impression,
medication, procedure, disposition, outcome) are data the active `ComplianceProfile`
supplies, not a hard-coded taxonomy V-EMS owns. The reference profile ships a small,
representative code list per category (enough for the exit gate's synthetic cases to
validate against); adopting a real coding system for a real deployment becomes a
profile-data change. Existing free-text fields are **not removed** — a resolved code
is stored alongside the existing free text (additive), so this doesn't break any
Stage 6–11 clinical-record data already in flight.

### Document generation: a pure-JS PDF library, not a headless-browser dependency

Two realistic approaches exist for turning `epcr_versions.content_json` into a
signed PDF: drive a headless browser (Puppeteer/Playwright rendering HTML+CSS to
PDF) or a pure-JS PDF-drawing library (e.g. `pdfkit`). A headless browser is heavier
(a full Chromium binary) and a worse fit for a lean API/orchestration service
already running in Docker without one — Stage 12's whole infrastructure posture has
been about not adding heavy runtime dependencies unless the task needs one.
**Decided**: use a pure-JS PDF library with no browser/native dependency; the
renderer takes an `epcr_versions` snapshot + its signatures and produces a
deterministic PDF, so re-rendering the same version produces byte-stable output
(same content hash in, same document out) rather than a browser-dependent render.

### Retention: soft-delete + legal hold, never hard delete of clinical records

Clinical/legal recordkeeping norms (and this being health data) rule out ever
actually deleting a finalized PCR on a timer. **Decided**: retention is a
`retention_expires_at` + `legal_hold` pair of columns per record (patient cases and
their versions), checked by a purge/archive job that skips anything under legal
hold; "deletion" always means archival-then-mark, never a hard `DELETE`, mirroring
the same soft/reversible posture as Stage 12's disaster-recovery work (move aside,
never destroy) rather than introducing a new, riskier pattern.

## Milestones

Same incremental-PR pattern as Stages 9–12 — each step is independently reviewable
and testable. 13a is a prerequisite for 13b/13c/13d (all consume the profile
framework); the rest are otherwise loosely coupled.

1. **13a — Compliance profile framework.** The `ComplianceProfile` definition
   format (required fields + validators + code lists per category), a loader/
   registry, and one reference NEMSIS-shaped profile seeded as the default —
   per the design decision above. No wiring into finalization yet; this is the
   framework and its own test coverage.
2. **13b — Canonical terminology/coding layer.** Wires the active profile's code
   lists into the existing clinical fields (medication, procedure, disposition,
   impression/complaint) additively — a resolved `*_code` column/lookup alongside
   the existing free-text column, never replacing it. Unmapped/legacy free text
   stays valid; nothing already charted breaks.
3. **13c — PCR completeness validation against the active profile.** Wires the
   profile's required-fields rules into Stage 8's finalization lifecycle
   (`epcr-finalization.mjs`), surfacing what's missing before crew-complete/submit
   as a structured report (not necessarily a hard block on every gap — the exact
   warn-vs-block line per lifecycle transition is a 13c design call, not decided
   up front here).
4. **13d — Signed/versioned final PCR document export.** The PDF renderer per the
   design decision above, taking an `epcr_versions` snapshot + its `epcr_signatures`
   and producing a deterministic, downloadable document bound to that version's
   content hash. A new `GET .../export` (or similar) endpoint, RBAC-gated the same
   as the rest of the ePCR read surface.
5. **13e — Operational, drug/stock and QA reports.** The first cross-case reporting
   endpoints: incident volume/response-time rollups, medication/stock usage
   reporting (drawing on Stage 5's Vtiger stock-usage linkage), and a QA-flag
   dashboard over `epcr_qa_flags`. Read-only, RBAC-gated to supervisor/operations
   roles.
6. **13f — Access/audit reporting.** The first read surface over `audit_logs` — an
   RBAC-gated (supervisor/sys_admin) filtered/paginated report. Since the table
   currently has no actor column, this milestone includes the migration to add one
   and backfilling it going forward (existing audit rows predate the column and
   stay actor-less, documented as a known gap for historical entries).
7. **13g — Retention, archival, legal hold and deletion workflows.** The
   `retention_expires_at`/`legal_hold` schema per the design decision, a
   policy-driven purge/archive job, and a legal-hold toggle endpoint
   (supervisor/sys_admin only), extending the same soft/reversible posture as
   Stage 12's backup/DR work.
8. **13h — Versioned exports and schema-compatibility tests.** The export
   document format itself gains a version number (independent of
   `epcr_versions.version_number`, which tracks the *clinical record's* history,
   not the *export format's*); regression tests prove an older export-format
   version stays renderable/parseable as the underlying schema evolves further.

## Exit gate

Per issue #70: a finalized PCR can be rendered/exported as a signed, versioned
document under the seeded reference compliance profile, with a complete and
queryable audit trail; operational, drug/stock, QA and access reports are available
to authorized roles; retention/legal-hold rules are enforced by the purge job; and
export-format compatibility is proven under test as the schema evolves.

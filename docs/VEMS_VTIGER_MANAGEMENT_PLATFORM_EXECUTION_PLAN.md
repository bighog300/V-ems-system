# V-EMS + Vtiger management platform execution plan

**Prepared:** 23 September 2026  
**Target:** V-EMS repository `bighog300/V-ems-system`, after Stage 14 PR #145 merged to `main`  
**Status:** Proposed execution plan; no implementation or deployment is claimed here.

## 1. Outcome and operating model

Build a usable operational management platform for an ambulance service. Vtiger will provide back-office records, linked views, work queues and management reporting. V-EMS web-control will handle time-sensitive call intake and dispatch. The Android crew app continues to communicate only with V-EMS. OpenEMR remains the clinical record; patient clinical detail and protected health information must not be copied into Vtiger to make a management screen convenient.

The existing integration creates operational records in V-EMS and asynchronously mirrors them to Vtiger. This plan retains that write path for incidents, assignments, operational status and stock usage until an explicit Vtiger-to-V-EMS command interface is designed and tested. A Vtiger user must not be offered an editable field that appears to control a crew-visible state when the edit cannot reach V-EMS.

### Current baseline to verify at kickoff

- `infra/services/vtiger/development/modules.json` defines the Vtiger fields used by HelpDesk incidents and seven custom modules: `VEMSAssignments`, `VEMSVehicles`, `VEMSPersonnel`, `VEMSAssignmentCrew`, `VEMSStockItems`, `VEMSVehicleStock` and `VEMSStockUsage`.
- `infra/services/vtiger/development/provision-development.php` creates missing custom modules, fields, CRMEntity classes, language files and entity identifiers for the Windows development stack. Most custom fields are generic optional text fields. Provisioning demonstrates webservice access, not a finished manager-facing layout.
- The Vtiger sync worker mirrors V-EMS operational writes and records intent/link outcomes. The Stage 14 execution report documents successful synthetic mirroring after fixing ownership, missing module files and dependencies. General Vtiger-to-V-EMS synchronization is not implemented.
- `apps/web-control` has a read-only dispatcher board for incident intake and assignment purposes. The backend already has RBAC-gated incident and assignment creation APIs. Stage 17 documents the missing UI and later fleet GPS work.
- Operational incident, stock usage, QA and audit reporting APIs exist in V-EMS. Readiness checks, faults, maintenance and replenishment need a fresh implementation audit before deciding their tables and modules; references in planning documents are not proof of a working lifecycle.

**Kickoff gate:** rerun a clean development bootstrap on a disposable stack, inspect the actual Vtiger menu, list and detail screens with a manager account, compare the provisioned schema with `modules.json`, and record screenshots plus webservice describe/query results. Use only synthetic records. This establishes the actual starting UI, not merely the API schema.

## 2. Decision plan: ownership and edit contracts (PR 1)

Create `docs/vtiger/OWNERSHIP_AND_COMMANDS.md` and a machine-readable field registry used by provisioning and tests. Review each field and action with dispatch, fleet and stock owners before enabling edits.

| Record or action | Proposed write owner | Vtiger behavior in first release |
| --- | --- | --- |
| Call/incident creation, priority, dispatch status, assignment, reassignment | V-EMS API and dispatcher console | Mirror and display; provide a link back to the incident in V-EMS. Do not allow direct edits to mirrored state. |
| Vehicle identity, callsign, home station and base service configuration | Define V-EMS administrative API as the initial write path | Display in Vtiger; management edit action must call the V-EMS API with RBAC and audit, or remain disabled. |
| Crew identity, role and availability | Define V-EMS administrative API as the initial write path | Display and filter; do not turn a Vtiger-only change into an apparent dispatch availability change. |
| Stock catalog, vehicle loadout and usage | Existing V-EMS stock APIs and clinical usage path | Mirror quantities and consumption. Replenishment requests may be new Vtiger workflow records, but approval/fulfilment must update V-EMS through a defined command. |
| Readiness checks, faults and maintenance | Decide per lifecycle in PR 1, then implement one authoritative API | Vtiger can own task notes and scheduling only if dispatch availability is updated atomically and audited in V-EMS. |
| Clinical patient, ePCR, medication narrative and handover | OpenEMR/V-EMS clinical workflows | Never duplicate the clinical record in Vtiger. At most show non-clinical incident counts and restricted links. |

Document status enums, UTC timestamp rules, stable V-EMS IDs, Vtiger remote IDs, idempotency keys, relationship direction, delete/archive rules, conflict handling and what happens during a Vtiger outage. Add an explicit table of which manager actions are available in Vtiger, deep-link to V-EMS, or read-only.

**Acceptance:** every visible editable control has one documented command target; an edit made only in Vtiger cannot silently contradict crew or dispatcher state. The schema/permission tests reject newly added mirrored fields without an ownership classification.

## 3. Existing module completion plan (PRs 2–4)

### PR 2 — Reproducible Vtiger package and schema

Turn the development-only provisioning into a versioned, repeatable deployment package for the pinned Vtiger distribution. Keep the custom CRMEntity classes, language labels, entity identifiers, webservice initialization and installation/upgrade path in source control. Use vtlib APIs for fields, blocks, relationships, filters and sharing access; do not patch Vtiger core or edit its tables outside the supported installer/migration mechanism. Make upgrades idempotent and preserve existing records.

Define real field types and required values rather than leaving all custom fields as optional `VARCHAR(255)`: quantities as decimal, timestamps as date/time, finite statuses as picklists, entity links as references, and human labels separate from external keys. Migrate existing data safely before changing field types; first profile legacy values and provide a reversible migration or a documented backup/restore route where Vtiger cannot reverse a field change.

**Acceptance:** install on a fresh Vtiger 8.3 development instance and upgrade an instance with existing mirrored records; `describe`, create, query and detail view work for each module; rerunning provisioning creates no duplicate fields, blocks, menu entries or relationships.

### PR 3 — Operational relationships and manager layouts

Build incident → assignments → vehicle/crew; vehicle → stock/readiness/faults; stock item → vehicle holdings/usage; and person → assignment history as navigable related lists. Use native reference fields where supported and test actual detail views, because matching text IDs alone do not provide usable relationships. Set entity labels, list columns, search fields, record links, sensible blocks and date formatting. Keep external IDs visible to support staff but subordinate to callsign, incident number and person name.

**Acceptance:** from one incident a dispatcher or supervisor can reach every linked unit and crew record; from a vehicle a fleet manager can reach its current assignments and stock; no relation displays another incident's data. Confirm after a replayed sync intent and after an upgrade.

### PR 4 — Lists, roles and navigation

Create saved filters for active incidents, unassigned incidents, available/serviceable vehicles, units out of service, staff available/on duty, below-minimum vehicle stock, recent usage and failed mirror outcomes. Configure menu grouping and profiles for dispatcher, fleet manager, stock manager, supervisor and integration user. The integration user needs the module/API rights required by the mirror but should not act as an interactive all-purpose admin. Mask or omit irrelevant clinical data.

**Acceptance:** sign in as each role and verify allowed lists/actions and denied records/actions in the actual UI and webservice. A role matrix test must cover both read and write denial, not only menu visibility.

## 4. New management workflow plan (PRs 5–8)

Implement one complete lifecycle at a time. The record names below are proposals; PR 1 fixes the final schema and ownership.

| Priority | Workflow and proposed Vtiger module | Minimum lifecycle | V-EMS effect |
| --- | --- | --- | --- |
| 1 | `VEMSReadinessChecks` and `VEMSFaults` | Due → checked → pass/fail; fault open → triaged → repaired → verified | A failed safety-critical check takes the unit out of service through an audited V-EMS command; verified repair can restore service only with the appropriate role. |
| 2 | `VEMSMaintenance` | Requested → scheduled → in progress → completed → returned to service | Link work order to vehicle/fault, planned downtime and service status. No automatic return to available merely because a text status changes. |
| 3 | `VEMSReplenishmentRequests` | Low stock signal → requested → approved → picked → loaded → reconciled | The fulfilment command records an auditable V-EMS quantity adjustment once, keyed by request ID. |
| 4 | `VEMSStations` and `VEMSShifts` (only after data-model review) | Station roster and shift assignment/availability | A shift or qualification change influences the dispatcher picker only after V-EMS accepts it. |

### PR 5 — Readiness and fault pilot

Choose one vehicle and one synthetic checklist. Implement required fields (vehicle, checker, time, checklist version, result, defect severity, photos/attachments if needed), a fault record linked to the check, and explicit status transition. Keep the checklist version and audit history. Test two concurrent managers and a retry after a lost response. Do not claim readiness based on a stale check; show last-check time and an overdue state.

### PR 6 — Maintenance

Add work orders, service intervals, fault linkage, downtime and return-to-service approval. Prevent assignment of a non-serviceable vehicle in the V-EMS API. Test fault opened while assigned, out-of-service propagation, repair and supervisor return-to-service, including Vtiger downtime and delayed mirror recovery.

### PR 7 — Stock replenishment

Use the existing vehicle stock and usage records to calculate candidate low-stock signals. Add request, approval, pick/load and adjustment evidence. Distinguish ordered, physically loaded and reconciled quantities; do not increment stock when a request is merely approved. Test duplicate submissions, partial fulfilment, cancellation and offline/retry of usage updates.

### PR 8 — Stations, shifts and qualifications

After the first three workflows pass, add station/roster records and qualification/expiry fields if operations needs them. Define privacy and HR access before storing personal documents. Reject assignment of off-duty or unqualified crew in V-EMS, with an audited override process if operational policy requires one.

Each PR includes its own migration, permission policy, sync/command contract, UI, tests, synthetic fixture, rollback instructions and updated runbook. Do not create a module solely because it appears in an old build pack.

## 5. Dispatcher-console plan (parallel after PR 1)

Implement the existing Stage 17 sequence in V-EMS web-control, in separate PRs:

1. **17a call intake:** form for source, received time, category, priority, description, address and patient count; submit to `POST /api/incidents`; clear validation, duplicate/retry protection and audit.
2. **17e assignment picker:** show only available and serviceable vehicles and eligible crew; post to `POST /api/incidents/{id}/assignments`; require confirmation and show an immediate status result.
3. **17f reassignment:** one auditable action that stands down the old assignment and creates the replacement, including notification to both crews and recovery if one step fails.
4. **17b–17d fleet location and map:** introduce location API, stale-position indication and privacy/retention design before background device reporting; develop the map against synthetic positions.
5. **17g–17h advisory nearest unit and multi-unit views:** keep the suggestion advisory, allow a human choice, and display assignment history.

**Acceptance:** a dispatcher can receive a call, create an incident, assign a crew, reassign it and see the corresponding Vtiger records without an API client or direct Vtiger edit. Fleet GPS has its own device/privacy approval and is not a prerequisite for call intake or assignment.

## 6. Integration and reconciliation plan (cross-cutting)

- Keep V-EMS IDs as stable external keys and Vtiger IDs as remote links. Add unique/indexed external keys where supported; use find-before-create on uncertain outcomes.
- Keep the outbox/sync-intent worker for mirrors. Record pending, retrying, succeeded, dead-lettered and reconciliation-required states; expose manager-friendly diagnostics with a safe replay action and audit entry.
- Add a daily reconciliation job/report comparing V-EMS authoritative incident, assignment, vehicle, personnel and stock identities with Vtiger remote records. Classify missing, duplicated, stale and manually edited records; initially report discrepancies rather than overwriting them automatically.
- A Vtiger-originated management command, if approved, must call a V-EMS endpoint with a scoped service identity, expected version, idempotency key and actor attribution. V-EMS validates state/RBAC and returns the canonical result; the subsequent mirror must not loop back as a new command.
- Test Vtiger unavailable at create/update, recovery after backoff, remote write succeeded but response lost, duplicate replay, out-of-order update, and a manager trying to edit a read-only mirrored status.

**Acceptance:** after a controlled outage and recovery, all synthetic records reconcile exactly once; no Vtiger-only edit misleads dispatch; a dead letter has an actionable explanation and trace ID. Reconciliation is observable to support staff without exposing clinical content.

## 7. Reporting, deployment and pilot plan (PRs after workflows)

**Reporting:** begin with the existing V-EMS incident-volume, dispatch-time and stock-usage APIs. Define each measure and its source; Vtiger dashboards may use mirrored data only when freshness and reconciliation state are shown. Add fleet downtime, overdue checks, maintenance backlog, stock shortage and fulfilment reports once those workflows exist. Do not label an estimate as an actual response time or a stale mirror as live availability.

**Deployment:** package and pin the Vtiger extension version; run fresh-install and upgrade rehearsals against a disposable copy; export schema/configuration and back up Vtiger before rollout. Document environment settings, migration ordering, secret handling, module permissions, V-EMS/Vtiger version compatibility, restoration and rollback. Keep development test authentication out of the production deployment.

**Pilot:** use synthetic records first, then a controlled operational pilot with named dispatcher, fleet, stock and supervisor testers. Walk through one call-to-assignment, a fault that removes a vehicle, a repaired unit returned to service, stock consumption and replenishment, and a Vtiger outage/recovery. Record screen evidence, API/audit IDs, expected vs actual state and sign-off for each role. Clinical workflows remain in OpenEMR/V-EMS and need their own Stage 14 field acceptance.

## 8. Delivery gates and issue breakdown

| Work item | Depends on | Exit evidence |
| --- | --- | --- |
| A. Baseline UI and schema audit | None | Screenshots, describe/query results, schema inventory and current-state defects. |
| B. Ownership and command contract | A | Approved field/action matrix, no ambiguous edit path. |
| C. Package/schema and upgrade | B | Fresh and upgrade installs, idempotency, no data loss. |
| D. Existing module UX and roles | C | Related-list UI walkthrough and role matrix. |
| E. Readiness/fault pilot | B–D | Out-of-service transition and repair audit. |
| F. Maintenance | E | Work order to safe return-to-service walkthrough. |
| G. Replenishment | D | Request to physical load to reconciled quantity. |
| H. Dispatcher call/assignment UI | B; can run alongside C–G | Call and assignment entirely from web-control. |
| I. Reconciliation/diagnostics | C and each new command | Outage/replay and discrepancy report pass. |
| J. Reporting, deployment and pilot | D–I | Role sign-off, restore rehearsal and release checklist. |

Create a tracking epic and one issue per letter, then split implementation issues by PR. Keep Stage 17 issues linked to H rather than duplicating its established milestones. Stage 14 field validation remains a separate release gate. Do not close either stage merely because the Vtiger management UI is built.

## 9. Definition of done

The management platform is ready for a controlled operational pilot when a manager can find and act on the correct non-clinical records in Vtiger; a dispatcher can create and assign an incident in V-EMS; vehicle and stock decisions have one authoritative write path; role permissions work in the actual UI and API; outages reconcile without silent divergence; reports state their source and freshness; and fresh install, upgrade, backup and restore are demonstrated with synthetic data. General production rollout additionally requires the outstanding Stage 14 physical-device, safety, security and release gates.

## Source anchors

- [Repository](https://github.com/bighog300/V-ems-system)
- [Current Vtiger module definitions](https://github.com/bighog300/V-ems-system/blob/main/infra/services/vtiger/development/modules.json)
- [Development Vtiger provisioning](https://github.com/bighog300/V-ems-system/blob/main/infra/services/vtiger/development/provision-development.php)
- [Stage 14 execution report](https://github.com/bighog300/V-ems-system/blob/main/docs/STAGE14_EXECUTION_REPORT_2026-09-17.md)
- [Stage 17 dispatcher/fleet plan](https://github.com/bighog300/V-ems-system/blob/main/docs/STAGE17_FLEET_TRACKING_AND_DISPATCH_PLAN.md)
- [Vtiger vtlib module, field, filter and related-list documentation](https://community.vtiger.com/help/vtigercrm/developers/vtlib/index.html)

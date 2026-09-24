# Vtiger management baseline audit

Tracking: [management epic #146](https://github.com/bighog300/V-ems-system/issues/146)
and [live baseline #147](https://github.com/bighog300/V-ems-system/issues/147).
Source inspection on 24 September 2026, based on the repository after Stage 14
merge. This is an evidence log, not a completed live Vtiger acceptance.

## Source-verified findings

| Area | Observed source | Gap to verify or implement |
| --- | --- | --- |
| Modules | `infra/services/vtiger/development/modules.json` lists HelpDesk and seven custom VEMS modules. | Actual menu entries, layouts, labels, related lists and manager roles need UI inspection. |
| Provisioning | `provision-development.php` creates missing modules, CRMEntity classes, webservice support and generic optional text fields. | Versioned production package, typed fields, upgrade migration and direct-edit restrictions do not yet exist. |
| Integration | V-EMS orchestration queues mirror intents and the worker resolves remote links. | Reconcile local Vtiger edits and prove outage recovery in a disposable stack. General inbound sync does not exist. |
| Dispatch | V-EMS API creates incidents/assignments and validates vehicle/crew availability. | `apps/web-control/src/api.mjs` has no corresponding call-intake/assignment write functions. |
| Fleet and stock | V-EMS has vehicle service/operational states, stock catalog/loadout/usage and stock adjustment APIs. | A complete readiness/fault/maintenance/replenishment lifecycle is not present in the Vtiger modules. |

The payload mapper contains additional `vems_*` keys that are absent from
`modules.json` (for example vehicle notes and personnel contact fields).
Compare the actual Vtiger webservice `describe` result and transported payload
before adding fields: some keys are adapter-only aliases, while others may be
unmirrored data. Do not copy personnel contact or clinical details into Vtiger
without a field-level access and data-minimization decision.

## Live baseline gate — pending

This execution workspace has no Docker or PHP runtime and no Vtiger instance
attached. On the user's Windows development checkout, use the documented
`scripts/windows/bootstrap-development.ps1` and
`scripts/windows/test-development.ps1 -ServicesOnly` against a **disposable,
synthetic** environment. Do not reset or reuse the retained Stage 14 database.

Record the environment and commit SHA, then:

1. Capture the Vtiger menu, list and detail view for HelpDesk and all seven
   custom modules with a manager account. Record fields, labels, filters,
   relationships and visible edit controls.
2. Call the Vtiger webservice `describe` and a synthetic query for each
   module. Compare the returned field names/types to `modules.json` and
   `field-ownership.json`. Record missing or unexpected fields.
3. Create one synthetic incident, assignment, vehicle, person and stock
   transaction through V-EMS. Wait for sync success; navigate from the
   incident to its assignment, unit and crew, and from the unit to its stock.
4. Sign in as dispatcher, fleet manager, stock manager, supervisor and
   integration user. Record allowed reads and writes in both the UI and
   webservice. Try a mirrored status edit only on disposable data; confirm it
   cannot mislead the dispatcher or crew.
5. Stop Vtiger, make a V-EMS operational update, restore Vtiger and compare
   canonical and mirror state, remote IDs, intent status and audit IDs.
6. Attach screenshots with test identifiers redacted, sanitized `describe`
   output, discrepancy list and pass/fail evidence to the child audit issue.

**Exit:** each module and role is reviewed in the actual UI; no editable
mirrored operational state can silently diverge; discrepancies are captured as
follow-up issues. Until then, item A of #146 remains open.

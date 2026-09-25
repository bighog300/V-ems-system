# #151 (part): read-only related lists

Recorded 25 September 2026. Fixes the last two open FAIL findings from the #147 browser walkthrough: there were
no related lists, so the chain incident -> assignment -> vehicle/crew and vehicle -> stock could not be followed by
clicking. This builds on the native reference fields from #150 (PR 164), which it requires.

## What changed

`provision-development.php` adds one related list to the **target** of every reference declared in
`references.json` (`vemsEnsureRelatedList`, using Vtiger's own `get_dependents_list`, which builds the panel from the
reference field). It checks for an existing relation first, so re-provisioning does not duplicate them. No actions
are registered, so there is no Add or Select button: these records are written only by the V-EMS mirror and the
mirror guard would refuse a UI create anyway.

| Record page | Related tab | Source |
| --- | --- | --- |
| HelpDesk (incident) | Assignments | VEMSAssignments |
| VEMSVehicles | Assignments, Vehicle Stock | VEMSAssignments, VEMSVehicleStock |
| VEMSAssignments | Assignment Crew | VEMSAssignmentCrew |
| VEMSPersonnel | Assignment Crew | VEMSAssignmentCrew |
| VEMSStockItems | Vehicle Stock, Stock Usage | VEMSVehicleStock, VEMSStockUsage |

## Gate additions (`scripts/windows/vtiger-ui-check.mjs`)

1. **Related lists:** for each row above, the tab must be offered and, where audit data exists, the panel must show
   at least one row whose link points at the source module. `Stock Usage` requires only the tab: its only record is the
   empty #148 boundary fixture.
2. **Chain walk:** for each of the five accounts the gate follows real links through the UI and checks every hop links
   back to where it came from (12 hops): incident -> its assignment (related list) -> assignment links back to that
   incident -> its vehicle (reference link) -> its crew (related list) -> crew links back to that assignment -> person
   (reference link) -> person lists that crew record -> vehicle lists that assignment -> its stock line (related list)
   -> stock line links back to that vehicle -> stock item (reference link) -> stock item lists that stock line.

## Evidence

| Check | Result |
| --- | --- |
| Gate after a real `vtiger-audit.ps1 -Action Start` ([ui-check-after-start.json](evidence/issue-151/related-lists/ui-check-after-start.json)) | **PASS, 0 failures**: 5 roles x 8 modules, all related tabs, and the 12-hop chain walk **12/12 for every role** (incident 30 -> assignment 31) |
| Negative control ([removed relation](evidence/issue-151/related-lists/ui-check-negative-control-related-list-removed.json)) | With the incident-to-assignments relation deleted from the database, the gate **FAILs with 20 failures** (tab missing, no rows, and a Vtiger fatal error on the direct URL); re-running provisioning restored it and the gate passed again. Recorded before the chain walk existed, so it shows the related-list checks only |
| `ws-matrix` (#148 write guard) | unchanged: 96 allowed, 12 denied |
| Six webservice relationship comparisons | all true |
| Mirror update path (callsign change) | intent succeeded, remote ID `37x4` stable |
| Idempotency | provisioning run twice: the seven relations exist exactly once |
| Tests | `node --test` on the UI-check, audit and field-ownership tests: 36 passed |

## Limits

- **No real-browser screenshots yet.** The gate follows real links behind Vtiger's real login over HTTP; it does not
  drive a browser or click. A human sign-in pass is still needed to capture screenshots for the #147 gate.
- The chain is checked on one synthetic incident (the second synthetic set from #150). Empty related lists
  (`Stock Usage`) are verified as present tabs only.
- Saved filters, per-role menus and per-module permissions remain #151 scope; the four manager roles still have
  the broad view-all profile from the #147 audit.
- The related lists apply to `vems-dev` on its next provisioning run; that stack was not touched.

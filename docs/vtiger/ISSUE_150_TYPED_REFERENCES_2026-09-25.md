# #150 (part): native Vtiger reference fields

Recorded 25 September 2026. Fixes the "plain-text reference fields" FAIL from the #147 browser walkthrough:
`incident_ref`, `vehicle_ref`, `assignment_ref`, `personnel_ref` and `stock_item_ref` were `VARCHAR(255)`
text holding remote IDs such as `37x4`, so they rendered as plain text. They are now native Vtiger references
(uitype 10, `INT(19)`, linked to their target module through `vtiger_fieldmodulerel`) and render as links.
Related lists (which build on these) are the next PR and are **not** part of this change.

## Design

| Reference | Target |
| --- | --- |
| VEMSAssignments.incident_ref | HelpDesk |
| VEMSAssignments.vehicle_ref | VEMSVehicles |
| VEMSAssignmentCrew.assignment_ref | VEMSAssignments |
| VEMSAssignmentCrew.personnel_ref | VEMSPersonnel |
| VEMSVehicleStock.vehicle_ref | VEMSVehicles |
| VEMSVehicleStock.stock_item_ref | VEMSStockItems |
| VEMSStockUsage.stock_item_ref | VEMSStockItems |

The map lives in `infra/services/vtiger/development/references.json`. A test fails if a `*_ref` field in
`modules.json` is not declared there, or if a declared field is not mirror-owned.

`vemsEnsureReferenceField()` in `provision-development.php` runs after every module exists. It is
idempotent and fail-safe: it validates **all** existing values first (each must be `<wsid>x<crmid>` or already
numeric, and the wsid must be the declared target module's), and aborts with "nothing was changed" otherwise. Only
then does it null empties, keep the numeric record ID, `ALTER` the column to `INT(19)`, set uitype 10 and link the
target module.

## Spike first (audit stack, scratch module, removed afterwards)

[reference-spike.json](evidence/issue-150/reference-spike.json): through the webservice as the Integration user,
a native reference field accepts `37x4` on create, returns `37x4` on retrieve and query select, supports
`WHERE ref='37x4'`, and round-trips on update. **The worker contract therefore does not change**: the mapper and
mirror guard needed no edit. In the UI the field renders as a link on Detail and List, and once a related list
is registered the target's Detail page shows the related tab and rows.

Behaviours to know (all in the spike file):
- A reference to a non-existent record is accepted and stored as null, silently. The worker only sends remote
  IDs it has just created, so it does not hit this; the provisioner's migration check exists for this reason.
- `null`, `''` and an omitted reference are all accepted without error (what the mapper sends when a ref is absent).
- Updating an existing reference to `''` does **not** clear it. The mapper never does this.

## Migration safety

[reference-migration-safety.json](evidence/issue-150/reference-migration-safety.json) runs the real function
against a scratch column: a mis-targeted value (`17x7` for a vehicle field) aborts with the data untouched;
after fixing it converts; a second run is a no-op; a simulated partial failure (numeric IDs in a text column) converges.
A full database dump was taken before the first real run (kept in the audit runtime directory, not in the repo).
On the audit stack the seven columns converted (`37x4` became `4`, empty became null) and a second run changed nothing.

## Verification

| Check | Result |
| --- | --- |
| Gate, extended: first Assignment, Crew and VehicleStock record must link to the right target modules, all 5 roles | **PASS, 0 failures** after a real `vtiger-audit.ps1 -Action Start` ([ui-check-after-start.json](evidence/issue-150/ui-check-after-start.json)); the #151 checks (columns, warnings, edit control, Import) still pass |
| Webservice relationship comparisons (six) | all true ([relationships-after-typing.json](evidence/issue-150/relationships-after-typing.json)) |
| `ws-matrix` (#148 write guard) | unchanged: 96 allowed, 12 denied |
| Update path: callsign change through V-EMS | mirrored, intent succeeded, remote ID `37x4` stable ([mirror-sync-after-typing.json](evidence/issue-150/mirror-sync-after-typing.json)) |
| **Create path**: new incident, assignment, vehicle, person, stock item and restock through V-EMS and the worker | every reference equals the real remote ID (assignment to incident and vehicle, crew to assignment and person, vehicle stock to vehicle and item) ([worker-create-path.json](evidence/issue-150/worker-create-path.json)) |
| Tests | `node --test` on the UI-check, audit and field-ownership tests: 33 passed |

## Limits

- **No real-browser screenshot of the links yet.** The gate checks Vtiger's rendered HTML behind its real login;
  a human sign-in pass is still needed to capture screenshots for #147.
- Fresh-install path (text field created, then converted) is covered by the scratch-column tests and the empty
  `VEMSStockUsage` column, not by a from-scratch database. It has not been run against `vems-dev`.
- This audit stack now holds a second synthetic set (`AMB-150`, `STAFF-150`, `ITEM-150`, `INC-000002`,
  `ASN-000002`) created by the create-path check.
- Related lists, saved filters and role menus remain #151 scope.

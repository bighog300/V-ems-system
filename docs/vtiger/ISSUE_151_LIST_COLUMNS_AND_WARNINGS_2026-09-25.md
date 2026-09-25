# #151 (part): list columns, readable labels and PHP warnings

Recorded 25 September 2026. Fixes two of the four FAIL findings from the #147 browser walkthrough
(blank list columns, PHP warnings rendered on pages). The other two (plain-text reference fields, no related
lists) are #150 and the follow-up related-list PR and are **not** addressed here.

## Root causes and fixes

All fixes are in `infra/services/vtiger/development/provision-development.php`, are idempotent, and apply on
every provisioning run, including to retained data.

| Symptom | Root cause | Fix |
| --- | --- | --- |
| Blank rows, no column headers on the seven VEMS lists | The provisioner inserted a bare `All` filter row (the earlier fatal-error workaround) but no `vtiger_cvcolumnlist` rows | Add default columns through vtlib `Vtiger_Filter::addField` (see below). Columns are added only when none exist, so an administrator's later column changes survive re-provisioning |
| Raw names such as `vems_callsign`, `LBL_VEMS_INFORMATION`, `VEMSVehicles` in the UI | Fields were created with their name as the label; language files mapped module names to themselves | Readable field labels (only where the label still equals the raw name, so Vtiger's own labels are untouched); module, singular and block labels in `languages/en_us` for the seven custom modules only |
| `Undefined array key "DETAILVIEWBASIC"` on every Detail page for read-only roles | Stock `DetailViewActions.tpl` indexes `$DETAILVIEW_LINKS['DETAILVIEWBASIC']` with no existence check; users with no edit right have no basic links. It affects stock HelpDesk too | A per-module copy of the template with `\|default:[]`, generated from the shipped file (Vtiger resolves a module template before the shared one). Provisioning fails loudly if the shipped template changes shape |
| `Undefined array key "DOCUMENT_WIDGET_MODEL"` and `property "value" on null` on HelpDesk Detail for read-only roles | HelpDesk's `SummaryViewWidgets.tpl` tests `{if $DOCUMENT_WIDGET_MODEL}` (and the comments/updates twins) on variables assigned only when the role is offered that widget | Initialise the three variables first (marker-guarded, in place, idempotent) |
| `Undefined array key <tabid>` in `UserInfoUtil.php` line 410 for the Integration user (non-administrator) | vtlib module creation leaves no `vtiger_def_org_share` row, so `$defaultOrgSharingPermission[$tabid]` is undefined | `Vtiger_Access::setDefaultSharing($module, 'Public_ReadWriteDelete')` when the row is missing, matching HelpDesk. Writes remain controlled by profiles and the #148 mirror guard |

Default columns (first column is the record link, the last is `Assigned To`):

| Module | Columns |
| --- | --- |
| VEMSAssignments | External Key, Incident ID, Vehicle ID, Status, Vehicle Status, Updated At UTC, Assigned To |
| VEMSVehicles | External Key, Callsign, Operational Status, Service Status, Vehicle Type, Home Station, Assigned To |
| VEMSPersonnel | External Key, Display Name, Role, Operational Status, Home Station, Assigned To |
| VEMSAssignmentCrew | External Key, Assignment ID, Staff ID, Updated At UTC, Assigned To |
| VEMSStockItems | External Key, Name, Category, Item Type, Unit Of Measure, Active Status, Assigned To |
| VEMSVehicleStock | External Key, Vehicle ID, Stock Item ID, Quantity On Hand, Minimum Quantity, Target Quantity, Assigned To |
| VEMSStockUsage | External Key, Stock Item ID, Quantity Used, Intervention Type, Performed At UTC, Usage Source, Assigned To |

HelpDesk keeps its stock columns.

## Automated gate

`node scripts/windows/vtiger-ui-check.mjs <label>` signs in through Vtiger's real web login form as all five
accounts on the isolated `vems-audit-147` stack (it reads `audit.env` inside the process; nothing secret is
printed) and, for each of the eight modules, checks: List has at least three column headers and at least two
populated cells in its first row, no PHP warning on List or Detail, edit control present only for the
Integration user, and Import denied. It writes `docs/vtiger/evidence/issue-151/ui-check-<label>.json`.

| Run | Result |
| --- | --- |
| [Baseline](evidence/issue-151/ui-check-baseline.json) (before) | FAIL, 117 failures: 35 role/module lists with no headers or cells (each counted twice), 32 `DETAILVIEWBASIC`, 4+4 HelpDesk widget warnings, 7 `UserInfoUtil` |
| [After `vtiger-audit.ps1 -Action Start`](evidence/issue-151/ui-check-after-start.json) | **PASS, 0 failures** (5 roles x 8 modules) |

The final run followed a real `Start` (image rebuild, Vtiger container recreated, provisioning re-run against
the retained data), so it shows the templates and rows are re-applied from scratch, not left over from a manual
edit. `VEMSStockUsage` shows two populated cells because its only record is the mostly empty #148 boundary
fixture; the external key and owner columns populate.

## Regression checks on the #148 path

- `vtiger-audit-live.mjs ws-matrix`: unchanged, 96 allowed and 12 denied, differing from the committed
  evidence only by timestamp.
- A synthetic vehicle callsign change through V-EMS still mirrored: intent 43 `succeeded`, mirror and
  canonical callsign equal, remote ID `37x4` stable
  ([mirror-sync-after-fix.json](evidence/issue-151/mirror-sync-after-fix.json)). This left the synthetic audit
  vehicle's callsign as `Synthetic Audit Recovery Unit` (audit-stack data only).
- Tests: `node --test scripts/windows/vtiger-ui-check.test.mjs scripts/windows/vtiger-audit.test.mjs
  infra/services/vtiger/field-ownership.test.mjs` 30 passed. New tests cover the analyzers, the original
  defect shape, and that every default column is a real field of its module and HelpDesk's language file is never
  rewritten.

## Not done here, and limits

- **Real-browser screenshots of the fixed pages are not yet taken.** The gate uses Vtiger's real login and
  rendered HTML over HTTP, not a browser. A human sign-in pass (passwords must be typed by a person) is still
  needed to capture the closing screenshots for #147.
- Still FAIL: plain-text reference fields (#150) and related lists (need #150 first).
- The gate proves absence of the seven known warnings on these pages for these roles, not on every page of Vtiger.
- Saved-filter design, per-role menus and per-module permissions remain #151 scope.
- The template guards edit copies of stock Vtiger templates inside the container; they are re-created by
  provisioning and fail loudly if the stock template changes on an image upgrade.
- Applies to `vems-dev` too on its next provisioning run; that stack was not touched.

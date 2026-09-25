# #151 (part): V-EMS-only app menu

Recorded 25 September 2026. The link crawl ([ISSUE_147 report](ISSUE_147_DESKTOP_AUDIT_2026-09-24.md)) found four stock Vtiger pages
that render PHP errors (SMS Notifier, Email Templates, Recycle Bin) and a Recycle Bin menu entry that leads to "Permission
denied" for the four manager roles. All were reachable only because the menu offered every stock app. This change makes the
menu offer the eight V-EMS modules and nothing else.

## What was tried first, and why it was dropped

The plan was **per-profile scoping**: turn the four manager profiles' global "view all" off and grant read access to the
eight modules only. It was implemented and it worked for the menu (each manager saw exactly the eight modules), then
abandoned because it is not viable on this Vtiger without patching core:

- Stock `getPermittedModuleNames()` (`include/utils/UserInfoUtil.php`) tests
  `(isset($profileTabsPermission[$tabid]) && $profileTabsPermission[$tabid]) === 0`. The `&&` yields a boolean, so
  the comparison is always false, and for a profile with **neither global view nor global edit** the function returns no modules.
- That list feeds `vtws_listtypes()`, which feeds every reference field's allowed targets. With it empty, **every
  reference field rendered blank for the managers** (no link, no text) and the chain walk failed 12 of 12 hops on the record
  pages, and the webservice type lists that the managers' reads rely on are affected the same way.
- Any global grant that avoids the bug (view-all or edit-all) also grants read on every module and shows every app,
  which is what we were removing.

The database was restored from a backup taken before the experiment, and the profile provisioner is unchanged.

## What this change does instead

`vemsEnsureEmsMenu()` in `provision-development.php` uses Vtiger's own **Menu Editor** visibility
(`vtiger_app2tab.visible`), which is the supported way to hide modules from the menu:

1. Every module in the six standard apps (Marketing, Sales, Inventory, Support, Project, Tools) that is not one of the
   eight V-EMS modules is flagged not visible. Analytics and Settings are left alone. Nothing is deleted.
2. The eight modules are made visible in Support and also in **Marketing**. Vtiger's `Basic` view hard-codes MARKETING as the default
   app and indexes into it (`$menuGroupedByParent['MARKETING']`), so an app with no visible module gives a PHP warning on the
   dashboard, which is the first page after sign-in, and on any page opened without an `app` parameter. Modules may
   appear in several apps (Contacts and Accounts already do), so listing the V-EMS modules under Marketing is a supported
   workaround, not a core edit.
3. It runs on every provisioning, so it reconciles: a module an administrator re-shows is hidden again, and a V-EMS
   module they hid is shown again.

The menu is global, so it applies to every account, administrators included.

## Evidence (audit stack, after a real `vtiger-audit.ps1 -Action Start`)

| Check | Before | After |
| --- | --- | --- |
| Manager menu offers | Every app: Accounts, Campaigns, Leads, Invoices, Reports, Recycle Bin and more | **Exactly the eight V-EMS modules** for all four managers ([ui-check-after.json](evidence/issue-151/menu-scoping/ui-check-after.json)) |
| Link crawl, 5 accounts | 4 stock pages with PHP errors; 1 offered-but-denied link for each manager | **0 defects, 0 offered-but-denied** (173 pages per manager role, 200 for the Integration user; [link-crawl-after.json](evidence/issue-151/menu-scoping/link-crawl-after.json)) |
| UI gate (columns, warnings, references, related lists, 12-hop chain, Import denial) | PASS | **PASS, 0 failures** |
| Edit and Create forms | Managers denied 16/16; Integration user form 16/16 | Unchanged |
| `ws-matrix` | 96 allowed, 12 denied | Unchanged |
| Six relationship comparisons | true | Unchanged |
| Worker create and update; ordinary create and delete denied ([guard-create-delete-after.json](evidence/issue-151/menu-scoping/guard-create-delete-after.json)) | pass | Unchanged: worker create works, blank and valued creates denied, deletes denied for the Integration user and the administrator, worker update works |

Tests: 46 pass (the UI gate, crawler and audit tests, including two new source tests for this function), and the guard's
131-check test still passes.

## Limits

- **Hiding is not blocking.** The menu no longer offers stock modules, but a direct URL to one (for example
  `index.php?module=Leads&view=List`) still opens, because these profiles keep global read and Vtiger's Email Templates
  views only check that the module is active. The four pages that render PHP errors are stock bugs and remain reachable by
  typing the URL; nothing links to them. Making them unreachable would mean disabling the unused stock modules in Module Manager,
  which is riskier (HelpDesk references Contacts and Accounts) and was not done.
- **Global, not per role.** The four managers, the administrator and the Integration user all see the same menu. The Integration
  user, which holds the full Administrator profile, is also offered **Reports** (it is not in the app table); a dedicated profile
  for it is a separate change and the gate records its menu without asserting it.
- **Naming.** The eight modules are listed under an app labelled "Marketing" as well as "Support".
- **`vems-dev` picks this up on its next provisioning run.** Rollback: revert the change and set the six apps' rows
  visible again in Menu Editor, or restore the database backup.
- No real-browser screenshots of the new menu yet (they need a human sign-in).

// Local gate for the isolated vems-audit-147 stack: signs in through Vtiger's real web form as each
// account, reads audit.env in-process only (nothing secret is printed), and checks List/Detail/Import.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { main as guard } from './vtiger-audit.mjs';
import { BASE, ACCOUNTS, loadAuditEnv, signIn } from './vtiger-session.mjs';
import { MODULES, menuModules, analyzeList, analyzeDetail, analyzeRelated, recordLinks, isImportDenied } from './vtiger-ui-check-lib.mjs';

const label = process.argv[2] || 'run';
await guard('inspect');
const env = loadAuditEnv();
// Modules whose first record must show linked reference fields, and the modules they must link to.
// (VEMSStockUsage is omitted: its only record is the empty #148 boundary fixture.)
const EXPECTED_REFERENCE_TARGETS = {
  VEMSAssignments: ['HelpDesk', 'VEMSVehicles'],
  VEMSAssignmentCrew: ['VEMSAssignments', 'VEMSPersonnel'],
  VEMSVehicleStock: ['VEMSStockItems', 'VEMSVehicles'],
};
// Related lists a record page must offer (target module -> tab label, source module, and whether the audit
// data has at least one such row). VEMSStockUsage has no real record, so only the tab is required there.
const EXPECTED_RELATED = {
  HelpDesk: [['Assignments', 'VEMSAssignments', true]],
  VEMSVehicles: [['Assignments', 'VEMSAssignments', true], ['Vehicle Stock', 'VEMSVehicleStock', true]],
  VEMSAssignments: [['Assignment Crew', 'VEMSAssignmentCrew', true]],
  VEMSPersonnel: [['Assignment Crew', 'VEMSAssignmentCrew', true]],
  VEMSStockItems: [['Vehicle Stock', 'VEMSVehicleStock', true], ['Stock Usage', 'VEMSStockUsage', false]],
};
const report = { label, timestamp: new Date().toISOString(), roles: {}, failures: [] };
for (const [role, prefix, expectsEdit] of ACCOUNTS) {
  const s = await signIn(env, prefix);
  if (!s) { report.roles[role] = { signIn: 'FAIL' }; report.failures.push(`${role}: sign-in failed`); continue; }
  // The app menu offers the V-EMS modules only (hidden globally, see provision-development.php). The four manager
  // roles are asserted; the Integration user holds the full Administrator profile, so Vtiger also lists Reports for it
  // (its own profile is a separate change) - its menu is recorded, not asserted.
  {
    const menu = menuModules((await s.request(`${BASE}?module=Home&view=DashBoard`)).html);
    const extra = menu.filter((m) => !MODULES.includes(m)), missing = MODULES.filter((m) => !menu.includes(m));
    if (!expectsEdit) {
      if (extra.length) report.failures.push(`${role}: menu offers modules outside the V-EMS set: ${extra.join(', ')}`);
      if (missing.length) report.failures.push(`${role}: menu is missing V-EMS modules: ${missing.join(', ')}`);
    }
    report.menus = { ...(report.menus || {}), [role]: menu };
  }
  const results = {};
  for (const module of MODULES) {
    const list = analyzeList((await s.request(`${BASE}?module=${module}&view=List`)).html);
    const detail = list.firstRecordId
      ? analyzeDetail((await s.request(`${BASE}?module=${module}&view=Detail&record=${list.firstRecordId}`)).html, module)
      : { warnings: [], fieldLabels: 0, editControl: false, linkedReferenceFields: 0, referenceTargets: [], relatedTabs: [] };
    // Follow each expected related list: the tab must exist and, where data exists, at least one of the
    // module's first records must show rows that link to the source module.
    const related = {};
    for (const [tab, source, expectRows] of EXPECTED_RELATED[module] ?? []) {
      let best = { rows: 0, linksToSource: false, warnings: [] };
      for (const id of list.recordIds.slice(0, 10)) {
        const panel = analyzeRelated((await s.request(`${BASE}?module=${module}&view=Detail&record=${id}&relatedModule=${source}&mode=showRelatedList&tab_label=${encodeURIComponent(tab)}`)).html, source);
        if (panel.rows > best.rows || panel.warnings.length) best = { ...panel, warnings: [...best.warnings, ...panel.warnings] };
        if (panel.rows > 0 && panel.linksToSource) break;
      }
      related[tab] = { source, tabOffered: detail.relatedTabs.includes(tab), rows: best.rows, linksToSource: best.linksToSource };
      const g = (m) => report.failures.push(`${role}/${module}: related list "${tab}" ${m}`);
      if (!detail.relatedTabs.includes(tab)) g(`tab not offered (tabs: ${detail.relatedTabs.join('|')})`);
      if (expectRows && (best.rows < 1 || !best.linksToSource)) g(`shows ${best.rows} row(s), links to ${source}: ${best.linksToSource}`);
      for (const w of best.warnings) g(`renders PHP ${w}`);
    }
    detail.related = related;
    const importDenied = isImportDenied((await s.request(`${BASE}?module=${module}&view=Import`)).html);
    results[module] = { list, detail, importDenied };
    const f = (m) => report.failures.push(`${role}/${module}: ${m}`);
    if (list.rows < 1) f('List shows no rows');
    if (list.headerColumns < 3) f(`List has ${list.headerColumns} column header(s), expected >= 3`);
    if (list.valueCells < 3) f(`first List row has ${list.valueCells} value cell(s), expected >= 3`);
    if (list.populatedValueCells < 2) f(`first List row has ${list.populatedValueCells} populated cell(s), expected >= 2`);
    for (const w of list.warnings) f(`List renders PHP ${w}`);
    for (const w of detail.warnings) f(`Detail renders PHP ${w}`);
    if (detail.editControl !== expectsEdit) f(`edit control ${detail.editControl ? 'present' : 'absent'}, expected ${expectsEdit ? 'present' : 'absent'}`);
    const expectedTargets = EXPECTED_REFERENCE_TARGETS[module];
    if (expectedTargets && JSON.stringify(detail.referenceTargets) !== JSON.stringify(expectedTargets)) f(`reference fields link to [${detail.referenceTargets}], expected [${expectedTargets}]`);
    if (!importDenied) f('Import view was not denied');
  }
  // Click through the relationship chain by following real links, checking every hop links back to where it
  // came from: incident -> assignment -> vehicle and crew -> person, then vehicle -> stock line -> stock item.
  const chain = [];
  const hop = (name, ok, detail) => { chain.push(ok ? { hop: name, ok } : { hop: name, ok, detail }); if (!ok) report.failures.push(`${role}: chain "${name}" ${detail}`); return ok; };
  const page = async (module, id, extra = '') => (await s.request(`${BASE}?module=${module}&view=Detail&record=${id}${extra}`)).html;
  const related = async (module, id, source, tab) => page(module, id, `&relatedModule=${source}&mode=showRelatedList&tab_label=${encodeURIComponent(tab)}`);
  const incidentIds = analyzeList((await s.request(`${BASE}?module=HelpDesk&view=List`)).html).recordIds.slice(0, 10);
  let incident, assignment;
  for (const id of incidentIds) { const ids = recordLinks(await related('HelpDesk', id, 'VEMSAssignments', 'Assignments'), 'VEMSAssignments'); if (ids.length) { incident = id; assignment = ids[0]; break; } }
  if (hop('incident -> its assignment (related list)', !!assignment, assignment ? `incident ${incident} lists assignment ${assignment}` : 'no incident lists an assignment')) {
    const aHtml = await page('VEMSAssignments', assignment);
    const vehicle = recordLinks(aHtml, 'VEMSVehicles')[0];
    hop('assignment links back to the same incident', recordLinks(aHtml, 'HelpDesk').includes(incident), `assignment ${assignment} links to incident ${recordLinks(aHtml, 'HelpDesk')}, expected ${incident}`);
    hop('assignment -> its vehicle (reference link)', !!vehicle, `vehicle ${vehicle}`);
    const crew = recordLinks(await related('VEMSAssignments', assignment, 'VEMSAssignmentCrew', 'Assignment Crew'), 'VEMSAssignmentCrew')[0];
    if (hop('assignment -> its crew (related list)', !!crew, `crew ${crew}`)) {
      const cHtml = await page('VEMSAssignmentCrew', crew);
      hop('crew links back to the same assignment', recordLinks(cHtml, 'VEMSAssignments').includes(assignment), `crew ${crew} links to assignment ${recordLinks(cHtml, 'VEMSAssignments')}, expected ${assignment}`);
      const person = recordLinks(cHtml, 'VEMSPersonnel')[0];
      hop('crew -> person (reference link)', !!person, `person ${person}`);
      if (person) hop('person lists the same crew record (related list)', recordLinks(await related('VEMSPersonnel', person, 'VEMSAssignmentCrew', 'Assignment Crew'), 'VEMSAssignmentCrew').includes(crew), `person ${person} does not list crew ${crew}`);
    }
    if (vehicle) {
      hop('vehicle lists the same assignment (related list)', recordLinks(await related('VEMSVehicles', vehicle, 'VEMSAssignments', 'Assignments'), 'VEMSAssignments').includes(assignment), `vehicle ${vehicle} does not list assignment ${assignment}`);
      const stock = recordLinks(await related('VEMSVehicles', vehicle, 'VEMSVehicleStock', 'Vehicle Stock'), 'VEMSVehicleStock')[0];
      if (hop('vehicle -> its stock line (related list)', !!stock, `stock line ${stock}`)) {
        const sHtml = await page('VEMSVehicleStock', stock);
        hop('stock line links back to the same vehicle', recordLinks(sHtml, 'VEMSVehicles').includes(vehicle), `stock line ${stock} links to vehicle ${recordLinks(sHtml, 'VEMSVehicles')}, expected ${vehicle}`);
        const item = recordLinks(sHtml, 'VEMSStockItems')[0];
        if (hop('stock line -> stock item (reference link)', !!item, `stock item ${item}`)) hop('stock item lists the same stock line (related list)', recordLinks(await related('VEMSStockItems', item, 'VEMSVehicleStock', 'Vehicle Stock'), 'VEMSVehicleStock').includes(stock), `stock item ${item} does not list stock line ${stock}`);
      }
    }
  }
  report.roles[role] = { signIn: 'PASS', modules: results, chain, chainRecordIds: { incident, assignment } };
  await s.request(`${BASE}?module=Users&action=Logout`);
}
report.result = report.failures.length ? 'FAIL' : 'PASS';
const out = resolve('docs/vtiger/evidence/issue-151');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, `ui-check-${label}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`ui-check ${label}: ${report.result}, ${report.failures.length} failure(s)`);
const counts = {};
for (const failure of report.failures) { const k = failure.replace(/^[^/]+\/[^:]+: /, '').replace(/\d+/g, 'N'); counts[k] = (counts[k] || 0) + 1; }
for (const [k, v] of Object.entries(counts)) console.log(`  ${v} x ${k}`);
process.exitCode = report.failures.length ? 1 : 0;

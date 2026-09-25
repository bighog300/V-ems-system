import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeList, analyzeDetail, analyzeRelated, recordLinks, isImportDenied, phpWarnings, menuModules, isPermissionDeniedPage, MODULES } from './vtiger-ui-check-lib.mjs';

const listHtml = (headers, cells) => `
<tr class="listViewContentHeader"><th></th>${headers.map((h) => `<th><a href="#" class="listViewContentHeaderValues">&nbsp;${h}&nbsp;</a></th>`).join('')}</tr>
<tr class="listViewEntries" data-id='7' data-recordUrl='x'><td></td>${cells.map((c) => `<td class="listViewEntryValue textOverflowEllipsis">${c}</td>`).join('')}</tr>`;

test('a list with headers and populated cells passes the gate shape', () => {
  const r = analyzeList(listHtml(['Callsign', 'Status', 'Type'], ['<a>AMB-1</a>', 'Available', 'ALS']));
  assert.deepEqual([r.rows, r.headerColumns, r.valueCells, r.populatedValueCells, r.firstRecordId], [1, 3, 3, 3, '7']);
});

test('the original defect (a row with no headers and no cells) is detected', () => {
  const r = analyzeList('<tr class="listViewContentHeader"><th></th></tr><tr class="listViewEntries" data-id="9"><td></td></tr>');
  assert.deepEqual([r.rows, r.headerColumns, r.valueCells], [1, 0, 0]);
});

test('blank cells are counted separately from populated ones', () => {
  const r = analyzeList(listHtml(['A', 'B', 'C'], ['x', '', '']));
  assert.deepEqual([r.blankValueCells, r.populatedValueCells], [2, 1]);
});

test('rendered PHP warnings are extracted and de-duplicated', () => {
  const html = '<br /><b>Warning</b>:  Undefined array key "DETAILVIEWBASIC" in <b>x.php</b> on line <b>3</b><br /><b>Warning</b>:  Undefined array key "DETAILVIEWBASIC" in <b>y.php</b>';
  assert.deepEqual(phpWarnings(html), ['Warning: Undefined array key "DETAILVIEWBASIC"']);
  assert.deepEqual(phpWarnings('<div>clean page</div>'), []);
});

test('detail analysis reports edit control, linked references and warnings', () => {
  const html = '<button class="btn">Edit</button><td class="fieldLabel">a</td><td class="fieldValue"><a href="index.php?module=X&record=4">x</a></td>';
  const r = analyzeDetail(html);
  assert.equal(r.editControl, true);
  assert.equal(r.linkedReferenceFields, 1);
  assert.equal(analyzeDetail('<a>Edit record</a>').editControl, false);
});

test('Import denial requires the message and no upload form', () => {
  assert.equal(isImportDenied('<div>Permission denied</div><a>Go back</a>'), true);
  assert.equal(isImportDenied('<input type="file" name="import_file">'), false);
});

test('provisioner default columns are real fields of every custom module', () => {
  const source = readFileSync(new URL('../../infra/services/vtiger/development/provision-development.php', import.meta.url), 'utf8');
  const schemas = JSON.parse(readFileSync(new URL('../../infra/services/vtiger/development/modules.json', import.meta.url), 'utf8'));
  const block = source.match(/const VEMS_LIST_COLUMNS = \[([\s\S]*?)\n\];/)[1];
  const custom = MODULES.filter((m) => m !== 'HelpDesk');
  for (const module of custom) {
    const line = block.match(new RegExp(`'${module}' => \\[([^\\]]*)\\]`));
    assert.ok(line, `${module} has default list columns`);
    const columns = [...line[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(columns.length >= 5, `${module} has at least five columns`);
    assert.equal(columns[0], 'vems_external_key', `${module} links the record from the first column`);
    for (const column of columns) assert.ok(schemas[module].includes(column), `${module} column ${column} exists in modules.json`);
  }
  assert.ok(!/VEMS_LIST_COLUMNS[\s\S]{0,40}'HelpDesk'/.test(block), 'HelpDesk keeps its own stock columns');
});

test('provisioner never rewrites a language file it does not own', () => {
  const source = readFileSync(new URL('../../infra/services/vtiger/development/provision-development.php', import.meta.url), 'utf8');
  assert.match(source, /\$custom = isset\(VEMS_MODULE_LABELS\[\$module\]\);/);
  assert.match(source, /\(\$custom && strpos\(file_get_contents\(\$language\)/);
});

test('reference targets are the record links on a page, excluding its own module and menu links', () => {
  const html = '<a href="index.php?module=VEMSVehicles&view=List&app=SUPPORT">menu</a>'
    + '<td class="fieldValue"><a href="index.php?module=HelpDesk&view=Detail&record=7">INC</a></td>'
    + '<td class="fieldValue"><a href="index.php?module=VEMSVehicles&amp;view=Detail&amp;record=4">AMB</a></td>'
    + '<a href="index.php?module=VEMSAssignments&view=Detail&record=8">self</a>';
  assert.deepEqual(analyzeDetail(html, 'VEMSAssignments').referenceTargets, ['HelpDesk', 'VEMSVehicles']);
  assert.deepEqual(analyzeDetail('<td class="fieldValue">17x7</td>', 'VEMSAssignments').referenceTargets, []);
});

test('references.json names real fields and modules and matches the mirror-owned fields', () => {
  const references = JSON.parse(readFileSync(new URL('../../infra/services/vtiger/development/references.json', import.meta.url), 'utf8'));
  const schemas = JSON.parse(readFileSync(new URL('../../infra/services/vtiger/development/modules.json', import.meta.url), 'utf8'));
  const ownership = JSON.parse(readFileSync(new URL('../../infra/services/vtiger/field-ownership.json', import.meta.url), 'utf8'));
  for (const [module, fields] of Object.entries(references)) {
    for (const [field, target] of Object.entries(fields)) {
      assert.ok(schemas[module]?.includes(field), `${module}.${field} exists in modules.json`);
      assert.ok(schemas[target], `${module}.${field} targets a provisioned module (${target})`);
      assert.equal(ownership.modules[module].fields[field], 'vems_mirror', `${module}.${field} stays mirror-owned`);
    }
  }
  // Every *_ref field the schema defines must be declared, so a new one cannot silently stay plain text.
  for (const [module, fields] of Object.entries(schemas)) {
    for (const field of fields.filter((f) => /_ref$/.test(f))) assert.ok(references[module]?.[field], `${module}.${field} is declared in references.json`);
  }
});

test('the reference migration aborts on bad data before altering anything', () => {
  const source = readFileSync(new URL('../../infra/services/vtiger/development/provision-development.php', import.meta.url), 'utf8');
  const fn = source.match(/function vemsEnsureReferenceField[\s\S]*?\n\}\r?\n/)[0];
  const abort = fn.indexOf('nothing was changed');
  assert.ok(abort > 0, 'aborts with an explicit message');
  for (const mutation of ['UPDATE `$table`', 'ALTER TABLE', 'UPDATE vtiger_field']) {
    assert.ok(fn.indexOf(mutation) > abort, `${mutation} happens only after the validation abort`);
  }
  assert.ok(!/REGEXP '[^']*\?/.test(fn), 'no ? inside the regex (PearDatabase counts it as a placeholder)');
});

test('record links ignore menu links and de-duplicate ids', () => {
  const html = '<a href="index.php?module=VEMSVehicles&view=List">menu</a>'
    + '<a href="index.php?module=VEMSVehicles&view=Detail&record=4">a</a><a href="index.php?module=VEMSVehicles&amp;view=Detail&amp;record=4">b</a>'
    + '<a href="index.php?module=VEMSVehicles&view=Detail&record=19">c</a><a href="index.php?module=HelpDesk&view=Detail&record=7">d</a>';
  assert.deepEqual(recordLinks(html, 'VEMSVehicles'), ['4', '19']);
  assert.deepEqual(recordLinks(html, 'VEMSPersonnel'), []);
});

test('a related-list panel reports its rows and whether they link to the source module', () => {
  const panel = '<tr class="listViewEntries" data-id="8"><td><a href="index.php?module=VEMSAssignments&view=Detail&record=8">x</a></td></tr>';
  assert.deepEqual(analyzeRelated(panel, 'VEMSAssignments'), { rows: 1, linksToSource: true, warnings: [] });
  assert.equal(analyzeRelated('<div>No related records</div>', 'VEMSAssignments').rows, 0);
  assert.equal(analyzeRelated(panel, 'VEMSVehicles').linksToSource, false);
});

test('the provisioner adds one read-only related list per declared reference, only once', () => {
  const source = readFileSync(new URL('../../infra/services/vtiger/development/provision-development.php', import.meta.url), 'utf8');
  const fn = source.match(/function vemsEnsureRelatedList[\s\S]*?\n\}\r?\n/)[0];
  assert.match(fn, /SELECT 1 FROM vtiger_relatedlists WHERE tabid=\? AND related_tabid=\? AND name=\?/, 'checks for an existing relation first');
  assert.match(fn, /setRelatedList\(\$source, [^,]+, \[\], 'get_dependents_list'\)/, 'no actions, so no Add or Select button');
  assert.match(source, /vemsEnsureReferenceField\(\$adb, \$referencingModule, \$referenceField, \$targetModule\);\s+vemsEnsureRelatedList\(\$adb, \$referencingModule, \$targetModule\);/, 'one relation per declared reference, after the reference exists');
});

test('menu modules are the de-duplicated list links on a page', () => {
  const html = '<a href="index.php?module=VEMSVehicles&view=List&app=SUPPORT">a</a><a href="index.php?module=VEMSVehicles&amp;view=List">b</a>'
    + '<a href="index.php?module=Leads&view=List">c</a><a href="index.php?module=Home&view=DashBoard">d</a>';
  assert.deepEqual(menuModules(html), ['Leads', 'VEMSVehicles']);
});

test('the permission-denied page is recognised only when it is the whole page', () => {
  assert.equal(isPermissionDeniedPage('<div>Permission denied</div><a>Go back</a>'), true);
  assert.equal(isPermissionDeniedPage('<p>' + 'lorem ipsum '.repeat(60) + 'Permission denied</p>'), false);
  assert.equal(isPermissionDeniedPage('<div>Leads</div>'), false);
});

test('the provisioner hides stock modules from the app menu and keeps the default app populated', () => {
  const source = readFileSync(new URL('../../infra/services/vtiger/development/provision-development.php', import.meta.url), 'utf8');
  const fn = source.match(/function vemsEnsureEmsMenu[\s\S]*?\n\}\r?\n/)[0];
  assert.match(fn, /UPDATE vtiger_app2tab SET visible=0 WHERE appname IN \(\$appMarks\) AND tabid NOT IN \(\$marks\)/, 'hides everything that is not a V-EMS module');
  assert.match(fn, /\$apps = \['MARKETING', 'SALES', 'INVENTORY', 'SUPPORT', 'PROJECT', 'TOOLS'\];/, 'only the six standard apps; ANALYTICS and SETTINGS are left alone');
  assert.match(fn, /foreach \(\['SUPPORT', 'MARKETING'\] as \$app\)/, 'V-EMS modules are visible in SUPPORT and in the hard-coded default app MARKETING');
  assert.match(fn, /UPDATE vtiger_app2tab SET visible=1/, 'a re-run re-shows a V-EMS module an administrator hid');
  assert.match(source, /vemsEnsureEmsMenu\(\$adb, array_keys\(\$schemas\)\);/, 'called with the V-EMS module list');
  assert.ok(!/DELETE FROM vtiger_app2tab/.test(fn), 'nothing is deleted, only flagged');
});

test('menu scoping relies on the app menu, not on profile permissions', () => {
  const roles = readFileSync(new URL('../../infra/services/vtiger/development/provision-audit-roles.php', import.meta.url), 'utf8');
  assert.match(roles, /'viewall', 'on'/, 'profiles keep global view: per-profile scoping breaks reference links (stock getPermittedModuleNames bug)');
});

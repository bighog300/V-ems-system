import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeList, analyzeDetail, isImportDenied, phpWarnings, MODULES } from './vtiger-ui-check-lib.mjs';

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

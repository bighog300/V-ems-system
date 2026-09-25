import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks, canonicalize, classifyPage, isFormRendered, shouldFollow } from './vtiger-link-crawl-lib.mjs';

const page = 'http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=List';

test('links are extracted from anchors and list rows, resolved and de-entitised', () => {
  const html = '<a href="index.php?module=VEMSVehicles&amp;view=Detail&amp;record=4">AMB</a>'
    + '<a href="#">skip</a><a href="javascript:void(0)">skip</a><a href="mailto:x@y">skip</a>'
    + '<tr data-recordurl="index.php?module=VEMSVehicles&view=Detail&record=5"></tr>';
  assert.deepEqual(extractLinks(html, page).map((l) => l.url), [
    'http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=Detail&record=4',
    'http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=Detail&record=5',
  ]);
});

test('only read-only same-origin view pages are crawlable', () => {
  assert.ok(canonicalize('http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=Detail&record=4&app=SUPPORT'));
  assert.equal(canonicalize('http://127.0.0.1:18080/index.php?module=VEMSVehicles&action=Delete&record=4'), null, 'no action= links');
  assert.equal(canonicalize('http://127.0.0.1:18080/index.php?module=Users&action=Logout'), null);
  assert.equal(canonicalize('http://127.0.0.1:18080/index.php?module=Users&view=PreferenceDetail'), null, 'no Users area');
  assert.equal(canonicalize('http://127.0.0.1:18080/index.php?module=Vtiger&parent=Settings&view=List'), null, 'no Settings area');
  for (const view of ['Export', 'ExportAjax', 'MassActionAjax', 'Popup', 'Import', 'Print', 'DownloadFile']) {
    assert.equal(canonicalize(`http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=${view}`), null, view);
  }
  assert.equal(canonicalize('http://evil.example/index.php?module=VEMSVehicles&view=List'), null, 'no other origin');
  assert.equal(canonicalize('http://127.0.0.1:18080/other.php?module=VEMSVehicles&view=List'), null);
  assert.equal(canonicalize('http://127.0.0.1:18080/index.php?module=VEMSVehicles'), null, 'a view is required');
});

test('presentation-only parameters do not create new pages', () => {
  const a = canonicalize('http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=List&app=SUPPORT&orderby=x&page=2');
  const b = canonicalize('http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=List');
  assert.equal(a.key, b.key);
  const c = canonicalize('http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=Detail&record=4&relatedModule=VEMSAssignments&mode=showRelatedList&relationId=181&tab_label=Assignments');
  assert.notEqual(c.key, canonicalize('http://127.0.0.1:18080/index.php?module=VEMSVehicles&view=Detail&record=4').key);
});

test('page classification separates expected denials from defects', () => {
  assert.equal(classifyPage({ status: 200, html: '<html>'.padEnd(200, 'x') }).kind, 'OK');
  assert.equal(classifyPage({ status: 404, html: '' }).kind, 'DEAD_HTTP');
  assert.equal(classifyPage({ status: 500, html: 'x' }).kind, 'DEAD_HTTP');
  assert.equal(classifyPage({ status: 200, html: '<div>Permission denied</div><a>Go back</a>' }).kind, 'DENIED');
  assert.equal(classifyPage({ status: 200, html: '<b>Warning</b>:  Undefined array key "X" in <b>f.php</b>' }).kind, 'PHP_ERROR');
  assert.equal(classifyPage({ status: 200, html: '<b>Fatal error</b>: Uncaught Error: boom' }).kind, 'PHP_ERROR');
  assert.equal(classifyPage({ status: 200, html: '<input name="username"><input name="password" type="password">' }).kind, 'SESSION_LOST');
  assert.equal(classifyPage({ status: 200, html: '<div>The record you are trying to view does not exist</div>' }).kind, 'NOT_FOUND');
  assert.equal(classifyPage({ status: 200, html: '' }).kind, 'EMPTY');
  // "Permission denied" inside a large normal page is not a denial page.
  assert.equal(classifyPage({ status: 200, html: '<p>' + 'lorem ipsum '.repeat(80) + 'Permission denied</p>' }).kind, 'OK');
});

test('an edit form needs fields and a Save button', () => {
  const fields = ['a', 'b', 'c'].map((n) => `<input type="text" name="${n}">`).join('');
  assert.equal(isFormRendered(`<form>${fields}<button type="submit">Save</button></form>`), true);
  assert.equal(isFormRendered(`<form>${fields}</form>`), false);
  assert.equal(isFormRendered('<div>Permission denied</div>'), false);
});

test('follow rules keep VEMS modules deep and other apps shallow', () => {
  const own = ['VEMSVehicles', 'HelpDesk'];
  const detail = { module: 'VEMSVehicles', view: 'Detail', record: '4' };
  assert.equal(shouldFollow(detail, 2, own), true);
  assert.equal(shouldFollow(detail, 3, own), false, 'depth cap');
  assert.equal(shouldFollow({ module: 'Leads', view: 'List', record: '' }, 1, own), true, 'other app list, one level');
  assert.equal(shouldFollow({ module: 'Leads', view: 'Detail', record: '9' }, 1, own), false, 'other app records not followed');
  assert.equal(shouldFollow({ module: 'Leads', view: 'List', record: '' }, 2, own), false);
  assert.equal(shouldFollow(null, 0, own), false);
});

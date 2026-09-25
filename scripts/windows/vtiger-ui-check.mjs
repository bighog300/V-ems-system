// Local gate for the isolated vems-audit-147 stack: signs in through Vtiger's real web form as each
// account, reads audit.env in-process only (nothing secret is printed), and checks List/Detail/Import.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { main as guard } from './vtiger-audit.mjs';
import { parseEnvText } from './development-bootstrap.mjs';
import { MODULES, analyzeList, analyzeDetail, isImportDenied } from './vtiger-ui-check-lib.mjs';

const BASE = 'http://127.0.0.1:18080/index.php';
const label = process.argv[2] || 'run';
await guard('inspect');
const env = Object.fromEntries(parseEnvText(readFileSync(resolve(process.env.LOCALAPPDATA, 'VEMS-Audit/issue-147/audit.env'), 'utf8')));
// Modules whose first record must show linked reference fields, and the modules they must link to.
// (VEMSStockUsage is omitted: its only record is the empty #148 boundary fixture.)
const EXPECTED_REFERENCE_TARGETS = {
  VEMSAssignments: ['HelpDesk', 'VEMSVehicles'],
  VEMSAssignmentCrew: ['VEMSAssignments', 'VEMSPersonnel'],
  VEMSVehicleStock: ['VEMSStockItems', 'VEMSVehicles'],
};
const accounts = [
  ['Dispatcher', 'VTIGER_DISPATCHER', false], ['Fleet Manager', 'VTIGER_FLEET_MANAGER', false],
  ['Stock Manager', 'VTIGER_STOCK_MANAGER', false], ['Supervisor', 'VTIGER_SUPERVISOR', false],
  ['Integration user', 'VTIGER', true],
];

class Session {
  jar = new Map();
  async request(url, init = {}) {
    const headers = { ...(init.headers || {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    const response = await fetch(url, { ...init, headers, redirect: 'manual' });
    for (const c of response.headers.getSetCookie?.() ?? []) { const [pair] = c.split(';'); const i = pair.indexOf('='); this.jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) return this.request(new URL(response.headers.get('location'), url).href);
    return { status: response.status, html: await response.text() };
  }
  async login(username, password) {
    const page = await this.request(`${BASE}?module=Users&view=Login`);
    const token = (page.html.match(/name="__vtrftk"[^>]*value="([^"]+)"/) || page.html.match(/__vtrftk['"]?\s*[:=]\s*['"]([^'"]+)/) || [])[1];
    const body = new URLSearchParams({ module: 'Users', action: 'Login', username, password, ...(token ? { __vtrftk: token } : {}) });
    const done = await this.request(BASE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    return !/name="username"/.test(done.html);
  }
}

const report = { label, timestamp: new Date().toISOString(), roles: {}, failures: [] };
for (const [role, prefix, expectsEdit] of accounts) {
  const s = new Session();
  const user = env[`${prefix}_USERNAME`], pass = env[`${prefix}_PASSWORD`];
  if (!user || !pass || !(await s.login(user, pass))) { report.roles[role] = { signIn: 'FAIL' }; report.failures.push(`${role}: sign-in failed`); continue; }
  const results = {};
  for (const module of MODULES) {
    const list = analyzeList((await s.request(`${BASE}?module=${module}&view=List`)).html);
    const detail = list.firstRecordId
      ? analyzeDetail((await s.request(`${BASE}?module=${module}&view=Detail&record=${list.firstRecordId}`)).html, module)
      : { warnings: [], fieldLabels: 0, editControl: false, linkedReferenceFields: 0, referenceTargets: [], relatedTabs: [] };
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
  report.roles[role] = { signIn: 'PASS', modules: results };
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

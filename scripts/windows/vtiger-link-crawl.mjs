// Read-only link crawl of the isolated vems-audit-147 stack. For each of the five accounts it signs in through
// Vtiger's real web login (audit.env is read in-process, nothing secret is printed), then follows every
// read-only link reachable from the dashboard and the eight modules with plain GET requests, recording dead
// links, PHP errors, missing records and links a role is offered but denied. It also opens every module's Edit
// and Create form (GET only, nothing is saved) to show which roles are actually given a form.
//   node scripts/windows/vtiger-link-crawl.mjs <label> [--max=250]
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { main as guard } from './vtiger-audit.mjs';
import { BASE, ACCOUNTS, loadAuditEnv, signIn } from './vtiger-session.mjs';
import { MODULES, analyzeList } from './vtiger-ui-check-lib.mjs';
import { extractLinks, canonicalize, classifyPage, isFormRendered, shouldFollow } from './vtiger-link-crawl-lib.mjs';

const label = process.argv[2] || 'run';
const max = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=250').split('=')[1]);
await guard('inspect');
const env = loadAuditEnv();
const DEFECTS = new Set(['DEAD_HTTP', 'NOT_FOUND', 'PHP_ERROR', 'EMPTY', 'SESSION_LOST']);
const report = { label, timestamp: new Date().toISOString(), maxPagesPerRole: max, roles: {}, defects: [] };

for (const [role, prefix, hasEditControl] of ACCOUNTS) {
  const session = await signIn(env, prefix);
  if (!session) { report.roles[role] = { signIn: 'FAIL' }; report.defects.push(`${role}: sign-in failed`); continue; }
  const get = (url) => session.request(url);
  const seen = new Map();            // key -> { url, from, depth, kind, detail }
  const queue = [];
  const enqueue = (url, from, depth) => {
    const c = canonicalize(url);
    if (!c || seen.has(c.key) || !shouldFollow(c, depth, MODULES)) return;
    seen.set(c.key, { url: c.url, from, depth, kind: 'PENDING', detail: '' });
    queue.push({ ...c, from, depth });
  };
  // Seeds: dashboard, every module's list, and the first two records of each module.
  enqueue(`${BASE}?module=Home&view=DashBoard`, '(seed)', 0);
  const firstIds = {};
  for (const module of MODULES) {
    const listUrl = `${BASE}?module=${module}&view=List`;
    enqueue(listUrl, '(seed)', 0);
    const ids = analyzeList((await get(listUrl)).html).recordIds.slice(0, 2);
    firstIds[module] = ids[0];
    for (const id of ids) enqueue(`${BASE}?module=${module}&view=Detail&record=${id}`, '(seed)', 0);
  }
  let visited = 0;
  while (queue.length && visited < max) {
    const page = queue.shift();
    const response = await get(page.url);
    const result = classifyPage(response);
    Object.assign(seen.get(page.key), result);
    visited += 1;
    if (result.kind === 'OK') for (const link of extractLinks(response.html, page.url)) enqueue(link.url, page.url, page.depth + 1);
  }
  // Edit and Create forms per module (GET only).
  const forms = {};
  for (const module of MODULES) {
    const id = firstIds[module];
    const probe = async (url) => { const r = await get(url); const c = classifyPage(r); return isFormRendered(r.html) ? 'FORM' : c.kind === 'OK' ? 'NO_FORM' : c.kind; };
    forms[module] = { edit: id ? await probe(`${BASE}?module=${module}&view=Edit&record=${id}`) : 'NO_RECORD', create: await probe(`${BASE}?module=${module}&view=Edit`) };
  }
  const pages = [...seen.values()];
  const byKind = {};
  for (const p of pages) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  const defects = pages.filter((p) => DEFECTS.has(p.kind));
  const moduleOf = (url) => new URL(url).searchParams.get('module');
  const audited = (p) => MODULES.includes(moduleOf(p.url)) || moduleOf(p.url) === 'Home';
  report.roles[role] = {
    signIn: 'PASS', pagesVisited: visited, uniquePagesSeen: pages.length, notVisitedDueToCap: queue.length, byKind,
    defectsInAuditedModules: defects.filter(audited).map((p) => ({ url: p.url, kind: p.kind, detail: p.detail, from: p.from })),
    defectsInOtherApps: defects.filter((p) => !audited(p)).map((p) => ({ url: p.url, kind: p.kind, detail: p.detail, from: p.from })),
    offeredButDenied: pages.filter((p) => p.kind === 'DENIED').map((p) => ({ url: p.url, from: p.from })),
    editAndCreateForms: forms, expectedToHaveEditControl: hasEditControl,
  };
  for (const d of pages.filter((p) => p.kind === 'DENIED')) report.offeredButDeniedTotal = (report.offeredButDeniedTotal || 0) + 1;
  for (const d of defects) report.defects.push(`${role}: ${d.kind} ${d.url} (${d.detail}) from ${d.from}`);
  await session.request(`${BASE}?module=Users&action=Logout`);
}
report.result = report.defects.length ? 'FAIL' : 'PASS';
report.summary = Object.fromEntries(Object.entries(report.roles).filter(([, r]) => r.signIn === 'PASS').map(([role, r]) => [role, { pagesVisited: r.pagesVisited, defectsInAuditedModules: r.defectsInAuditedModules.length, defectsInOtherApps: r.defectsInOtherApps.length, offeredButDenied: r.offeredButDenied.length }]));
const out = resolve('docs/vtiger/evidence/issue-147');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, `link-crawl-${label}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(`link-crawl ${label}: ${report.result}, ${report.defects.length} defect(s)`);
console.log('  ' + JSON.stringify(report.summary));
for (const [role, r] of Object.entries(report.roles)) if (r.signIn === 'PASS') console.log(`  ${role.padEnd(17)} visited ${String(r.pagesVisited).padStart(3)}  ${JSON.stringify(r.byKind)}  capLeft=${r.notVisitedDueToCap}`);
process.exitCode = report.defects.length ? 1 : 0;

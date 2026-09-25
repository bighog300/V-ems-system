// Pure helpers for the Vtiger link crawler (no I/O, unit tested). The crawler only ever issues GET requests for
// read-only "view=" pages; anything that could change state (action=, logout, delete, export, mass actions, the
// Users and Settings areas) is never followed.
import { phpWarnings } from './vtiger-ui-check-lib.mjs';

const ORIGIN = 'http://127.0.0.1:18080';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/&quot;/g, '"');
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Anchors and list-row record URLs on a page, resolved against the page URL. */
export function extractLinks(html, pageUrl) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) out.push({ raw: decode(m[2]), text: text(m[3]).slice(0, 60) });
  for (const m of html.matchAll(/data-recordurl\s*=\s*(["'])(.*?)\1/gi)) out.push({ raw: decode(m[2]), text: '(row)' });
  const links = [];
  for (const { raw, text: label } of out) {
    if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(raw)) continue;
    try { links.push({ url: new URL(raw, pageUrl).href, text: label }); } catch { /* malformed href: ignore */ }
  }
  return links;
}

const UNSAFE_VIEW = /(Ajax|Export|Print|Pdf|Popup|Mass|Logout|Delete|Download|Upload|Import)/i;

/**
 * A crawlable read-only page, or null. Returns { key, url, module, view, record }.
 * The key ignores presentation noise (app, sort order, paging) so each logical page is visited once.
 */
export function canonicalize(rawUrl) {
  let u; try { u = new URL(rawUrl); } catch { return null; }
  if (u.origin !== ORIGIN || u.pathname !== '/index.php') return null;
  const p = u.searchParams;
  const module = p.get('module'), view = p.get('view');
  if (!module || !view) return null;
  if (p.has('action') || p.get('parent') === 'Settings' || module === 'Users' || module === 'Settings') return null;
  if (UNSAFE_VIEW.test(view)) return null;
  const record = p.get('record') || '';
  const key = [module, view, record, p.get('relatedModule') || '', p.get('mode') || '', p.get('viewname') || '', p.get('tab_label') || ''].join('|');
  return { key, url: u.href, module, view, record };
}

/** What a fetched page turned out to be. Only DENIED is an expected outcome; the others are defects. */
export function classifyPage({ status, html }) {
  if (status >= 400) return { kind: 'DEAD_HTTP', detail: `HTTP ${status}` };
  if (/name="username"/.test(html) && /name="password"/.test(html)) return { kind: 'SESSION_LOST', detail: 'sign-in form returned' };
  const warnings = phpWarnings(html);
  if (warnings.length) return { kind: 'PHP_ERROR', detail: warnings.slice(0, 3).join(' | ') };
  const body = text(html);
  if (/Permission denied/i.test(body) && body.length < 400) return { kind: 'DENIED', detail: 'Permission denied' };
  if (/record you are trying to (view|access)|LBL_RECORD_NOT_FOUND|record (does not|doesn'?t) exist|record has been deleted/i.test(body) && body.length < 600) return { kind: 'NOT_FOUND', detail: body.slice(0, 80) };
  if (html.length < 80) return { kind: 'EMPTY', detail: `${html.length} bytes` };
  return { kind: 'OK', detail: '' };
}

/** Is this an edit/create form actually rendered (fields plus a Save button)? */
export function isFormRendered(html) {
  const inputs = [...html.matchAll(/<input\b[^>]*type=["']text["'][^>]*name=["']([^"']+)["']|<input\b[^>]*name=["']([^"']+)["'][^>]*type=["']text["']/gi)].length;
  const save = /<button[^>]*type=["']submit["'][^>]*>[\s\S]*?Save[\s\S]*?<\/button>/i.test(html);
  return inputs >= 3 && save;
}

/** Whether a link found on a page should be queued, given the module it points at and how deep we are. */
export function shouldFollow(candidate, depth, ownModules, maxDepth = 3) {
  if (!candidate) return false;
  if (ownModules.includes(candidate.module)) return depth < maxDepth;
  // Other apps in the menu (Sales, Marketing, ...): only confirm their list page opens, nothing deeper.
  return candidate.view === 'List' && !candidate.record && depth < 2;
}

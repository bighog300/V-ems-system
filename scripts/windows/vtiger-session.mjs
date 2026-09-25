// Shared by the audit gate and the link crawler: a cookie-keeping HTTP session that signs in through Vtiger's
// real web login form. Credentials are read from the audit runtime's audit.env inside the process only and are
// never printed or returned.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnvText } from './development-bootstrap.mjs';

export const BASE = 'http://127.0.0.1:18080/index.php';
export const ORIGIN = 'http://127.0.0.1:18080';

// [label, env prefix, has an edit control by design]
export const ACCOUNTS = [
  ['Dispatcher', 'VTIGER_DISPATCHER', false], ['Fleet Manager', 'VTIGER_FLEET_MANAGER', false],
  ['Stock Manager', 'VTIGER_STOCK_MANAGER', false], ['Supervisor', 'VTIGER_SUPERVISOR', false],
  ['Integration user', 'VTIGER', true],
];

export function loadAuditEnv() {
  return Object.fromEntries(parseEnvText(readFileSync(resolve(process.env.LOCALAPPDATA, 'VEMS-Audit/issue-147/audit.env'), 'utf8')));
}

export class Session {
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

/** Sign in as one of ACCOUNTS; returns a Session or null. */
export async function signIn(env, prefix) {
  const user = env[`${prefix}_USERNAME`], pass = env[`${prefix}_PASSWORD`];
  if (!user || !pass) return null;
  const session = new Session();
  return (await session.login(user, pass)) ? session : null;
}

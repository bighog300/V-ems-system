#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const runFile = promisify(execFile);
const DEFAULT_ADB = process.platform === 'win32' ? 'E:\\EvidessaDev\\android\\sdk\\platform-tools\\adb.exe' : '/mnt/e/EvidessaDev/android/sdk/platform-tools/adb.exe';
const DEFAULT_DEVICE = 'emulator-5554';
const PACKAGE = 'org.vems.mobilecrew';
const ACTIVITY = 'MainActivity';
const DEFAULT_API = 'http://127.0.0.1:3001';
const DEFAULT_DEEP_LINK = 'exp+mobile-crew://expo-development-client/?url=http%3A%2F%2F172.22.103.130%3A8082';
const DEFAULT_EVIDENCE = process.platform === 'win32' ? 'E:\\s14b\\stage14-evidence' : '/tmp/stage14-android-evidence';
const VEMS_STATES = new Set(['vems_login', 'vems_jobs', 'vems_incident', 'vems_patient_case', 'vems_identity']);

export class DriverError extends Error {}

export function decodeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function parseBounds(raw) {
  const m = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(raw ?? '');
  if (!m) throw new DriverError(`invalid bounds: ${raw}`);
  return m.slice(1).map(Number);
}

export function parseNodes(xml) {
  const nodes = [];
  for (const match of xml.matchAll(/<node\b([^>]*)\/?>(?:<\/node>)?/g)) {
    const attrs = {};
    for (const attr of match[1].matchAll(/([\w:-]+)="((?:&quot;|&apos;|&lt;|&gt;|&amp;|[^"\r\n])*)"/g)) attrs[attr[1]] = decodeXml(attr[2]);
    if (attrs.bounds) nodes.push({attrs, bounds: parseBounds(attrs.bounds), get center() { const [l,t,r,b] = this.bounds; return [Math.floor((l+r)/2), Math.floor((t+b)/2)]; }});
  }
  return nodes;
}

export function findElement(xml, selector) {
  const found = parseNodes(xml).filter(n => Object.entries(selector).every(([k,v]) => n.attrs[k.replaceAll('_','-')] === v));
  if (found.length !== 1) throw new DriverError(`selector ${JSON.stringify(selector)} matched ${found.length} elements`);
  return found[0];
}

export function hasElement(xml, selector) { try { findElement(xml, selector); return true; } catch { return false; } }

export function classifyHierarchy(xml, foreground = '') {
  const nodes = parseNodes(xml); const ids = new Set(nodes.map(n => n.attrs['resource-id'] ?? ''));
  const texts = new Set(nodes.flatMap(n => [n.attrs.text, n.attrs['content-desc']]).filter(Boolean));
  if (foreground.includes('com.android.settings')) return 'android_settings';
  if (ids.has('com.google.android.apps.nexuslauncher:id/launcher') || foreground.includes('NexusLauncherActivity')) return 'expo_launcher_home';
  const markers = [['login-screen','vems_login'],['jobs-list-screen','vems_jobs'],['incident-detail-screen','vems_incident'],['patient-case-detail-screen','vems_patient_case'],['patient-identity-screen','vems_identity']];
  for (const [id,state] of markers) if (ids.has(id)) return state;
  // Expo DevLauncher can expose only its "Tools" label while the panel is
  // opening. Treat that as the overlay only when no VEMS screen marker is
  // present, so the persistent app chrome does not trigger recovery.
  if (texts.has('Tools') || ['Change bundle','Reload','Development server','Open dev menu'].some(x => texts.has(x))) return 'expo_tools_overlay';
  return 'unknown';
}

export function recoveryAction(state) { return ({expo_tools_overlay:'deep_link', expo_launcher_home:'deep_link', android_settings:'back_then_deep_link', vems_login:'none', vems_jobs:'none', vems_incident:'none', vems_patient_case:'none', vems_identity:'none'})[state] ?? 'abort'; }

export function imeWindowVisible(block) {
  if (!block.includes('isVisible=true') || !block.includes('isOnScreen=true')) return false;
  const surface = /surface=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(block);
  if (!surface || (block.includes('mHasSurface=') && !block.includes('mHasSurface=true'))) return false;
  if (+surface[3] <= +surface[1] || +surface[4] <= +surface[2]) return false;
  return true;
}

export function inputShownObscures(xml, inputState, screenHeight) {
  if (!/\bmInputShown=true\b/.test(inputState)) return false;
  const focusedInput = parseNodes(xml).some(n => n.attrs.focused === 'true' && n.attrs.class?.includes('EditText'));
  const submit = parseNodes(xml).find(n => n.attrs['resource-id'] === 'submit-sign-in');
  return focusedInput && Boolean(submit) && submit.bounds[3] > screenHeight * 0.65;
}

export function rectIsNonZero([left, top, right, bottom] = []) { return Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom) && right > left && bottom > top; }
export function rectsIntersect(a, b) { return rectIsNonZero(a) && rectIsNonZero(b) && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
export function staticLoginTapAllowed({imeVisible, foreground, state, loginPresent, apiUrl, actorId, actorRole, tokenPresent, submitVisible, submitEnabled, allowDisabled=false, allowEmpty=false, header, imeBounds, signInTapped, mutationArmed}) {
  const attrs = header?.attrs ?? {};
  const staticHeader = header && attrs.text === 'V-EMS Crew' && !attrs.resource_id && attrs.class?.includes('EditText') !== true && attrs.editable !== 'true' && attrs.clickable !== 'true' && attrs.checkable !== 'true' && attrs.focusable !== 'true' && attrs['long-clickable'] !== 'true' && rectIsNonZero(header.bounds) && rectIsNonZero(imeBounds) && !rectsIntersect(header.bounds, imeBounds);
  return imeVisible === true && foreground.includes(PACKAGE) && foreground.includes(ACTIVITY) && state === 'vems_login' && loginPresent === true && apiUrl === 'http://127.0.0.1:3001' && actorId === 'STAFF-001' && actorRole === 'field_crew' && (tokenPresent === true || allowEmpty === true) && submitVisible === true && (submitEnabled === true || allowDisabled === true) && staticHeader === true && signInTapped === false && mutationArmed === false;
}
export function staticLoginTapPostconditions({imeVisible, foreground, state, loginPresent, apiUrl, actorId, actorRole, tokenPresent, tokenLength, expectedLength, submitVisible, submitEnabled, requireEnabled=true, allowEmpty=false}) {
  return imeVisible === false && foreground.includes(PACKAGE) && foreground.includes(ACTIVITY) && state === 'vems_login' && loginPresent === true && apiUrl === 'http://127.0.0.1:3001' && actorId === 'STAFF-001' && actorRole === 'field_crew' && (tokenPresent === true || allowEmpty === true) && (expectedLength === null || tokenLength === expectedLength) && submitVisible === true && (submitEnabled === true || requireEnabled === false);
}

export function adbRetryLimit(args) { const a = args.map(String); return a.includes('input') && ['tap','swipe','keyevent'].some(x => a.includes(x)) ? 0 : 2; }
export function claimSingleMutation(used) { if (used) throw new DriverError('single mutation guard already used'); return true; }
export function secretMetadata(secret) { return {length: secret.length, sha256_prefix: crypto.createHash('sha256').update(secret).digest('hex').slice(0,12)}; }
export function tokenDisplayIsEmpty(text, submitEnabled) { return text === '' || text === 'Session token' || (submitEnabled === false && /^[\u2022\u00b7*…�]+$/.test(text)); }
export function developmentLoginAction({state, foreground, buttonPresent, buttonEnabled, alreadyUsed=false}) {
  if (alreadyUsed) throw new DriverError('development test login is single-use');
  if (state !== 'vems_login' || !foreground.includes(PACKAGE) || !foreground.includes(ACTIVITY)) throw new DriverError('development login requires VEMS LoginScreen');
  if (!buttonPresent || !buttonEnabled) throw new DriverError('development test login is not visible and enabled');
  return true;
}

export function normalizeNonSecretValue(value, normalize) { return normalize ? normalize(value) : value; }
export function displayedNonSecretValue(node) {
  const text = node?.attrs?.text ?? '';
  const hint = node?.attrs?.['content-desc'] ?? '';
  return text === hint || ['First name', 'Last name', 'DOB (YYYY-MM-DD)', 'Known address', 'Sex', 'Role (e.g. field_crew)', 'Crew member ID'].includes(text) ? '' : text;
}
export function nonSecretFieldEntryDecision(observed, expected, normalize) {
  const actual = normalizeNonSecretValue(observed ?? '', normalize);
  const target = normalizeNonSecretValue(expected, normalize);
  if (actual === target) return 'accept';
  if (actual === '') return 'retry-empty';
  return 'retry-replace';
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class AndroidUiDriver {
  constructor({adb=DEFAULT_ADB, device=DEFAULT_DEVICE, evidenceDir=DEFAULT_EVIDENCE, apiUrl=DEFAULT_API, developmentClientUrl=DEFAULT_DEEP_LINK} = {}) {
    this.adbBin = adb; this.device = device; this.evidenceDir = evidenceDir; this.apiUrl = apiUrl; this.developmentClientUrl = developmentClientUrl; this.mutationUsed = false; this.signInTapped = false; this.developmentLoginUsed = false; this.currentCaseId = null;
    fs.mkdirSync(evidenceDir, {recursive:true});
  }
  async developmentTestLogin() {
    let current = await this.observe('development-login-current', true);
    let currentState = classifyHierarchy(current.xml, current.fg);
    for (let i = 0; i < 4 && VEMS_STATES.has(currentState) && !['vems_login', 'vems_jobs'].includes(currentState); i++) {
      await this.adb('shell', 'input', 'keyevent', '4'); await sleep(500);
      current = await this.observe(`development-return-to-jobs-${i}`); currentState = classifyHierarchy(current.xml, current.fg);
    }
    if (currentState === 'vems_jobs' && !hasElement(current.xml, {'resource_id':'jobs-error'})) { console.log('DEVELOPMENT_AUTH_PASS_REUSED'); return; }
    if (currentState === 'vems_jobs' && hasElement(current.xml, {'resource_id':'jobs-error'})) await this.tapOnce({'resource_id':'sign-out'}, x => hasElement(x, {'resource_id':'login-screen'}), 10, 'sign-out-stale-session');
    await this.stableLogin();
    await this.replaceText({'resource_id':'input-api-base-url'}, this.apiUrl, 'development-api-url');
    await this.setNonsecretTextField({'resource_id':'input-actor-id'}, 'STAFF-001', {label:'development-actor', expectedState:'vems_login'});
    await this.setNonsecretTextField({'resource_id':'input-actor-role'}, 'field_crew', {label:'development-role', expectedState:'vems_login'});
    await this.setNonsecretTextField({'resource_id':'input-auth-token'}, '', {label:'development-empty-token', expectedState:'vems_login', expectedCaseId:null});
    await this.dismissRealImeByStaticLoginTap({'resource_id':'input-auth-token'}, null, {allowDisabled:true, allowEmpty:true});
    await this.ensureElementVisible({'resource_id':'submit-sign-in'}, 'development-submit', {requireEnabled:false});
    const before = await this.observe('before-development-test-login', true);
    const button = findElement(before.xml, {'resource_id':'development-test-login'});
    developmentLoginAction({state:classifyHierarchy(before.xml, before.fg), foreground:before.fg, buttonPresent:true, buttonEnabled:button.attrs.enabled !== 'false', alreadyUsed:this.developmentLoginUsed});
    await this.adb('shell', 'input', 'tap', ...button.center); this.developmentLoginUsed = true;
    await this.waitFor(x => hasElement(x, {'resource_id':'jobs-list-screen'}), 20, 'development-test-login');
    await this.waitFor(x => hasElement(x, {'resource_id':'jobs-list-screen'}) && (hasElement(x, {'resource_id':'synthetic-test-session'}) || parseNodes(x).some(n => n.attrs.text === 'Sign out')), 5, 'development-authenticated-jobs');
    console.log('DEVELOPMENT_AUTH_PASS');
  }
  async developmentC1(expiresAt) {
    if (!Number.isInteger(expiresAt)) throw new DriverError('development session expiry metadata is required');
    await this.developmentTestLogin();
    await this.waitFor(x => hasElement(x, {'resource_id':'job-ASN-000001'}), 15, 'assignment');
    await this.tapOnce({'resource_id':'job-ASN-000001'}, x => hasElement(x, {'resource_id':'incident-detail-screen'}), 15, 'assignment-open');
    await this.waitFor(x => new Set(parseNodes(x).map(n => n.attrs.text)).has('INC-000001'), 15, 'incident-id');
    await this.tapOnce({'resource_id':'patient-case-PCR-000001'}, x => hasElement(x, {'resource_id':'patient-case-detail-screen'}), 15, 'pcr-open');
    const caseView = await this.observe('verified-pcr-000001-context', true);
    if (!parseNodes(caseView.xml).some(n => n.attrs.text?.includes('PCR-000001'))) throw new DriverError('PCR-000001 was not visible before identity navigation');
    this.currentCaseId = 'PCR-000001';
    await this.tapOnce({'resource_id':'open-identity'}, x => hasElement(x, {'resource_id':'patient-identity-screen'}), 15, 'identity-open');
    await this.setNonsecretTextField({'resource_id':'search-first-name'}, 'Stage', {label:'given-name'});
    await this.setNonsecretTextField({'resource_id':'search-last-name'}, 'Alpha', {label:'family-name'});
    await this.setNonsecretTextField({'resource_id':'search-dob'}, '2000-01-02', {label:'date-of-birth'});
    await this.observe('pre-search-identity-form', true);
    await this.tapOnce({'resource_id':'search-submit'}, x => hasElement(x, {'resource_id':'search-results'}), 20, 'search');
    const results = await this.observe('verified-search-results', true);
    if (!parseNodes(results.xml).some(n => (n.attrs.text ?? '').trim().replace(/[.!?]+$/, '') === 'No matching patients found')) throw new DriverError('search did not render zero-match text');
    await this.tapOnce({'resource_id':'patient-create-new-option'}, x => hasElement(x, {'resource_id':'patient-create-form'}), 5, 'show-create');
    await this.setNonsecretTextField({'resource_id':'create-sex'}, 'X', {label:'sex'});
    const before = await this.observe('before-development-create-and-link', true);
    const button = findElement(before.xml, {'resource_id':'create-and-link'});
    if (button.attrs.enabled === 'false') throw new DriverError('Create and link disabled');
    const remaining = expiresAt - Math.floor(Date.now() / 1000);
    if (remaining < 90) throw new DriverError(`aborting before mutation with only ${remaining}s remaining`);
    await this.tapOnce({'resource_id':'create-and-link'}, x => hasElement(x, {'resource_id':'patient-case-detail-screen'}), 30, 'create-and-link', true);
    console.log('DEVELOPMENT_C1_PASS remaining_at_mutation>=90');
  }
  async developmentC1AfterSearch(expiresAt) {
    if (!Number.isInteger(expiresAt)) throw new DriverError('development session expiry metadata is required');
    const current = await this.observe('resume-after-search', true);
    if (classifyHierarchy(current.xml, current.fg) !== 'vems_identity' || !hasElement(current.xml, {'resource_id':'search-results'})) throw new DriverError('resume requires rendered identity search results');
    if (!parseNodes(current.xml).some(n => (n.attrs.text ?? '').trim().replace(/[.!?]+$/, '') === 'No matching patients found')) throw new DriverError('resume requires rendered zero-match text');
    await this.tapOnce({'resource_id':'patient-create-new-option'}, x => hasElement(x, {'resource_id':'patient-create-form'}), 5, 'show-create-resume');
    await this.setNonsecretTextField({'resource_id':'create-sex'}, 'X', {label:'sex'});
    const before = await this.observe('before-development-create-and-link-resume', true);
    const button = findElement(before.xml, {'resource_id':'create-and-link'});
    if (button.attrs.enabled === 'false') throw new DriverError('Create and link disabled');
    const remaining = expiresAt - Math.floor(Date.now() / 1000);
    if (remaining < 90) throw new DriverError(`aborting before mutation with only ${remaining}s remaining`);
    await this.tapOnce({'resource_id':'create-and-link'}, x => hasElement(x, {'resource_id':'patient-case-detail-screen'}), 30, 'create-and-link-resume', true);
    console.log(`DEVELOPMENT_C1_RESUME_PASS remaining_at_mutation>=90`);
  }
  async adb(...args) {
    const retries = adbRetryLimit(args); let last;
    for (let attempt=0; attempt<=retries; attempt++) {
      try { const result = await runFile(this.adbBin, ['-s', this.device, ...args.map(String)], {encoding:'utf8', timeout:8000}); if (!result.stdout) return ''; return result.stdout.trim(); }
      catch (error) { last=error; const text=String(error.stderr || error.stdout || error.message).toLowerCase(); if (attempt===retries || !['socket failed','device offline','cannot connect','transport','could not get idle state'].some(x=>text.includes(x))) break; await sleep(250); }
    }
    throw new DriverError(`adb failed: ${args.join(' ')}: ${last?.stderr ?? last?.message ?? 'unknown'}`);
  }
  async adbUnchecked(...args) { try { return await this.adb(...args); } catch { return ''; } }
  async clipboardWrite(value) {
    const command = process.platform === 'win32' ? 'cmd.exe' : '/mnt/c/Windows/System32/cmd.exe';
    const args = ['/c', 'clip'];
    await new Promise((resolve, reject) => { const child = spawn(command, args, {stdio: ['pipe', 'ignore', 'ignore']}); child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(`clipboard write failed: ${code}`))); child.stdin.end(value); });
  }
  async clipboardClear() { await this.clipboardWrite(''); }
  async clipboardLength() {
    if (process.platform !== 'win32') return null;
    const result = await runFile('powershell.exe', ['-NoProfile', '-Command', '$v=Get-Clipboard -Raw -ErrorAction SilentlyContinue; if($null -eq $v){0}else{$v.Length}'], {encoding:'utf8', timeout:5000});
    return Number(result.stdout.trim());
  }
  async foreground() { return (await this.adb('shell','dumpsys','activity','activities')).split('\n').filter(x=>/mResumedActivity|topResumedActivity|org\.vems/.test(x)).join('\n'); }
  async hierarchy(label) { const remote=`/sdcard/stage14-${label}.xml`; const local=path.join(this.evidenceDir,`${Date.now()}-${label}.xml`); for(let i=0;i<3;i++){ await this.adb('shell','uiautomator','dump',remote); try { await runFile(this.adbBin,['-s',this.device,'pull',remote,local],{encoding:'utf8',timeout:8000}); if(fs.statSync(local).size) return fs.readFileSync(local,'utf8'); } catch {} } throw new DriverError(`unable to obtain hierarchy for ${label}`); }
  async screenshot(label) { const remote=`/sdcard/stage14-${label}.png`; const local=path.join(this.evidenceDir,`${Date.now()}-${label}.png`); await this.adb('shell','screencap','-p',remote); await runFile(this.adbBin,['-s',this.device,'pull',remote,local],{encoding:'utf8',timeout:8000}); }
  async observe(label, shot=false) { const xml=await this.hierarchy(label); const fg=await this.foreground(); if(shot) await this.screenshot(label); return {xml,fg}; }
  async state(label) { const {xml,fg}=await this.observe(label,true); return classifyHierarchy(xml,fg); }
  async recoverToVems() { let {xml,fg}=await this.observe('recovery-before',true); let state=classifyHierarchy(xml,fg); const action=recoveryAction(state); if(action==='abort') throw new DriverError(`unknown UI state: ${state}`); if(action==='none') return state; if(action==='back'||action==='back_then_deep_link'){ await this.adb('shell','input','keyevent','4'); for(let i=0;i<10;i++){({xml,fg}=await this.observe('recovery-poll')); state=classifyHierarchy(xml,fg); if(VEMS_STATES.has(state)) return state; await sleep(500);} if(action==='back') throw new DriverError('Back did not recover VEMS'); } await this.adb('shell','am','start','-W','-a','android.intent.action.VIEW','-d',this.developmentClientUrl,PACKAGE); for(let i=0;i<40;i++){({xml,fg}=await this.observe('deep-link-poll')); state=classifyHierarchy(xml,fg); if(VEMS_STATES.has(state)) return state; await sleep(500);} throw new DriverError('deep-link recovery timed out'); }
  async watchdog(expected) { const {xml,fg}=await this.observe('watchdog'); let state=classifyHierarchy(xml,fg); if(!VEMS_STATES.has(state)) state=await this.recoverToVems(); if(expected&&state!==expected) throw new DriverError(`expected ${expected}, found ${state}`); return state; }
  async waitFor(predicate, timeout, label) { const end=Date.now()+timeout*1000; while(Date.now()<end){ const {xml,fg}=await this.observe(`poll-${label}`); const state=classifyHierarchy(xml,fg); if(['expo_tools_overlay','expo_launcher_home','android_settings'].includes(state)){await this.recoverToVems(); continue;} if(await predicate(xml,fg)){await this.screenshot(`ready-${label}`); return {xml,fg};} await sleep(500);} await this.observe(`timeout-${label}`,true); throw new DriverError(`timeout waiting for ${label}`); }
  async stableLogin(seconds=10) { let start=Date.now(); while(Date.now()-start<seconds*1000){const {xml,fg}=await this.observe('stable-login-poll'); const good=classifyHierarchy(xml,fg)==='vems_login' && ['input-api-base-url','input-auth-token','submit-sign-in'].every(id=>hasElement(xml,{'resource_id':id})) && fg.includes('MainActivity'); if(!good){await this.recoverToVems(); start=Date.now(); continue;} await sleep(500);} }
  async tapOnce(selector, expected, timeout, label, mutating=false) { await this.watchdog(); const {xml}=await this.observe(`before-${label}`,true); const target=findElement(xml,selector); if(mutating){claimSingleMutation(this.mutationUsed); this.mutationUsed=true;} await this.adb('shell','input','tap',...target.center); if(label==='sign-in') this.signInTapped=true; return this.waitFor(expected,timeout,`after-${label}`); }
  async replaceText(selector,value,label) { const inputState=selector.resource_id?.startsWith('search-')||selector.resource_id==='create-sex'?'vems_identity':'vems_login'; await this.watchdog(inputState); const {xml}=await this.observe(`before-${label}`,true); const target=findElement(xml,selector); if(selector.resource_id==='input-auth-token' && value.length===0 && tokenDisplayIsEmpty(target.attrs.text??'', findElement(xml,{'resource_id':'submit-sign-in'}).attrs.enabled!=='false')) return; await this.adb('shell','input','tap',...target.center); const clearCount=(target.attrs.text??'').length; if(clearCount>0){ if(selector.resource_id==='input-auth-token'){ await this.adb('shell','input','keyevent','123'); for(let i=0;i<Math.max(clearCount,256);i++) await this.adb('shell','input','keyevent','67'); } else { await this.adb('shell','input','keyevent',...Array(clearCount).fill('67')); } } if(value.length>0) await this.adb('shell','input','text',value); await this.waitFor(x=>{const node=findElement(x,selector); const shown=node.attrs.text??''; if(value.length===0){ if(selector.resource_id==='input-auth-token'){ const submit=findElement(x,{'resource_id':'submit-sign-in'}); return tokenDisplayIsEmpty(shown,submit.attrs.enabled!=='false'); } return shown==='' || shown===node.attrs['content-desc'] || shown.startsWith('Role (e.g.'); } return shown===value;},5,label); }
  async setNonsecretTextField(selector, expectedValue, {label=selector.resource_id ?? 'field', normalize, expectedState='vems_identity', expectedCaseId='PCR-000001'}={}) {
    if (this.mutationUsed) throw new DriverError('non-secret field entry refused after mutation arm');
    let lastOutcome = 'abort';
    for (let attempt = 1; attempt <= 2; attempt++) {
      const {xml, fg} = await this.observe(`before-nonsecret-${label}-${attempt}`, true);
      const state = classifyHierarchy(xml, fg);
      if (!fg.includes(PACKAGE) || !fg.includes(ACTIVITY)) throw new DriverError(`${label}: wrong foreground`);
      if (state !== expectedState || (expectedState === 'vems_identity' && this.currentCaseId !== expectedCaseId)) throw new DriverError(`${label}: wrong screen or patient case`);
      const field = findElement(xml, selector);
      if (field.attrs.enabled === 'false' || !field.attrs.class?.includes('EditText')) throw new DriverError(`${label}: field is disabled or non-editable`);
      await this.adb('shell', 'input', 'tap', ...field.center);
      await this.adb('shell', 'input', 'keyevent', '123');
      for (let i = 0; i < Math.max((field.attrs.text ?? '').length, 256); i++) await this.adb('shell', 'input', 'keyevent', '67');
      const empty = await this.observe(`nonsecret-empty-${label}-${attempt}`);
      const emptyField = findElement(empty.xml, selector);
      if (displayedNonSecretValue(emptyField) !== '') throw new DriverError(`${label}: field did not clear before paste`);
      let transportFailed = false;
      try { await this.clipboardWrite(expectedValue); if (process.platform === 'win32' && await this.clipboardLength() !== expectedValue.length) throw new DriverError(`${label}: clipboard length mismatch`); await this.adb('shell', 'input', 'keyevent', '279'); } catch { transportFailed = true; }
      await this.clipboardClear();
      const after = await this.observe(`nonsecret-after-${label}-${attempt}`, true);
      const observed = displayedNonSecretValue(findElement(after.xml, selector));
      lastOutcome = nonSecretFieldEntryDecision(observed, expectedValue, normalize);
      if (lastOutcome === 'accept') { console.log(`NONSECRET_FIELD_PASS field=${label} expected_length=${expectedValue.length} attempt=${attempt}`); return; }
      if (transportFailed && lastOutcome === 'retry-replace' && attempt === 2) throw new DriverError(`${label}: ambiguous clipboard transport result`);
      if (attempt === 2) throw new DriverError(`${label}: value verification failed (${lastOutcome})`);
    }
    throw new DriverError(`${label}: value verification failed (${lastOutcome})`);
  }
  async pasteClipboardValue(selector, expectedLength, label='clipboard-paste') { await this.watchdog('vems_login'); const {xml}=await this.observe(`before-${label}`,true); const target=findElement(xml,selector); await this.adb('shell','input','tap',...target.center); await this.adb('shell','input','keyevent','279'); await this.waitFor(x=>(findElement(x,selector).attrs.text??'').length===expectedLength,5,label); }
  async pasteClipboardSecret(selector, expectedLength) { await this.pasteClipboardValue(selector, expectedLength, 'token-paste'); }
  async imeBounds() { const displays=await this.adb('shell','dumpsys','window','displays'); const block=displays.match(/ImeInsetsSourceProvider[\s\S]*?(?=\n\s*(?:InsetsSourceProvider|$))/)?.[0] ?? ''; const match=/(?:visibleFrame|frame)=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(block); return match ? match.slice(1).map(Number) : [0,0,0,0]; }
  async dismissRealImeByStaticLoginTap(selector, expectedLength=null, {allowDisabled=false, allowEmpty=false}={}) {
    const before=await this.observe('real-ime-static-tap-before',true);
    const token=findElement(before.xml,selector);
    const header=findElement(before.xml,{text:'V-EMS Crew'});
    const submit=findElement(before.xml,{'resource_id':'submit-sign-in'});
    const login=findElement(before.xml,{'resource_id':'login-screen'});
    const api=findElement(before.xml,{'resource_id':'input-api-base-url'});
    const actorId=findElement(before.xml,{'resource_id':'input-actor-id'});
    const actorRole=findElement(before.xml,{'resource_id':'input-actor-role'});
    const ime=await this.imeVisible();
    const imeBounds=await this.imeBounds();
    const size=await this.adb('shell','wm','size');
    const m=/(\d+)x(\d+)/.exec(size);
    const width=m?Number(m[1]):0;
    const height=m?Number(m[2]):0;
    const submitVisible=submit.bounds[0]>=0&&submit.bounds[1]>=0&&submit.bounds[2]<=width&&submit.bounds[3]<=height;
    const tokenText=token.attrs.text??'';
    const tokenPresent=rectIsNonZero(token.bounds) && (allowEmpty || tokenText.length>0);
    const allowed=staticLoginTapAllowed({imeVisible:ime,foreground:before.fg,state:classifyHierarchy(before.xml,before.fg),loginPresent:rectIsNonZero(login.bounds),apiUrl:api.attrs.text,actorId:actorId.attrs.text,actorRole:actorRole.attrs.text,tokenPresent,submitVisible,submitEnabled:submit.attrs.enabled!=='false',allowDisabled,allowEmpty,header,imeBounds,signInTapped:this.signInTapped,mutationArmed:this.mutationUsed});
    if(!ime) return false;
    if(!allowed) throw new DriverError('static LoginScreen tap preconditions failed');
    const length=tokenText.length;
    if(expectedLength!==null&&length!==expectedLength) throw new DriverError('token length did not match expected safe length');
    await this.adb('shell','input','tap',...header.center);
    const end=Date.now()+5000;
    while(Date.now()<end){
      const after=await this.observe('real-ime-static-tap-poll');
      const current=findElement(after.xml,selector);
      const currentApi=findElement(after.xml,{'resource_id':'input-api-base-url'});
      const currentActorId=findElement(after.xml,{'resource_id':'input-actor-id'});
      const currentActorRole=findElement(after.xml,{'resource_id':'input-actor-role'});
      const currentSubmit=findElement(after.xml,{'resource_id':'submit-sign-in'});
      const post={imeVisible:await this.imeVisible(),foreground:after.fg,state:classifyHierarchy(after.xml,after.fg),loginPresent:hasElement(after.xml,{'resource_id':'login-screen'}),apiUrl:currentApi.attrs.text,actorId:currentActorId.attrs.text,actorRole:currentActorRole.attrs.text,tokenPresent:rectIsNonZero(current.bounds)&&(allowEmpty||(current.attrs.text??'').length>0),tokenLength:(current.attrs.text??'').length,expectedLength,submitVisible:currentSubmit.bounds[0]>=0&&currentSubmit.bounds[1]>=0&&currentSubmit.bounds[2]<=width&&currentSubmit.bounds[3]<=height,submitEnabled:currentSubmit.attrs.enabled!=='false',requireEnabled:!allowDisabled,allowEmpty};
      if(post.state!=='vems_login'||!post.foreground.includes(PACKAGE)||!post.foreground.includes(ACTIVITY)||!post.loginPresent) throw new DriverError('static LoginScreen tap lost VEMS postcondition');
      if(staticLoginTapPostconditions(post)) return true;
      await sleep(250);
    }
    throw new DriverError('static LoginScreen tap did not dismiss the real IME');
  }
  async dismissRealImeWithEscape(selector, expectedLength=null) { return this.dismissRealImeByStaticLoginTap(selector, expectedLength); }
  async imeVisible() { const displays=await this.adb('shell','dumpsys','window','displays'); const insetBlocks=[...displays.matchAll(/ImeInsetsSourceProvider.*?(?=\n\s*(?:InsetsSourceProvider|$))/gs)].map(m=>m[0]); return insetBlocks.some(block=>block.includes('mImeShowing=true')&&block.includes('visible=true')&&/frame=\[\d+,\d+\]\[\d+,([1-9]\d*)\]/.test(block)); }
  async imeTop() { const displays=await this.adb('shell','dumpsys','window','displays'); const match=/visibleFrame=\[\d+,(\d+)\]\[\d+,\d+\] visible=true/.exec(displays); return match ? Number(match[1]) : 0; }
  async scrollSubmitAboveIme(xml) { const submit=findElement(xml,{'resource_id':'submit-sign-in'}); const top=await this.imeTop(); if(!top||submit.bounds[3]<=top) return xml; const scrollable=parseNodes(xml).find(n=>n.attrs.scrollable==='true'); if(!scrollable) throw new DriverError('Sign in is obscured and no scrollable container exists'); const x=Math.floor((scrollable.bounds[0]+scrollable.bounds[2])/2); await this.adb('shell','input','swipe',x,scrollable.bounds[3]-100,x,scrollable.bounds[1]+100,400); return (await this.observe('ime-submit-scroll',true)).xml; }
  async ensureKeyboardNotObscuring(expected='vems_login') { const before=await this.observe('keyboard-state-before',true); if(classifyHierarchy(before.xml,before.fg)!==expected) throw new DriverError('unexpected state before keyboard check'); if(!await this.imeVisible()){const after=await this.observe('keyboard-absent-noop',true); if(after.fg!==before.fg||classifyHierarchy(after.xml,after.fg)!==expected) throw new DriverError('keyboard absent check changed state'); return;} await this.adbUnchecked('shell','ime','hide'); for(let i=0;i<12;i++){const after=await this.observe('keyboard-dismiss-poll'); if(!await this.imeVisible()){if(after.fg!==before.fg||classifyHierarchy(after.xml,after.fg)!==expected) throw new DriverError('IME dismissal changed state'); return;} await sleep(250);} const afterHide=await this.observe('keyboard-after-hide',true); const moved=await this.scrollSubmitAboveIme(afterHide.xml); const submit=findElement(moved,{'resource_id':'submit-sign-in'}); const top=await this.imeTop(); if(top&&submit.bounds[3]<=top&&classifyHierarchy(moved,afterHide.fg)===expected) return; throw new DriverError('IME remained visible and obscures Sign in'); }
  async ensureElementVisible(selector,label='element',{requireEnabled=true}={}) { let {xml}=await this.observe(`before-visible-${label}`,true); const target=findElement(xml,selector); const size=await this.adb('shell','wm','size'); const m=/(\d+)x(\d+)/.exec(size); const [,w,h]=m?[...m].map(Number):[0,2560,1600]; if(target.bounds[0]<0||target.bounds[1]<0||target.bounds[2]>w||target.bounds[3]>h) throw new DriverError(`${label} outside visible bounds; scrolling not available in current hierarchy`); if(requireEnabled&&target.attrs.enabled==='false') throw new DriverError(`${label} disabled`); if(target.bounds[3]>h*0.65&&await this.imeVisible()){await this.ensureKeyboardNotObscuring('vems_login'); xml=(await this.observe(`requery-visible-${label}`,true)).xml;} if(requireEnabled&&findElement(xml,selector).attrs.enabled==='false') throw new DriverError(`${label} disabled`); return xml; }
  async armLogin() {
    if((await this.adb('get-state'))!=='device') throw new DriverError('emulator offline');
    await this.recoverToVems();
    await this.stableLogin();
    await this.replaceText({'resource_id':'input-api-base-url'},this.apiUrl,'arm-api-url');
    await this.replaceText({'resource_id':'input-actor-id'},'STAFF-001','arm-actor');
    await this.replaceText({'resource_id':'input-actor-role'},'field_crew','arm-role');
    await this.replaceText({'resource_id':'input-auth-token'},'','arm-clear-token');
    let observed=await this.observe('login-armed-precondition',true);
    let token=findElement(observed.xml,{'resource_id':'input-auth-token'});
    let submit=findElement(observed.xml,{'resource_id':'submit-sign-in'});
    const check=()=>{
      const state=classifyHierarchy(observed.xml,observed.fg);
      const api=findElement(observed.xml,{'resource_id':'input-api-base-url'});
      const actor=findElement(observed.xml,{'resource_id':'input-actor-id'});
      const role=findElement(observed.xml,{'resource_id':'input-actor-role'});
      if(!observed.fg.includes(PACKAGE)||!observed.fg.includes(ACTIVITY)||state!=='vems_login') throw new DriverError('login armed checkpoint is not on VEMS LoginScreen');
      if(api.attrs.text!==this.apiUrl||actor.attrs.text!=='STAFF-001'||role.attrs.text!=='field_crew') throw new DriverError('login armed identity/API fields are incorrect');
      if(!tokenDisplayIsEmpty(token.attrs.text??'',submit.attrs.enabled!=='false')) throw new DriverError('login armed token field is not empty');
      if(submit.attrs.enabled!=='false') throw new DriverError('login armed Sign in is unexpectedly enabled');
      const header=findElement(observed.xml,{text:'V-EMS Crew'});
      const sizeText=this.lastSize;
      return {state,api,actor,role,token,submit,header,sizeText};
    };
    check();
    if(await this.imeVisible()) {
      await this.dismissRealImeByStaticLoginTap({'resource_id':'input-auth-token'},null,{allowDisabled:true,allowEmpty:true});
      observed=await this.observe('login-armed-post-ime',true);
      token=findElement(observed.xml,{'resource_id':'input-auth-token'});
      submit=findElement(observed.xml,{'resource_id':'submit-sign-in'});
      check();
    }
    if(await this.imeVisible()) throw new DriverError('login armed checkpoint still has a real IME');
    await this.ensureElementVisible({'resource_id':'submit-sign-in'},'login-armed-submit',{requireEnabled:false});
    console.log('LOGIN_ARMED');
  }
  async dryRun() { if((await this.adb('get-state'))!=='device') throw new DriverError('emulator offline'); await this.recoverToVems(); await this.stableLogin(); await this.replaceText({'resource_id':'input-api-base-url'},'','clear-api-before-dry'); await this.replaceText({'resource_id':'input-actor-id'},'','clear-actor-before-dry'); await this.replaceText({'resource_id':'input-actor-role'},'','clear-role-before-dry'); await this.replaceText({'resource_id':'input-auth-token'},'','clear-token-before-dry'); await this.replaceText({'resource_id':'input-api-base-url'},this.apiUrl,'api-url'); await this.replaceText({'resource_id':'input-actor-id'},'STAFF-001','harmless-actor'); await this.replaceText({'resource_id':'input-actor-role'},'field_crew','harmless-role'); await this.pasteClipboardValue({'resource_id':'input-auth-token'},1,'harmless-token'); await this.dismissRealImeByStaticLoginTap({'resource_id':'input-auth-token'},1); await this.ensureElementVisible({'resource_id':'submit-sign-in'},'submit-sign-in'); await this.replaceText({'resource_id':'input-auth-token'},'','clear-harmless-token'); await this.replaceText({'resource_id':'input-actor-id'},'','clear-harmless-actor'); await this.replaceText({'resource_id':'input-actor-role'},'','clear-harmless-role'); await this.replaceText({'resource_id':'input-api-base-url'},this.apiUrl,'api-restore'); console.log('DRY_RUN_PASS'); }
  async authenticated(metadata) { if(!Number.isInteger(metadata.length)||!Number.isInteger(metadata.exp)) throw new DriverError('invalid protected token metadata'); await this.stableLogin(); await this.pasteClipboardSecret({'resource_id':'input-auth-token'},metadata.length); const signInRemaining=metadata.exp-Math.floor(Date.now()/1000); if(signInRemaining<240) throw new DriverError(`aborting before Sign in with only ${signInRemaining}s remaining`); await this.dismissRealImeByStaticLoginTap({'resource_id':'input-auth-token'},metadata.length); await this.ensureElementVisible({'resource_id':'submit-sign-in'},'submit-sign-in'); await this.tapOnce({'resource_id':'submit-sign-in'},x=>hasElement(x,{'resource_id':'jobs-list-screen'}),20,'sign-in'); await this.waitFor(x=>hasElement(x,{'resource_id':'job-ASN-000001'}),15,'assignment'); await this.tapOnce({'resource_id':'job-ASN-000001'},x=>hasElement(x,{'resource_id':'incident-detail-screen'}),15,'assignment-open'); await this.waitFor(x=>new Set(parseNodes(x).map(n=>n.attrs.text)).has('INC-000001'),15,'incident-id'); await this.tapOnce({'resource_id':'patient-case-PCR-000001'},x=>hasElement(x,{'resource_id':'patient-case-detail-screen'}),15,'pcr-open'); await this.tapOnce({'resource_id':'open-identity'},x=>hasElement(x,{'resource_id':'patient-identity-screen'}),15,'identity-open'); await this.replaceText({'resource_id':'search-first-name'},'Stage','first-name'); await this.replaceText({'resource_id':'search-last-name'},'Alpha','last-name'); await this.replaceText({'resource_id':'search-dob'},'2000-01-02','dob'); await this.tapOnce({'resource_id':'search-submit'},x=>hasElement(x,{'resource_id':'search-results'}),20,'search'); await this.tapOnce({'resource_id':'patient-create-new-option'},x=>hasElement(x,{'resource_id':'patient-create-form'}),5,'show-create'); await this.replaceText({'resource_id':'create-sex'},'X','sex'); const before=await this.observe('before-create-and-link',true); const button=findElement(before.xml,{'resource_id':'create-and-link'}); if(button.attrs.enabled==='false') throw new DriverError('Create and link disabled'); const remaining=metadata.exp-Math.floor(Date.now()/1000); if(remaining<90) throw new DriverError(`aborting before mutation with only ${remaining}s remaining`); await this.tapOnce({'resource_id':'create-and-link'},x=>hasElement(x,{'resource_id':'patient-case-detail-screen'}),30,'create-and-link',true); console.log(`AUTH_RUN_PASS remaining_at_mutation>=90`); }
}

export function parseArgs(argv) { const out={dryRun:false,armLogin:false,authenticated:false,developmentC1Resume:false,adb:DEFAULT_ADB,device:DEFAULT_DEVICE,evidenceDir:DEFAULT_EVIDENCE,apiUrl:DEFAULT_API,developmentClientUrl:DEFAULT_DEEP_LINK,metadataFile:null}; for(let i=0;i<argv.length;i++){const a=argv[i]; if(a==='--dry-run') out.dryRun=true; else if(a==='--arm-login') out.armLogin=true; else if(a==='--authenticated') out.authenticated=true; else if(a==='--development-c1-resume') out.developmentC1Resume=true; else if(a==='--token-metadata') out.metadataFile=argv[++i]; else if(a==='--adb') out.adb=argv[++i]; else if(a==='--device') out.device=argv[++i]; else if(a==='--evidence-dir') out.evidenceDir=argv[++i]; else if(a==='--api-url') out.apiUrl=argv[++i]; else if(a==='--development-client-url') out.developmentClientUrl=argv[++i]; else if(a.startsWith('-')) throw new DriverError(`unknown option ${a}`);} return out; }

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) { try { const rawArgs=process.argv.slice(2); const developmentTestAuth=rawArgs.includes('--development-test-auth'); const developmentC1Mode=rawArgs.includes('--development-c1'); const developmentC1Resume=rawArgs.includes('--development-c1-resume'); const expiryIndex=rawArgs.indexOf('--session-expires-at'); const expiresAt=expiryIndex>=0?Math.floor(new Date(rawArgs[expiryIndex+1]).getTime()/1000):null; const opts=parseArgs(rawArgs.filter((arg,index)=>arg!=='--development-test-auth'&&arg!=='--development-c1'&&arg!=='--development-c1-resume'&&index!==expiryIndex&&index!==expiryIndex+1)); const driver=new AndroidUiDriver(opts); if(opts.dryRun){await driver.dryRun();} else if(opts.armLogin){await driver.armLogin();} else if(developmentC1Resume){await driver.developmentC1AfterSearch(expiresAt);} else if(developmentC1Mode){await driver.developmentC1(expiresAt);} else if(developmentTestAuth){await driver.developmentTestLogin();} else if(opts.authenticated&&opts.metadataFile){const metadata=JSON.parse(fs.readFileSync(opts.metadataFile,'utf8')); await driver.authenticated(metadata);} else throw new DriverError('use --dry-run, --arm-login, --development-test-auth, --development-c1, --development-c1-resume, or --authenticated with --token-metadata; token content is never accepted'); } catch(error) { console.error(`HARNESS_FAIL ${error.message}`); process.exitCode=1; } }

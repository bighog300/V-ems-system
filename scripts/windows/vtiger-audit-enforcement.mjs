// Issue #148 probes; always reuse the #147 topology/ownership guard.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { main as guard } from './vtiger-audit.mjs';
import { parseEnvText } from './development-bootstrap.mjs';
import { createVtigerWebserviceClient } from '../../services/orchestration/src/adapters/vtiger/client.mjs';

await guard('inspect');
const env = Object.fromEntries(parseEnvText(readFileSync(resolve(process.env.LOCALAPPDATA, 'VEMS-Audit/issue-147/audit.env'), 'utf8')));
const config = { ...env, VTIGER_BASE_URL: 'http://127.0.0.1:18080', VTIGER_TIMEOUT_MS: '15000' };
const client = createVtigerWebserviceClient(config);
const output = resolve('docs/vtiger/evidence/issue-148');
mkdirSync(output, { recursive: true });
const evidence = { timestamp: new Date().toISOString(), project: 'vems-audit-147', checks: [], ui: 'NOT RUN: browser inventory empty; Chrome unavailable', managerRoles: 'NOT RUN: requested manager roles absent; see issue-147/roles.json' };
const save = () => writeFileSync(resolve(output, 'enforcement.json'), JSON.stringify(evidence, null, 2) + '\n');
const run = (args, input) => {
  const result = spawnSync('docker.exe', args, { input, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Audit Docker probe failed; output suppressed');
  return result.stdout;
};
function sql(query) {
  const code = `import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync('/var/lib/vems/data/audit-147.sqlite',{readOnly:true});console.log(JSON.stringify(db.prepare(${JSON.stringify(query)}).all()));db.close();`;
  return JSON.parse(run(['exec', 'vems-audit-147-api-1', 'node', '--input-type=module', '-e', code]));
}
let token;
async function api(method, path, body, correlation = 'audit-148-enforcement') {
  if (!token) {
    const response = await fetch('http://127.0.0.1:13001/api/development/test-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200); token = (await response.json()).token;
  }
  const response = await fetch('http://127.0.0.1:13001' + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'x-correlation-id': correlation, ...(method === 'POST' ? { 'idempotency-key': 'audit-148-' + crypto.randomUUID() } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) { const failure = await response.json(); throw new Error('Audit API ' + method + ' ' + path + ' HTTP ' + response.status + ' ' + JSON.stringify(failure.error ?? failure)); }
  return response.json();
}
async function until(read, accept, label) {
  for (let i = 0; i < 90; i++) {
    const result = await read(); if (accept(result)) return result;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Timed out: ' + label);
}
async function rejected(label, write, read) {
  const before = await read(); let code = 'WRITE_ACCEPTED';
  try { await write(); } catch (error) { code = error.code ?? error.name; }
  const after = await read();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  evidence.checks.push({ label, code, unchanged }); save();
  assert.equal(code, 'VTIGER_PERMISSION_DENIED', label); assert.equal(unchanged, true, label);
}
try {
  // Repair the deliberately divergent #147 synthetic mirror through the real worker.
  const callsign = 'Synthetic 148 ' + Date.now();
  await api('PATCH', '/api/vehicles/AMB-147', { callsign });
  const vehicle = await until(async () => (await client.query("SELECT * FROM VEMSVehicles WHERE vems_vehicle_id='AMB-147';"))[0], row => row?.vems_callsign === callsign && row.vems_operational_status === 'Available', 'worker update');
  evidence.workerUpdate = { passed: true, remoteId: vehicle.id, status: vehicle.vems_operational_status };
  const id = 'AMB-148' + Date.now();
  await api('POST', '/api/vehicles', { vehicle_id: id, callsign: 'Synthetic 148 create', vehicle_type: 'ALS Ambulance', home_station: 'Synthetic audit', operational_status: 'Available', service_status: 'Serviceable' });
  const created = await until(async () => (await client.query(`SELECT id,vems_operational_status FROM VEMSVehicles WHERE vems_vehicle_id='${id}';`))[0], row => !!row?.id, 'worker create');
  evidence.workerCreate = { passed: true, canonicalId: id, remoteId: created.id }; save();

  // Access keys never leave this process or enter evidence/log output.
  const php = `<?php
  if(getenv('VEMS_AUDIT_PROJECT')!=='vems-audit-147')exit(1);
  ob_start();chdir('/var/www/html');require_once 'config.php';require_once 'vendor/autoload.php';require_once 'includes/main/WebUI.php';require_once 'modules/Users/Users.php';
  $current_user=Users::getActiveAdminUser();$adb=PearDatabase::getInstance();$r=$adb->pquery("SELECT user_name,accesskey,is_admin FROM vtiger_users WHERE deleted=0 AND status='Active'",[]);$users=[];while($row=$adb->fetchByAssoc($r))$users[]=$row;ob_end_clean();echo json_encode($users);`;
  const users = JSON.parse(run(['exec', '-i', '-e', 'VEMS_AUDIT_PROJECT=vems-audit-147', 'vems-audit-147-vtiger-1', 'php'], php));
  evidence.accounts = users.map(user => ({ identity: user.user_name === env.VTIGER_USERNAME ? 'integration' : user.is_admin === 'on' ? 'administrator' : 'other', isAdmin: user.is_admin === 'on' }));
  const registry = JSON.parse(readFileSync('infra/services/vtiger/field-ownership.json', 'utf8')).modules;
  // A non-clinical transport fixture covers modules with no retained audit row.
  const worker = createVtigerWebserviceClient(config, { mirrorWrites: true });
  const workerUser = await worker.auth.authenticate();
  evidence.transportFixtures = [];
  for (const module of Object.keys(registry)) {
    if ((await client.query(`SELECT id FROM ${module} LIMIT 1;`)).length) continue;
    const fixture = await worker.create({ vems_external_key: 'audit148-boundary-' + module, assigned_user_id: workerUser.userId }, module);
    evidence.transportFixtures.push({ module, remoteId: fixture.id, purpose: 'non-clinical mirror transport boundary fixture; no canonical clinical record' });
  }
  for (const user of users) {
    const identity = user.user_name === env.VTIGER_USERNAME ? 'integration' : user.is_admin === 'on' ? 'administrator' : 'other';
    const account = createVtigerWebserviceClient({ ...config, VTIGER_USERNAME: user.user_name, VTIGER_ACCESS_KEY: user.accesskey });
    for (const [module, definition] of Object.entries(registry)) {
      const row = (await account.query(`SELECT * FROM ${module} LIMIT 1;`))[0];
      if (!row) { evidence.checks.push({ label: identity + ' ' + module, result: 'NO EXISTING RECORD' }); continue; }
      const field = Object.keys(definition.fields).find(field => definition.fields[field] === 'vems_mirror');
      await rejected(identity + ' ordinary update ' + module, () => account.update({ ...row, [field]: 'Denied synthetic 148' }, module), () => account.retrieve(row.id, module));
      const create = { ...row, [field]: 'Denied synthetic create 148', vems_external_key: 'DENIED-148-' + Date.now() }; delete create.id;
      await rejected(identity + ' ordinary create ' + module, () => account.create(create, module), () => account.query(`SELECT id FROM ${module} WHERE vems_external_key='${create.vems_external_key}';`));
    }
    await rejected(identity + ' wrong mirror secret', () => account.auth.call('vemsMirrorWrite', { elementType: 'VEMSVehicles', element: JSON.stringify(vehicle), mode: 'update', writeKey: 'incorrect' }, 'POST'), () => account.retrieve(vehicle.id));
    if (identity !== 'integration') await rejected(identity + ' correct secret but wrong identity', () => account.auth.call('vemsMirrorWrite', { elementType: 'VEMSVehicles', element: JSON.stringify(vehicle), mode: 'update', writeKey: env.VTIGER_MIRROR_WRITE_KEY }, 'POST'), () => account.retrieve(vehicle.id));
  }
  await rejected('integration vehicle status divergence', () => client.update({ ...vehicle, vems_operational_status: 'Out of Service' }, 'VEMSVehicles'), () => client.retrieve(vehicle.id));
  evidence.canonicalStatus = (await api('GET', '/api/vehicles/AMB-147')).operational_status;
  // The newly created synthetic vehicle carries the event-less bypass probes, then the worker repairs it.
  try {
    evidence.savePaths = JSON.parse(run(['exec', '-i', '-e', 'VEMS_AUDIT_PROJECT=vems-audit-147', '-e', 'VEMS_BYPASS_VEHICLE=' + id, 'vems-audit-147-vtiger-1', 'php'], readFileSync('scripts/windows/vtiger-audit-save-paths.php')));
  } finally {
    const callsign = 'Synthetic 148 bypass repaired';
    await api('PATCH', '/api/vehicles/' + id, { callsign });
    const repaired = await until(async () => client.retrieve(created.id), row => row.vems_callsign === callsign && row.vems_operational_status === 'Available', 'bypass repair');
    evidence.bypassRepair = { passed: true, canonicalId: id, remoteIdStable: repaired.id === created.id, status: repaired.vems_operational_status };
    save();
  }

  // Deliberate outage + supported replay; no second SQLite writer/worker.
  const correlation = 'audit-148-replay-' + Date.now();
  await guard('outage');
  try {
    await api('PATCH', '/api/vehicles/AMB-147', { callsign: 'Synthetic 148 replay' }, correlation);
    evidence.outage = await until(() => sql(`SELECT intent_id,status,attempt_count,last_error_classification FROM sync_intents WHERE correlation_id='${correlation}'`), rows => rows.some(row => row.status === 'dead_lettered'), 'dead-lettered outage intent');
  } finally { await guard('recover'); }
  await until(async () => { try { return await client.query('SELECT id FROM VEMSVehicles LIMIT 1;'); } catch { return null; } }, value => value !== null, 'Vtiger recovery');
  for (const intent of evidence.outage.filter(row => row.status === 'dead_lettered')) await api('POST', '/api/support/sync-intents/' + intent.intent_id + '/replay', {});
  const replayed = await until(async () => client.retrieve(vehicle.id), row => row.vems_callsign === 'Synthetic 148 replay', 'worker replay');
  evidence.replay = { passed: true, remoteIdStable: replayed.id === vehicle.id, status: replayed.vems_operational_status, intents: sql(`SELECT intent_id,status,attempt_count FROM sync_intents WHERE correlation_id='${correlation}'`) };
  evidence.result = 'PASS for tested webservice paths; UI/manager gate remains open'; save();
  console.log('Issue 148 evidence saved; tested webservice denial, worker create/update/replay passed.');
} catch (error) { evidence.result = 'FAIL'; evidence.failure = error.code ?? error.message; save(); console.error('Issue 148 audit failed: ' + evidence.failure); process.exitCode = 1; }

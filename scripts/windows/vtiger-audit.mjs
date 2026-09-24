import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { buildDevelopmentValues, loadTemplate, atomicWriteEnvFile, parseEnvText, SECRET_KEYS } from './development-bootstrap.mjs';

export const PROJECT = 'vems-audit-147';
export const PORTS = { api: [13001,3001], mysql: [13307,3306], redis: [16380,6379], vtiger: [18080,80], openemr: [18083,80] };
const volumeServices = { mysql_data_dev: 'mysql', redis_data_dev: 'redis', vtiger_data_dev: 'vtiger', openemr_data_dev: 'openemr', audit_openemr_ssl:'openemr', audit_openemr_letsencrypt:'openemr' };
const extraTargets = { audit_openemr_ssl:'/etc/ssl', audit_openemr_letsencrypt:'/etc/letsencrypt' };
const normalize = p => String(p).replaceAll('\\','/').toLowerCase().replace(/\/$/, '');
function requireSafe(ok, reason) { if (!ok) throw new Error(`Isolation guard: ${reason}`); }

// Inspect in memory only. Never print the resolved object: it contains credentials.
export function validateIsolation(config, dataPath, repo) {
  requireSafe(config.name === PROJECT, 'wrong project');
  requireSafe(Object.keys(config.services).sort().join() === Object.keys(PORTS).sort().join(), 'unexpected services');
  requireSafe(Object.keys(config.volumes).sort().join() === Object.keys(volumeServices).sort().join(), 'unexpected volumes');
  for (const [key, volume] of Object.entries(config.volumes)) {
    requireSafe(!volume.external && volume.name === `${PROJECT}_${key}`, 'shared or external volume');
  }
  requireSafe(Object.keys(config.networks).join() === 'vems-network', 'unexpected networks');
  requireSafe(!config.networks['vems-network'].external && config.networks['vems-network'].name === `${PROJECT}_vems-network`, 'shared network');
  const targets = { mysql:'/var/lib/mysql',redis:'/data',vtiger:'/var/www/html',openemr:'/var/www/localhost/htdocs/openemr',api:'/var/lib/vems/data' };
  for (const [name, service] of Object.entries(config.services)) {
    requireSafe(!service.container_name && !service.network_mode && !service.privileged && !service.pid && !service.volumes_from && !service.extra_hosts && !service.external_links && !service.devices, 'unsafe service namespace');
    requireSafe(Object.keys(service.networks).join() === 'vems-network', 'service network');
    const [published,target] = PORTS[name];
    requireSafe(service.ports?.length === 1 && service.ports[0].host_ip === '127.0.0.1' && Number(service.ports[0].published) === published && Number(service.ports[0].target) === target, 'unexpected host binding');
    if (['api','vtiger','openemr'].includes(name)) requireSafe(service.image === `${PROJECT}/${name}:desktop`, 'shared mutable image tag');
    const mounts = service.volumes ?? [];
    requireSafe(mounts.length === (name === 'mysql' ? 2 : name === 'openemr' ? 3 : 1), 'unexpected mount count');
    requireSafe(new Set(mounts.map(m=>m.target)).size===mounts.length, 'duplicate mount target');
    for (const mount of mounts) {
      if (mount.type === 'volume') requireSafe(volumeServices[mount.source] === name && mount.target === (extraTargets[mount.source] ?? targets[name]), 'wrong volume mount');
      else if (name === 'api') requireSafe(mount.type === 'bind' && normalize(mount.source) === normalize(dataPath) && mount.target === targets.api, 'wrong SQLite bind mount');
      else requireSafe(name === 'mysql' && mount.type === 'bind' && mount.read_only && normalize(mount.source) === normalize(resolve(repo,'infra/services/mysql/development-init')) && mount.target === '/docker-entrypoint-initdb.d', 'unexpected bind mount');
    }
  }
  const env = config.services.api.environment;
  requireSafe(env.VEMS_DB_PATH === '/var/lib/vems/data/audit-147.sqlite' && env.VEMS_DB_INIT_MODE === 'fresh-development' && String(env.VEMS_REQUIRE_EXISTING_DB) === 'false', 'wrong database');
  requireSafe(String(env.SYNC_WORKER_ENABLED) === 'true' && env.VTIGER_BASE_URL === 'http://vtiger' && env.OPENEMR_BASE_URL === 'http://openemr', 'wrong integration endpoints');
  requireSafe(env.OPENEMR_TOKEN_URL === 'http://openemr/oauth2/default/token' && env.REDIS_URL === 'redis://redis:6379', 'wrong OAuth or Redis endpoint');
  requireSafe(config.services.vtiger.environment.DB_HOST === 'mysql' && Number(config.services.vtiger.environment.DB_PORT) === 3306 && config.services.openemr.environment.MYSQL_HOST === 'mysql' && Number(config.services.openemr.environment.MYSQL_PORT) === 3306, 'wrong upstream database');
  requireSafe(config.services.vtiger.environment.VTIGER_SITE_URL === 'http://127.0.0.1:18080', 'wrong UI endpoint');
  return { project: PROJECT, ports: Object.fromEntries(Object.entries(PORTS).map(([n,p])=>[n,p[0]])), volumes: Object.values(config.volumes).map(v=>v.name), network:config.networks['vems-network'].name, database:resolve(dataPath,'audit-147.sqlite'), worker:'embedded API' };
}

export function buildAuditValues(template, data) {
  const values = buildDevelopmentValues(template, { VEMS_DB_HOST_PATH:data.replaceAll('\\','/'), VEMS_DB_PATH:'/var/lib/vems/data/audit-147.sqlite', VTIGER_SITE_URL:'http://127.0.0.1:18080' });
  // OpenEMR strength policy requires all character classes; randomness alone is insufficient.
  for (const key of ['OPENEMR_PASSWORD','OPENEMR_ADMIN_PASSWORD']) values.set(key,values.get(key)+'Aa9!');
  return values;
}

export async function main(action) {
  requireSafe(['start','validate','stop','inspect','outage','recover'].includes(action), 'unsupported action');
  requireSafe(process.platform === 'win32' && !!process.env.LOCALAPPDATA, 'Windows native runtime required');
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const root = resolve(process.env.LOCALAPPDATA,'VEMS-Audit/issue-147');
  const data = resolve(root,'data');
  const envFile = resolve(root,'audit.env');
  const markerFile = resolve(root,'owner.json');
  const lock = resolve(root,'operation.lock');
  requireSafe(existsSync(root), 'use the PowerShell entry point');
  let locked = false;
  const run = (args, env = process.env) => {
    const result = spawnSync('docker.exe',args,{cwd:repo,env,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
    if (result.status !== 0) throw new Error(`Docker ${args[0]} failed (exit ${result.status}); output suppressed to protect credentials`);
    return result.stdout.trim();
  };
  const resources = type => run([type,'ls',...(type==='container'?['-a']:[]),'--filter',`label=com.docker.compose.project=${PROJECT}`,'-q']).split(/\s+/).filter(Boolean);
  try {
    try { writeFileSync(lock,String(process.pid),{flag:'wx'}); locked = true; } catch { throw new Error('Another audit operation is active (operation.lock); do not run actions concurrently'); }
    const context = run(['context','show']);
    if (!existsSync(markerFile)) {
      requireSafe(action === 'start' && !existsSync(envFile) && !existsSync(data), 'unowned runtime directory');
      requireSafe(['container','volume','network'].every(t=>resources(t).length===0), 'unowned audit resources exist');
      // Refuse matching names even when someone created them without Compose labels.
      const names = [run(['container','ls','-a','--format','{{.Names}}']),run(['volume','ls','--format','{{.Name}}']),run(['network','ls','--format','{{.Name}}'])].join('\n').split(/\r?\n/);
      requireSafe(!names.some(n=>n.startsWith(`${PROJECT}-`)||n.startsWith(`${PROJECT}_`)), 'audit resource name already exists');
      mkdirSync(data);
      const values = buildAuditValues(loadTemplate(resolve(repo,'infra/env/development.windows.example.env')),data);
      atomicWriteEnvFile(envFile,values,SECRET_KEYS);
      writeFileSync(markerFile,JSON.stringify({project:PROJECT,context,root,nonce:randomUUID()}),{flag:'wx'});
    }
    const marker = JSON.parse(readFileSync(markerFile,'utf8'));
    requireSafe(marker.project===PROJECT && marker.context===context && normalize(marker.root)===normalize(root), 'runtime ownership/context mismatch');
    const retainedValues = parseEnvText(readFileSync(envFile,'utf8'));
    // Upgrade only this owned audit runtime; preserve every existing credential.
    if (action === 'start' && !retainedValues.has('VTIGER_MIRROR_WRITE_KEY')) {
      retainedValues.set('VTIGER_MIRROR_WRITE_KEY', randomBytes(32).toString('base64url'));
      atomicWriteEnvFile(envFile, retainedValues, SECRET_KEYS);
    }
    const values = Object.fromEntries(retainedValues);
    requireSafe(normalize(values.VEMS_DB_HOST_PATH)===normalize(data), 'runtime database path mismatch');
    // Do not inherit caller interpolation overrides (or COMPOSE_FILE/PROJECT_NAME).
    const interpolationKeys = new Set([...readFileSync(resolve(repo,'infra/docker-compose.dev.yml'),'utf8').matchAll(/\$\{([A-Z_][A-Z0-9_]*)/g)].map(match=>match[1]));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('COMPOSE_') && !interpolationKeys.has(key)));
    Object.assign(env,values);
    const args = ['compose','--project-name',PROJECT,'--env-file',envFile,'-f',resolve(repo,'infra/docker-compose.dev.yml'),'-f',resolve(repo,'infra/docker-compose.audit.yml')];
    const compose = more => run([...args,...more],env);
    let config;
    try { config = JSON.parse(compose(['config','--format','json'])); } catch { throw new Error('Audit Compose resolution failed; configuration suppressed'); }
    console.log(JSON.stringify(validateIsolation(config,data,repo),null,2));
    const owned = resources('container');
    for (const id of owned) {
      const metadata = JSON.parse(run(['inspect','--format','{{json .}}',id]));
      const name = metadata.Config.Labels['com.docker.compose.service'];
      requireSafe(Object.hasOwn(PORTS,name) && metadata.Name===`/${PROJECT}-${name}-1`, 'unexpected audit container');
      for (const mount of metadata.Mounts) {
        if (mount.Type==='volume') {
          const expected = Object.keys(volumeServices).filter(k=>volumeServices[k]===name).map(k=>PROJECT+'_'+k);
          requireSafe(expected.includes(mount.Name), 'existing container has foreign volume');
        }
        else requireSafe(normalize(mount.Source)===normalize(name==='api'?data:resolve(repo,'infra/services/mysql/development-init')), 'existing container has foreign bind mount');
      }
    }
    if (action === 'inspect') return;
    if (action === 'stop') { if (owned.length) run(['stop',...owned]); console.log('Only audit containers stopped; all volumes retained.'); return; }
    if (action === 'outage') { compose(['stop','vtiger']); console.log('Audit Vtiger stopped for outage test.'); return; }
    if (action === 'recover') { compose(['start','vtiger']); console.log('Audit Vtiger restarted.'); return; }
    if (action === 'start') {
      // Check host listeners as well as Docker publications, without stopping owners.
      const net = await import('node:net');
      for (const [service,[port]] of Object.entries(PORTS)) {
        const id = compose(['ps','-q',service]);
        if (id) continue;
        await new Promise((ok,fail)=> { const server=net.createServer(); server.once('error',()=>fail(new Error(`Audit port ${port} is occupied`))); server.listen(port,'127.0.0.1',()=>server.close(ok)); });
      }
      console.log('Isolation verified; building audit-only image tags.');
      compose(['build']);
      console.log('Starting audit dependencies.');
      compose(['up','-d','--wait','--wait-timeout','600','mysql','redis','openemr','vtiger']);
      console.log('Provisioning audit OpenEMR.');
      compose(['exec','-T','--user','apache','openemr','php','/opt/vems/provision-development.php']);
      console.log('Provisioning audit Vtiger.');
      compose(['exec','-T','vtiger','php','/opt/vems/provision-development.php']);
      console.log('Starting audit API.');
      compose(['up','-d','--wait','--wait-timeout','120','api']);
      compose(['exec','-T','api','node','scripts/windows/seed-development.mjs']);
      console.log('Audit bootstrap complete; synthetic crew seeded.');
    }
    const validation = compose(['exec','-T','api','node','scripts/windows/validate-services.mjs']);
    console.log(validation); // This validator emits fixed stage names only.
  } finally { if (locked) unlinkSync(lock); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error=>{ console.error(error.message); process.exitCode=1; });
}

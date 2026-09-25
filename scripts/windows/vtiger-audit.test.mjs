import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateIsolation, buildAuditValues, PROJECT, PORTS, AUDIT_ROLE_ENV_PREFIXES } from './vtiger-audit.mjs';
const repo=resolve('.'), data=resolve('audit-fixture/data');
function fixture() {
  const names={mysql:['mysql_data_dev','/var/lib/mysql'],redis:['redis_data_dev','/data'],vtiger:['vtiger_data_dev','/var/www/html'],openemr:['openemr_data_dev','/var/www/localhost/htdocs/openemr']};
  const config={name:PROJECT,services:{},volumes:{},networks:{'vems-network':{name:`${PROJECT}_vems-network`}}};
  for (const [name,[published,target]] of Object.entries(PORTS)) {
    const service=config.services[name]={image:`${PROJECT}/${name}:desktop`,ports:[{host_ip:'127.0.0.1',published:String(published),target}],networks:{'vems-network':null},environment:{},volumes:[]};
    if (names[name]) { const [key,mount]=names[name]; config.volumes[key]={name:`${PROJECT}_${key}`}; service.volumes.push({type:'volume',source:key,target:mount}); }
    else service.volumes.push({type:'bind',source:data,target:'/var/lib/vems/data'});
  }
  for (const [key,target] of Object.entries({audit_openemr_ssl:'/etc/ssl',audit_openemr_letsencrypt:'/etc/letsencrypt'})) { config.volumes[key]={name:PROJECT+'_'+key};config.services.openemr.volumes.push({type:'volume',source:key,target}); }
  config.services.mysql.volumes.push({type:'bind',source:resolve(repo,'infra/services/mysql/development-init'),target:'/docker-entrypoint-initdb.d',read_only:true});
  Object.assign(config.services.api.environment,{VEMS_DB_PATH:'/var/lib/vems/data/audit-147.sqlite',VEMS_DB_INIT_MODE:'fresh-development',VEMS_REQUIRE_EXISTING_DB:'false',SYNC_WORKER_ENABLED:'true',VTIGER_BASE_URL:'http://vtiger',OPENEMR_BASE_URL:'http://openemr'});
  Object.assign(config.services.api.environment,{OPENEMR_TOKEN_URL:'http://openemr/oauth2/default/token',REDIS_URL:'redis://redis:6379'});
  Object.assign(config.services.vtiger.environment,{DB_HOST:'mysql',DB_PORT:'3306'});
  Object.assign(config.services.openemr.environment,{MYSQL_HOST:'mysql',MYSQL_PORT:3306});
  config.services.vtiger.environment.VTIGER_SITE_URL='http://127.0.0.1:18080';
  return config;
}
test('accepts isolated topology; emits no credentials',()=>{
  const config=fixture(); config.services.api.environment.JWT_HS256_SECRET='DO_NOT_EMIT';
  const summary=validateIsolation(config,data,repo);
  assert.equal(summary.project,PROJECT); assert.ok(!JSON.stringify(summary).includes('DO_NOT_EMIT'));
});
for (const [name,mutate] of Object.entries({
  'development project':c=>c.name='vems-dev',
  'development volume':c=>c.volumes.mysql_data_dev.name='vems-dev_mysql_data_dev',
  'external volume':c=>c.volumes.mysql_data_dev.external=true,
  'development database':c=>c.services.api.volumes[0].source=resolve('VEMS/data'),
  'development port':c=>c.services.api.ports[0].published='3001',
  'LAN exposure':c=>c.services.api.ports[0].host_ip='0.0.0.0',
  'shared image':c=>c.services.api.image='vems-dev/api:development',
  'shared network':c=>c.networks['vems-network'].name='vems-dev_vems-network',
  'extra mount':c=>c.services.api.volumes.push({type:'bind',source:'/',target:'/host'}),
  'host network':c=>c.services.api.network_mode='host',
  'wrong upstream':c=>c.services.api.environment.VTIGER_BASE_URL='http://host.docker.internal:8080',
  'external database':c=>c.services.vtiger.environment.DB_HOST='host.docker.internal',
  'external OAuth':c=>c.services.api.environment.OPENEMR_TOKEN_URL='http://host.docker.internal:8083/token',
  'external Redis':c=>c.services.api.environment.REDIS_URL='redis://host.docker.internal:6380',
  'host alias':c=>c.services.api.extra_hosts=['vtiger:127.0.0.1'],
  'duplicate mount':c=>c.services.openemr.volumes[1]={...c.services.openemr.volumes[0]},
  'wrong UI redirect':c=>c.services.vtiger.environment.VTIGER_SITE_URL='http://localhost:8080',
})) test(`rejects ${name}`,()=>{const config=fixture();mutate(config);assert.throws(()=>validateIsolation(config,data,repo),/Isolation guard/);});

test('audit credentials satisfy OpenEMR policy and preserve isolated paths',()=>{
  const template=readFileSync('infra/env/development.windows.example.env','utf8').replaceAll('\r\n','\n');
  const values=buildAuditValues(template,data);
  for(const key of ['OPENEMR_PASSWORD','OPENEMR_ADMIN_PASSWORD']) {
    const password=values.get(key);
    for(const pattern of [/[a-z]/,/[A-Z]/,/[0-9]/,/[^a-zA-Z0-9]/]) assert.match(password,pattern);
    assert.ok(password.length>=32 && password.length<=72);
  }
  assert.equal(values.get('VEMS_DB_PATH'),'/var/lib/vems/data/audit-147.sqlite');
  assert.notEqual(values.get('OPENEMR_PASSWORD'),buildAuditValues(template,data).get('OPENEMR_PASSWORD'));
});

test('audit manager-role env prefixes are the four #147/#148 roles, each with a distinct compose overlay variable', () => {
  assert.deepEqual(AUDIT_ROLE_ENV_PREFIXES, ['DISPATCHER', 'FLEET_MANAGER', 'STOCK_MANAGER', 'SUPERVISOR']);
  const overlay = readFileSync('infra/docker-compose.audit.yml', 'utf8');
  for (const prefix of AUDIT_ROLE_ENV_PREFIXES) {
    assert.match(overlay, new RegExp(`VTIGER_${prefix}_USERNAME: \\$\\{VTIGER_${prefix}_USERNAME:\\?required\\}`));
    assert.match(overlay, new RegExp(`VTIGER_${prefix}_PASSWORD: \\$\\{VTIGER_${prefix}_PASSWORD:\\?required\\}`));
  }
  const runner = readFileSync('scripts/windows/vtiger-audit.mjs', 'utf8');
  assert.match(runner, /provision-audit-roles\.php/);
  assert.match(runner, /'-e','VEMS_AUDIT_PROJECT=vems-audit-147'/);
});

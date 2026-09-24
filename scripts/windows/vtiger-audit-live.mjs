import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { main as guard } from './vtiger-audit.mjs';
import { parseEnvText } from './development-bootstrap.mjs';
import { createVtigerWebserviceClient } from '../../services/orchestration/src/adapters/vtiger/client.mjs';
const phase=process.argv[2];
if (!['describe','seed','snapshot','denied-write','outage-update','recovery','relationships','replay','roles'].includes(phase)) throw new Error('Unsupported audit phase');
await guard('inspect');
const root=resolve(process.env.LOCALAPPDATA,'VEMS-Audit/issue-147');
const stateFile=resolve(root,'test-state.json');
const state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{};
const out=resolve('docs/vtiger/evidence/issue-147');mkdirSync(out,{recursive:true});
const env=Object.fromEntries(parseEnvText(readFileSync(resolve(root,'audit.env'),'utf8')));
const vtiger=createVtigerWebserviceClient({...env,VTIGER_BASE_URL:'http://127.0.0.1:18080',VTIGER_TIMEOUT_MS:'15000'});
const record=(name,result)=>{writeFileSync(resolve(out,name+'.json'),JSON.stringify(result,null,2)+'\n');console.log(name+': evidence saved');};
let token;
async function api(method,path,body,key){
 if(!token){const r=await fetch('http://127.0.0.1:13001/api/development/test-session',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error('Audit sign-in HTTP '+r.status);token=(await r.json()).token;}
 const headers={'content-type':'application/json',authorization:'Bearer '+token,'x-correlation-id':'audit-147-'+phase};if(key)headers['idempotency-key']='audit-147-'+key;
 const r=await fetch('http://127.0.0.1:13001'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error('Audit API '+method+' '+path+' HTTP '+r.status+' '+(d.error?.code??''));return d;
}
function sql(query){
 const source=`import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/var/lib/vems/data/audit-147.sqlite',{readOnly:true});console.log(JSON.stringify(db.prepare(${JSON.stringify(query)}).all()));db.close();`;
 const r=spawnSync('docker.exe',['exec','vems-audit-147-api-1','node','--input-type=module','-e',source],{encoding:'utf8'});if(r.status)throw new Error('Read-only audit evidence query failed');return JSON.parse(r.stdout);
}
try {
 if(phase==='roles'){
  const r=spawnSync('docker.exe',['exec','-i','-e','VEMS_AUDIT_PROJECT=vems-audit-147','vems-audit-147-vtiger-1','php'],{input:readFileSync('scripts/windows/vtiger-audit-roles.php'),encoding:'utf8'});
  if(r.status) throw new Error('Audit role inventory failed');
  let result;try{result=JSON.parse(r.stdout);}catch{throw new Error('Audit role inventory returned invalid JSON; raw output suppressed');}
  record('roles',result);
 }
 if(phase==='describe'){
  const modules=JSON.parse(readFileSync('infra/services/vtiger/development/modules.json','utf8'));
  const owners=JSON.parse(readFileSync('infra/services/vtiger/field-ownership.json','utf8')).modules;
  const results={timestamp:new Date().toISOString(),modules:{}};
  for(const [name,expected] of Object.entries(modules)){
   try{const d=await vtiger.auth.call('describe',{elementType:name});const rows=await vtiger.query('SELECT * FROM '+name+' LIMIT 1;');
    const fields=d.fields.map(f=>({name:f.name,label:f.label,type:f.type,mandatory:f.mandatory,editable:f.editable,ownership:owners[name].fields[f.name]??'unclassified'}));
    results.modules[name]={describe:'PASS',query:'PASS',sampleCount:rows.length,createable:d.createable,updateable:d.updateable,deleteable:d.deleteable,missing:expected.filter(f=>!fields.some(x=>x.name===f)),unexpected:fields.filter(f=>!expected.includes(f.name)).map(f=>f.name),fields};
   }catch(e){results.modules[name]={result:'FAIL',code:e.code??e.name};}
  }record('describe',results);
 }
 if(phase==='seed'){
  await api('POST','/api/personnel',{staff_id:'STAFF-147',display_name:'Synthetic Audit Crew',role:'field_crew',operational_status:'Available',home_station:'Synthetic Audit Station'},'person');
  await api('POST','/api/vehicles',{vehicle_id:'AMB-147',callsign:'Synthetic Audit Unit',vehicle_type:'ALS Ambulance',home_station:'Synthetic Audit Station',operational_status:'Available',service_status:'Serviceable'},'vehicle');
  await api('POST','/api/stock-items',{stock_item_id:'ITEM-147',name:'Synthetic Audit Consumable',category:'Synthetic',unit_of_measure:'each',item_type:'Consumable',active_status:'Active'},'item');
  await api('POST','/api/vehicles/AMB-147/stock/ITEM-147/adjustments',{type:'restock',quantity:10,reason:'Synthetic audit restock',minimum_quantity:2,target_quantity:10},'restock');
  const i=await api('POST','/api/incidents',{call:{call_source:'phone',received_at:'2026-09-24T09:00:00.000Z'},incident:{category:'medical_emergency',priority:'high',description:'Synthetic issue 147 audit incident',address:'Synthetic audit location',patient_count:1}},'incident');state.incident=i.incident_id;
  const a=await api('POST','/api/incidents/'+state.incident+'/assignments',{vehicle_id:'AMB-147',crew_ids:['STAFF-147'],reason:'Synthetic audit dispatch'},'assignment');state.assignment=a.assignment_id;
  writeFileSync(stateFile,JSON.stringify(state));record('synthetic-seed',{createdThroughApi:true,person:true,vehicle:true,stockItem:true,stockRestock:true,incident:true,assignment:true,clinicalRecords:false});
 }
 if(phase==='snapshot'||phase==='recovery'){
  const intents=sql("SELECT intent_id,target_system,entity_type,operation,correlation_id,status,attempt_count,last_error_classification,processed_at,dead_lettered_at FROM sync_intents ORDER BY intent_id");
  const tables=sql("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%vtiger%link%' OR name LIKE '%audit%')");
  const links={};for(const {name} of tables.filter(x=>/vtiger/.test(x.name))) links[name]=sql('SELECT * FROM '+name);
  const audit=sql("SELECT id,timestamp,entity_type,entity_id,action,correlation_id FROM audit_logs WHERE correlation_id LIKE 'audit-147-%' ORDER BY id");
  const canonical=await api('GET','/api/vehicles/AMB-147');
  let mirror;try{mirror=(await vtiger.query("SELECT id,vems_callsign,vems_operational_status FROM VEMSVehicles WHERE vems_vehicle_id='AMB-147';"))[0];}catch{mirror={unreachable:true};}
  record(phase,{timestamp:new Date().toISOString(),intents,links,audit,vehicle:{canonicalStatus:canonical.operational_status,canonicalCallsign:canonical.callsign,mirror,remoteIdStable:state.vehicleRemoteId?mirror?.id===state.vehicleRemoteId:null}});
 }
 if(phase==='denied-write'){
  const row=(await vtiger.query("SELECT * FROM VEMSVehicles WHERE vems_vehicle_id='AMB-147';"))[0];if(!row)throw new Error('Synthetic vehicle mirror missing');
  const before=await api('GET','/api/vehicles/AMB-147');let result;
  try{await vtiger.update({...row,vems_operational_status:'Out of Service'},'VEMSVehicles');result='WRITE_ACCEPTED';}catch(e){result=e.code??'WRITE_REJECTED';}
  const afterRemote=await vtiger.retrieve(row.id,'VEMSVehicles');const after=await api('GET','/api/vehicles/AMB-147');
  record('denied-write',{role:'integration user',result,canonicalBefore:before.operational_status,canonicalAfter:after.operational_status,mirrorAfter:afterRemote.vems_operational_status,divergence:after.operational_status!==afterRemote.vems_operational_status});
  state.vehicleRemoteId=row.id;writeFileSync(stateFile,JSON.stringify(state));
 }
 if(phase==='relationships'){
  const assignment=(await vtiger.query("SELECT id,incident_ref,vehicle_ref FROM VEMSAssignments WHERE vems_assignment_id='"+state.assignment+"';"))[0];
  const incident=(await vtiger.query("SELECT id FROM HelpDesk WHERE vems_incident_id='"+state.incident+"';"))[0];
  const vehicle=(await vtiger.query("SELECT id FROM VEMSVehicles WHERE vems_vehicle_id='AMB-147';"))[0];
  const person=(await vtiger.query("SELECT id FROM VEMSPersonnel WHERE vems_staff_id='STAFF-147';"))[0];
  const crew=(await vtiger.query("SELECT assignment_ref,personnel_ref FROM VEMSAssignmentCrew WHERE vems_assignment_id='"+state.assignment+"';"))[0];
  const stock=(await vtiger.query("SELECT vehicle_ref,stock_item_ref FROM VEMSVehicleStock WHERE vems_vehicle_id='AMB-147';"))[0];
  const item=(await vtiger.query("SELECT id FROM VEMSStockItems WHERE vems_stock_item_id='ITEM-147';"))[0];
  record('relationships',{assignmentIncident:assignment?.incident_ref===incident?.id,assignmentVehicle:assignment?.vehicle_ref===vehicle?.id,crewAssignment:crew?.assignment_ref===assignment?.id,crewPerson:crew?.personnel_ref===person?.id,stockVehicle:stock?.vehicle_ref===vehicle?.id,stockItem:stock?.stock_item_ref===item?.id,uiNavigation:'NOT RUN'});
 }
 if(phase==='replay'){
  const pending=sql("SELECT intent_id FROM sync_intents WHERE correlation_id='audit-147-outage-update' AND status='dead_lettered'");
  for(const row of pending) await api('POST','/api/support/sync-intents/'+row.intent_id+'/replay',{});
  record('replay',{requested:pending.map(x=>x.intent_id),method:'supported API endpoint'});
 }
 if(phase==='outage-update'){
  const result=await api('PATCH','/api/vehicles/AMB-147',{callsign:'Synthetic Audit Recovery Unit'});
  record('outage-update',{accepted:true,callsign:result.callsign,previousRemoteId:state.vehicleRemoteId});
 }
} catch(error){console.error('Audit phase failed: '+(error.code??error.message));process.exitCode=1;}

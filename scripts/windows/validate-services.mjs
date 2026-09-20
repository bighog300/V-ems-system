import { createHash } from 'node:crypto';
import { createVtigerWebserviceClient } from '../../services/orchestration/src/adapters/vtiger/client.mjs';
let stage = "API";
async function check(response, name) { stage=name; if (!response.ok) throw new Error(`${name} failed (HTTP ${response.status})`); console.log(`${name}: passed`); return response; }
try {
  await check(await fetch('http://127.0.0.1:3001/health'), 'API health');
  const session = await (await check(await fetch('http://127.0.0.1:3001/api/development/test-session', {method:'POST',headers:{'content-type':'application/json'},body:'{}'}), 'Development sign in')).json();
  await check(await fetch('http://127.0.0.1:3001/api/assignments/mine', {headers:{authorization:`Bearer ${session.token}`}}), 'Jobs list');
  await check(await fetch('http://openemr/'), 'OpenEMR HTTP');
  await check(await fetch('http://openemr/oauth2/default/.well-known/openid-configuration'), 'OAuth discovery');
  const body = new URLSearchParams({grant_type:'password',client_id:process.env.OPENEMR_CLIENT_ID,client_secret:process.env.OPENEMR_CLIENT_SECRET,username:process.env.OPENEMR_USERNAME,password:process.env.OPENEMR_PASSWORD,user_role:'users',scope:process.env.OPENEMR_SCOPE});
  const token = await (await check(await fetch(process.env.OPENEMR_TOKEN_URL,{method:'POST',body}), 'OAuth token')).json();
  if (!token.access_token) throw new Error('OAuth token missing');
  // OpenEMR's ClientRepository::validateClient() does not compare secrets for the password grant
  // (upstream only does so for authorization_code), so an unregistered client id is the rejectable case.
  body.set('client_id','deliberately-unregistered-client-id');
  const invalid = await fetch(process.env.OPENEMR_TOKEN_URL,{method:'POST',body});
  if (invalid.ok || ![400,401].includes(invalid.status)) throw new Error('Invalid OAuth client not rejected correctly');
  stage = 'OpenEMR invalid user rejection';
  body.set('client_id',process.env.OPENEMR_CLIENT_ID);
  body.set('password','deliberately-invalid-user-password');
  const invalidUser = await fetch(process.env.OPENEMR_TOKEN_URL,{method:'POST',body});
  if (invalidUser.ok || ![400,401].includes(invalidUser.status)) throw new Error('Invalid OpenEMR user not rejected correctly');
  console.log('OpenEMR invalid client and invalid user: rejected');
  stage = 'Vtiger invalid credential rejection';
  const vtigerBase = `${process.env.VTIGER_BASE_URL}/webservice.php`;
  const challenge = await (await fetch(`${vtigerBase}?operation=getchallenge&username=${encodeURIComponent(process.env.VTIGER_USERNAME)}`)).json();
  const wrongKey = createHash('md5').update(`${challenge.result?.token}deliberately-invalid-access-key`).digest('hex');
  const invalidLogin = await (await fetch(vtigerBase,{method:'POST',body:new URLSearchParams({operation:'login',username:process.env.VTIGER_USERNAME,accessKey:wrongKey})})).json();
  if (invalidLogin.success !== false) throw new Error('Invalid Vtiger credentials not rejected correctly');
  console.log('Vtiger invalid credentials: rejected');
  await check(await fetch('http://openemr/apis/default/api/patient?lname=VEMS_SYNTHETIC_NO_MATCH',{headers:{authorization:`Bearer ${token.access_token}`}}),'Authenticated patient search');
  stage = "Vtiger authenticated schema";
  await createVtigerWebserviceClient().healthCheck();
  console.log('Non-mutating adapter validation passed.');
} catch { console.error(`Service validation failed at ${stage}; response bodies and credentials suppressed.`); process.exitCode=1; }

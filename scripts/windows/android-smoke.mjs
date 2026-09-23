import {execFileSync} from 'node:child_process';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>v.startsWith('--')?[...a,[v.slice(2),all[i+1]]]:a,[]));
const adb=(...argv)=>execFileSync(args.adb,['-s',args.device,...argv],{encoding:'utf8',timeout:30000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(adb('reverse','--list').trim())throw new Error('Reverse rules present');
for(const [port,path,marker] of [[3001,'/health','200'],[8081,'/status','packager-status:running']]) {
  const request=`printf 'GET ${path} HTTP/1.0\r\nHost: 10.0.2.2\r\n\r\n' | toybox nc -w 10 10.0.2.2 ${port}`;
  if(!adb('shell',request).includes(marker))throw new Error(`Emulator connectivity failed on ${port}`);
}
let xml='';
for(let i=0;i<30;i++) {
  adb('shell','uiautomator','dump','/data/local/tmp/vems-dev-smoke.xml');
  xml=adb('shell','cat','/data/local/tmp/vems-dev-smoke.xml');
  if(/Development sign in|jobs-list-screen|login-screen/.test(xml))break;
  await sleep(1000);
}
if(!/Development sign in|jobs-list-screen|login-screen/.test(xml))throw new Error('VEMS LoginScreen/jobs screen not rendered');
// Login only; do not tap a job, patient, observation, or other clinical action.
const button=xml.match(/<node[^>]*(?:text|content-desc)="Development sign in"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
if(button) {
  adb('shell','input','tap',String(Math.round((+button[1]+ +button[3])/2)),String(Math.round((+button[2]+ +button[4])/2)));
  for(let i=0;i<30;i++) {
    await sleep(1000); adb('shell','uiautomator','dump','/data/local/tmp/vems-dev-smoke.xml');
    xml=adb('shell','cat','/data/local/tmp/vems-dev-smoke.xml');
    if(/jobs-list-screen|My jobs|My Jobs|No assigned jobs/.test(xml))break;
  }
  if(!/jobs-list-screen|My jobs|My Jobs|No assigned jobs/.test(xml))throw new Error('Development sign in did not reach jobs');
}
const pid=adb('shell','pidof','org.vems.mobilecrew').trim();
if(!/^\d+$/.test(pid))throw new Error('Application process missing');
const log=adb('logcat','-d',`--pid=${pid}`,'-t','500');
if(/FATAL EXCEPTION|E ReactNativeJS|ReactNativeJS:.*(?:Error|Exception)/.test(log))throw new Error('Fatal Android or JavaScript error');
console.log('Non-mutating Android smoke passed');

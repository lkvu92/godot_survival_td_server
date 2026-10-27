// Optional local browser review; uses installed Edge via CDP, no browser npm dependency.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../../',import.meta.url);
const previews=new URL('server/docs/reports/account_mail_preview/',root);
const directory=fileURLToPath(new URL('tmp/c232-mail-cdp-'+Date.now(),root));await mkdir(directory,{recursive:true});
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const executable=process.env.EDGE_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser=spawn(executable,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+directory,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;const pending=new Map();let sequence=0;
async function command(method,params={},sessionId){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
try{
 let version;
 for(let i=0;i<100;i++){try{version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();break;}catch{await new Promise(r=>setTimeout(r,100));}}
 if(!version)throw Error('Edge debug endpoint unavailable');
 socket=new WebSocket(version.webSocketDebuggerUrl);
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id&&pending.has(data.id)){const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(Error(data.error.message)):p.resolve(data.result);}});
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 const {targetId}=await command('Target.createTarget',{url:'about:blank'}),{sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 await command('Page.enable',{},sessionId);
 const checks=[];
 for(const [name,width,height] of [['desktop',760,1180],['mobile',375,1400]]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
  for(const purpose of ['register_email','verify_legacy_email','delete_account']){
   await command('Page.navigate',{url:new URL(purpose+'.html',previews).href},sessionId);
   await new Promise(r=>setTimeout(r,150));
   const {result}=await command('Runtime.evaluate',{expression:'document.fonts.ready.then(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,images:document.images.length}))',awaitPromise:true,returnByValue:true},sessionId);
   if(result.value.scroll>width)throw Error(purpose+' '+name+' horizontal overflow '+JSON.stringify(result.value));
   const capture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true},sessionId);
   await writeFile(new URL(purpose+'-'+name+'.png',previews),Buffer.from(capture.data,'base64'));
   checks.push({purpose,viewport:width,...result.value});
  }
  await command('Page.navigate',{url:new URL('confirm.html#token=preview-only-not-valid&purpose=delete_account',previews).href},sessionId);
  await new Promise(r=>setTimeout(r,150));
  const {result}=await command('Runtime.evaluate',{expression:'new Promise(resolve=>{const check=()=>{if(document.readyState==="complete"&&document.getElementById("submit")?.classList.contains("destructive"))resolve({width:innerWidth,scroll:document.documentElement.scrollWidth,heading:document.getElementById("page-title").textContent,destructive:true});else setTimeout(check,30);};check();})',returnByValue:true,awaitPromise:true},sessionId);
  if(result.value.scroll>width||!result.value.destructive)throw Error('Confirmation page style/script failure '+JSON.stringify(result.value));
  const capture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true},sessionId);
  await writeFile(new URL('confirmation-'+name+'.png',previews),Buffer.from(capture.data,'base64'));
  checks.push({purpose:'web-delete',viewport:width,...result.value});
 }
 await writeFile(new URL('browser-checks.json',previews),JSON.stringify(checks,null,2)+'\n');
 console.log('PASS Edge: all three emails and confirmation page at 760px/375px, no horizontal overflow.');
 await command('Browser.close');
}finally{socket?.close();browser.kill();}

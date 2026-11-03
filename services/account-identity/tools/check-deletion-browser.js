import http from 'node:http';
// Optional local browser review; uses installed Edge via CDP, no browser npm dependency.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../../../../',import.meta.url);
const previews=new URL('client/docs/standards/g2-registration/evidence/retention/B6/phase-v3/ARCH-07/',root);await mkdir(previews,{recursive:true});
// UI fixture only: render actual files and exercise their JS against explicit synthetic responses.
const fixture=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://fixture').pathname;
 if(req.method==='POST'){
  let body='';for await(const c of req)body+=c;const data=JSON.parse(body||'{}');
  const result=path.endsWith('/link/status')?{success:true,deletion_policy:{soft_delete_days:14,gameplay_purge_calendar_months:3}}:
   path.endsWith('/deletion/status')?{success:true,status:data.receipt==='fixture-archived'?'archived':data.receipt==='fixture-purged'?'gameplay_purged':'soft_deleted',lifecycle_state:data.receipt==='fixture-archived'?'archived':data.receipt==='fixture-purged'?'gameplay_purged':'soft_deleted',identity_released:data.receipt!=='fixture-receipt-not-valid',restore_until:'2026-11-16T14:00:00Z',gameplay_purge_at:data.receipt==='fixture-archived'||data.receipt==='fixture-purged'?'2027-02-16T14:00:00Z':null,restore_eligible:data.receipt==='fixture-receipt-not-valid'}:
   path.endsWith('/restoration/request')?{success:true,message:'Nếu địa chỉ hợp lệ và đủ điều kiện, thư xác nhận sẽ được gửi.'}:
   data.purpose==='restore_account'?{success:true,message:'Đạo hữu đã khôi phục tài khoản. Hãy đăng nhập lại để tiếp tục hành trình.'}:{success:true,receipt:'fixture-receipt-not-valid'};
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
 }
 const files={'/account/confirm':'confirm.html','/account/confirm.js':'confirm.js','/account/style.css':'style.css'};
 if(!files[path]){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html; charset=utf-8');
 res.end(await readFile(new URL('../public/'+files[path],import.meta.url)));
});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+fixture.address().port;
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
 for(const [name,width,height] of [['desktop',760,1180],['mobile',375,1180]]) {
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
  for(const [stage,fragment] of [['review','token=fixture&purpose=delete_account'],['receipt','receipt=fixture-receipt-not-valid'],['archived','receipt=fixture-archived'],['gameplay-purged','receipt=fixture-purged'],['recovery-request','restore=1'],['recovery-confirm','token=fixture&purpose=restore_account']]){
   await command('Page.navigate',{url:base+'/account/confirm?fixture='+stage+'#'+fragment},sessionId);
   await new Promise(r=>setTimeout(r,350));
   await command('Runtime.evaluate',{expression:'scrollTo(0,0)'},sessionId);
   const {result}=await command('Runtime.evaluate',{expression:'({width:innerWidth,scroll:document.documentElement.scrollWidth,heading:document.getElementById("page-title").textContent,formVisible:!document.getElementById("form").hidden,recoveryVisible:!document.getElementById("recovery").hidden})',returnByValue:true},sessionId);
   if(result.value.scroll>width)throw Error('Horizontal overflow '+JSON.stringify(result.value));
   const expectedHeading=stage==='review'?'Xác nhận yêu cầu xóa':['receipt','archived','gameplay-purged'].includes(stage)?'Trạng thái yêu cầu xóa':'Khôi phục tài khoản';
   if(result.value.heading!==expectedHeading)throw Error('Wrong workflow stage '+stage+' '+JSON.stringify(result.value));
   const capture=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true},sessionId);
   await writeFile(new URL(stage+'-'+name+'.png',previews),Buffer.from(capture.data,'base64'));
   checks.push({fixture:true,stage,viewport:width,...result.value});
  }
 }
 await writeFile(new URL('browser-checks.json',previews),JSON.stringify({fixture:true,generated_at:new Date().toISOString(),checks},null,2)+'\n');
 console.log('PASS C232 v3 browser: actual HTML/JS, synthetic HTTP fixture, six stages at 760/375px, no horizontal overflow.');
 await command('Browser.close');
}finally{socket?.close();browser.kill();await new Promise(r=>fixture.close(r));}

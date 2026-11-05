// Real Nakama 3.24 HTTP integration in an isolated database/container.
const {execFileSync,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const pg=process.env.SUPPORT_TEST_CONTAINER||'c232-test-postgres-1';
const suffix=crypto.randomBytes(5).toString('hex'),db='support_http_'+suffix,name='support-http-'+suffix;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'support-http-'));
const admin=crypto.randomUUID(),serverKey=crypto.randomUUID(),customId=crypto.randomUUID();
const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']}).trim();
const psql=sql=>docker(['exec','-i',pg,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-tA'],sql);
async function main(){let created=false,started=false;
 try{
 const network=docker(['inspect','-f','{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}',pg]);
 const password=docker(['exec',pg,'printenv','POSTGRES_PASSWORD']);
 docker(['exec',pg,'psql','-U','postgres','-d','postgres','-c','CREATE DATABASE '+db]);created=true;
 const base=path.join(__dirname,'../nakama/data/modules/build');
 const adminSource=fs.readFileSync(path.join(base,'server_admin.js'),'utf8');
 const contextSource=fs.readFileSync(path.join(base,'server_context.js'),'utf8');
 const runtime=fs.readFileSync(path.join(base,'profanity_filter.js'),'utf8')+adminSource.slice(adminSource.indexOf('function isConfigAdmin'),adminSource.indexOf('function serverAdminHandler'))+
 contextSource.slice(contextSource.indexOf('function serverFailure'),contextSource.indexOf('function validatedServer'))+
 fs.readFileSync(path.join(base,'support.js'),'utf8')+`
 var InitModule=function(ctx,logger,nk,initializer){logger.info("SUPPORT INIT START");try{createSupportTables(nk);logger.info("SUPPORT SCHEMA READY");}catch(e){logger.error("SUPPORT INIT ERROR: "+String(e));throw e;}
 initializer.registerRpc('support_create',rpc_support_create);
 initializer.registerRpc('support_list',rpc_support_list);
 initializer.registerRpc('support_get',rpc_support_get);
 initializer.registerRpc('support_read',rpc_support_read);
 initializer.registerRpc('support_reply',rpc_support_reply);
 initializer.registerRpc('support_close',rpc_support_close);
 initializer.registerRpc('support_reopen',rpc_support_reopen);
 initializer.registerRpc('admin_support_list',rpc_admin_support_list);
 initializer.registerRpc('admin_support_get',rpc_admin_support_get);
 initializer.registerRpc('admin_support_reply',rpc_admin_support_reply);
 initializer.registerRpc('admin_support_update',rpc_admin_support_update);
}
 `;
 fs.mkdirSync(path.join(dir,'modules'));fs.writeFileSync(path.join(dir,'modules','index.js'),runtime);
 fs.writeFileSync(path.join(dir,'test.yml'),`name: support_test
data_dir: /nakama/data
logger:\n  stdout: true\n  level: INFO
database:\n  address:\n    - ${JSON.stringify('postgres:'+encodeURIComponent(password)+'@'+pg+':5432/'+db)}
socket:\n  server_key: ${serverKey}
session:\n  encryption_key: ${crypto.randomUUID()}\n  refresh_encryption_key: ${crypto.randomUUID()}
runtime:\n  path: /test/modules\n  js_entrypoint: index.js\n  env:\n    - CONFIG_ADMIN_USER_ID=${admin}
console:\n  username: testadmin\n  password: ${crypto.randomUUID()}\n  signing_key: ${crypto.randomUUID()}
`);
 const mount=dir+':/test:ro';
 docker(['run','--rm','--network',network,'-v',mount,'--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2','migrate','up','--config','/test/test.yml']);
 psql(`INSERT INTO users(id,username,custom_id) VALUES('${admin}','support_admin','${customId}');`);
 docker(['run','-d','--name',name,'--network',network,'-p','127.0.0.1::7350','-v',mount,'--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2','--config','/test/test.yml']);started=true;
 await new Promise(r=>setTimeout(r,1500));let port;try{port=docker(['port',name,'7350/tcp']).split(':').pop();}catch{const logs=spawnSync('docker',['logs',name],{encoding:'utf8'});throw new Error((logs.stdout+logs.stderr+docker(['inspect','-f','{{json .State}}',name])).replaceAll(password,'[redacted]').replaceAll(serverKey,'[redacted]'));}const url='http://127.0.0.1:'+port;
 let healthy=false;for(let i=0;i<40;i++){try{const res=await fetch(url+'/healthcheck');if(res.ok){healthy=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!healthy)throw new Error('Test Nakama failed to start: '+docker(['logs',name]));
 async function auth(kind,body){const r=await fetch(url+'/v2/account/authenticate/'+kind+'?create=true',{method:'POST',headers:{authorization:'Basic '+Buffer.from(serverKey+':').toString('base64'),'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return (await r.json()).token;}
 async function rpc(token,id,body={}){const r=await fetch(url+'/v2/rpc/'+id,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(JSON.stringify(body))});const env=await r.json();assert.equal(r.status,200,JSON.stringify(env));return JSON.parse(env.payload);}
 const playerToken=await auth('device',{id:'support-player-'+suffix}),otherToken=await auth('device',{id:'support-other-'+suffix}),adminToken=await auth('custom',{id:customId});
 const request={request_id:crypto.randomUUID(),title:'HTTP support test',category:'bug',body:'Actual Nakama RPC',metadata:{platform:'test'},server_id:'',generation:0};
 const createdTicket=await rpc(playerToken,'support_create',request);assert.equal(createdTicket.success,true,JSON.stringify(createdTicket));let t=createdTicket.data.ticket;
 assert.equal((await rpc(playerToken,'support_create',request)).data.ticket.id,t.id);
 assert.equal((await rpc(otherToken,'support_get',{ticket_id:t.id})).code,404);
 assert.equal((await rpc(otherToken,'admin_support_list')).code,403);
 const note=await rpc(adminToken,'admin_support_reply',{ticket_id:t.id,request_id:crypto.randomUUID(),expected_version:t.version,body:'PRIVATE',internal:true});assert.equal(note.success,true,JSON.stringify(note));t=note.data.ticket;
 const playerGet=await rpc(playerToken,'support_get',{ticket_id:t.id});assert.equal(playerGet.data.messages.length,1);assert.equal(JSON.stringify(playerGet).includes('PRIVATE'),false);
 const reply=await rpc(adminToken,'admin_support_reply',{ticket_id:t.id,request_id:crypto.randomUUID(),expected_version:t.version,body:'PUBLIC',internal:false});assert.equal(reply.success,true,JSON.stringify(reply));t=reply.data.ticket;
 const page=await rpc(playerToken,'support_list');assert.equal(page.data.unread_count,1);assert.equal(Array.isArray(page.data.tickets),true);
 const detail=await rpc(playerToken,'support_get',{ticket_id:t.id});assert.equal(detail.data.messages.length,2);assert.equal(typeof detail.data.messages[0].id,'string');assert.equal(typeof detail.data.ticket.metadata,'object');assert.equal(typeof detail.data.ticket.created_at,'string');
 assert.equal((await rpc(playerToken,'support_read',{ticket_id:t.id,public_seq:t.public_seq})).success,true);
 assert.equal((await rpc(playerToken,'support_list')).data.unread_count,0);
 const adminDetail=await rpc(adminToken,'admin_support_get',{ticket_id:t.id});
 assert.equal(adminDetail.data.messages.length,3);assert.equal(typeof adminDetail.data.events[0].detail,'object');
 assert.match(detail.data.ticket.created_at,/T.*Z$/);assert.equal(typeof page.data.tickets[0].metadata,'object');
 const updated=await rpc(adminToken,'admin_support_update',{ticket_id:t.id,request_id:crypto.randomUUID(),expected_version:t.version,status:'resolved',priority:'high',assignee:admin});
 assert.equal(updated.success,true);t=updated.data.ticket;
 const closed=await rpc(playerToken,'support_close',{ticket_id:t.id,request_id:crypto.randomUUID(),expected_version:t.version});assert.equal(closed.success,true);t=closed.data.ticket;
 const reopened=await rpc(playerToken,'support_reopen',{ticket_id:t.id,request_id:crypto.randomUUID(),expected_version:t.version});assert.equal(reopened.data.ticket.status,'in_progress');
 console.log('PASS real Nakama HTTP: auth, create, retry, ownership, admin auth, private notes, reply, JSON types, unread/read');
 }finally{
 if(started)docker(['rm','-f',name]);
 if(created)docker(['exec',pg,'psql','-U','postgres','-d','postgres','-c','DROP DATABASE '+db]);
 const resolved=path.resolve(dir);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('support-http-'))throw new Error('Unsafe temporary cleanup path');
 fs.rmSync(resolved,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

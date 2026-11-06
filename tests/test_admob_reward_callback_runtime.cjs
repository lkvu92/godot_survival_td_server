// Isolated real PostgreSQL + Nakama; local signing key never accepted in production.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {execFileSync}=require('child_process'),{generateKeyPairSync,sign}=require('crypto');
const {createServer}=require('http'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'..'),suffix=Date.now()+'-'+process.pid;
const network='ssv-test-'+suffix,pg='ssv-pg-'+suffix,app='ssv-nakama-'+suffix;
const created={};let callbackServer;const results=[];
const docker=(args,opts={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...opts}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sql=text=>docker(['exec','-i',pg,'psql','-X','-q','-A','-t','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-f','-'],{input:text});
const literal=s=>"'"+String(s).replace(/'/g,"''")+"'";
let base;const secret='isolated-ssv-secret',httpKey='isolated-ssv-key',unit='unit/123';
async function http(route,body,authorization){
 const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const text=await r.text();assert(r.ok,'HTTP '+r.status+': '+text);return text?JSON.parse(text):{};
}
const keepAlive=setInterval(()=>{},1000);
(async()=>{try{
 console.log('Provisioning isolated local PostgreSQL/Nakama for direct grant and signed callback tests');
 docker(['network','create',network]);created.network=true;
 docker(['run','-d','--name',pg,'--network',network,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=nakama','postgres:16-alpine']);created.pg=true;
 let ready=false;for(let i=0;i<40;i++){try{docker(['exec',pg,'pg_isready','-U','postgres','-d','nakama']);ready=true;break;}catch{await sleep(500);}}assert(ready);
 docker(['run','--rm','--network',network,'--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2','migrate','up','--database.address','postgres@'+pg+':5432/nakama']);
 docker(['run','-d','--name',app,'--network',network,'-p','127.0.0.1::7350','--mount','type=bind,src='+path.join(root,'nakama/data')+',dst=/nakama/data,readonly',
  '--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2','--name','ssvtest','--database.address','postgres@'+pg+':5432/nakama',
  '--socket.max_request_size_bytes','8388608','--runtime.path','/nakama/data','--runtime.js_entrypoint','build/index.js',
  '--runtime.env','MULTI_SERVER_ENABLED=true','--runtime.env','APP_ENVIRONMENT=production',
  '--runtime.env','MONETIZATION_VERIFIER_SECRET='+secret,'--runtime.env','ADMOB_REWARDED_UNIT_ID_PRODUCTION='+unit,
  '--runtime.http_key',httpKey,'--logger.level','WARN']);created.app=true;
 base='http://127.0.0.1:'+docker(['inspect','-f','{{(index (index .NetworkSettings.Ports "7350/tcp") 0).HostPort}}',app]);
 ready=false;for(let i=0;i<60;i++){try{await http('/healthcheck');ready=true;break;}catch{if(i>2&&docker(['inspect','-f','{{.State.Running}}',app])!=='true')break;await sleep(500);}}
 assert(ready,'Runtime initialization failed: '+docker(['logs',app]));
 const seed=execFileSync('python',['-B',path.join(root,'nakama/seed_all.py')],{encoding:'utf8',timeout:120000,env:{...process.env,NAKAMA_URL:base,NAKAMA_SEED_URL:'',NAKAMA_HTTP_KEY:httpKey,NAKAMA_SEED_TIMEOUT:'90'}});
 assert(seed.includes('committed atomically'));
 // Distinct real users and scoped storage make cross-account/server mistakes observable.
 const auth=await http('/v2/account/authenticate/custom?create=true',{id:'ssv-user-'+suffix},'Basic '+Buffer.from('defaultkey:').toString('base64'));
 const other=await http('/v2/account/authenticate/custom?create=true',{id:'ssv-other-'+suffix},'Basic '+Buffer.from('defaultkey:').toString('base64'));
 const uid=JSON.parse(Buffer.from(auth.token.split('.')[1],'base64url')).uid;
 const otherId=JSON.parse(Buffer.from(other.token.split('.')[1],'base64url')).uid;
 sql(`INSERT INTO game_servers(server_id,display_name,status,allow_new_characters,config_version) SELECT 's001','SSV fixture','open',TRUE,MAX(config_version) FROM remote_config_releases;
 INSERT INTO player_characters(account_id,server_id,generation,status) VALUES('${uid}','s001',1,'ready'),('${otherId}','s001',1,'ready');`);
 for(const user of [uid,otherId])for(const key of ['main','s001:g1:main','s002:g1:main']){
  sql(`INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_profiles',${literal(key)},'${user}','{"stamina":10,"resources":{"gold":100,"gems":7}}','fixture',0,0) ON CONFLICT(collection,key,user_id) DO UPDATE SET value=EXCLUDED.value,version='fixture';`);
 }
 for(const user of [uid,otherId])for(const key of ['items','s001:g1:items','s002:g1:items']){
  sql(`INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_inventory',${literal(key)},'${user}','{"items":[]}','fixture',0,0) ON CONFLICT(collection,key,user_id) DO UPDATE SET value=EXCLUDED.value,version='fixture';`);
 }
 const profile=(user=uid,key='s001:g1:main')=>JSON.parse(sql(`SELECT value FROM storage WHERE collection='player_profiles' AND key=${literal(key)} AND user_id='${user}'`));
 const inventory=(user=uid,key='s001:g1:items')=>JSON.parse(sql(`SELECT value FROM storage WHERE collection='player_inventory' AND key=${literal(key)} AND user_id='${user}'`)).items;
 const status=id=>sql(`SELECT status FROM monetization_ad_rewards WHERE ad_session_id=${literal(id)}`);
 const prepare=(id,placement,type,amount)=>{
  const custom={ad_session_id:id,user_id:uid};
  sql(`INSERT INTO monetization_ad_rewards(ad_session_id,user_id,placement_id,reward_type,reward_amount,custom_data,target_server_id,target_generation,client_request_id) VALUES(${literal(id)},'${uid}',${literal(placement)},${literal(type)},${amount},${literal(JSON.stringify(custom))},'s001',1,${literal(id)})`);
  return custom;
 };
 const grant=body=>http('/v2/rpc/admob_ssv_confirm?http_key='+httpKey+'&unwrap=true',{verifier_secret:secret,...body});
 const staminaId='direct-'+suffix;
 prepare(staminaId,'stamina_dialog_ad','stamina',15);
 const before=profile().stamina;
 const direct=await grant({ad_session_id:staminaId,user_id:uid,transaction_id:'direct-tx-'+suffix,ad_unit:'123'});
 assert.equal(direct.status,'success',JSON.stringify(direct));assert.equal(direct.data.granted,true);
 assert.equal(profile().stamina,before+15);assert.equal(status(staminaId),'granted');
 await grant({ad_session_id:staminaId,user_id:uid,transaction_id:'direct-tx-'+suffix,ad_unit:'123'});
 assert.equal(profile().stamina,before+15,'direct replay must not duplicate stamina');
 results.push({case:'direct_grant',function:'admobSsvConfirm -> grantPreparedReward',before,after:profile().stamina,delta:15,replay_delta:0,status:status(staminaId)});
 console.log('PASS direct native RPC grant: stamina 10 -> 25, replay stays 25');

 const {processAdmobCallback}=await import(pathToFileURL(path.join(root,'services/monetization-verifier/src/admob_ssv.js')));
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 let bridgeCalls=0;const seen=[],events=[];
 callbackServer=createServer(async(req,res)=>{
  try{
   const data=await processAdmobCallback(req.url,{expectedAdUnit:unit,getKeys:async()=>new Map([['local-test',publicKey]]),
    confirm:async verified=>{bridgeCalls++;seen.push(verified);const r=await grant(verified);assert.equal(r.status,'success',JSON.stringify(r));return r;},onEvent:e=>events.push(e)});
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
  }catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
 });
 await new Promise(resolve=>callbackServer.listen(0,'127.0.0.1',resolve));
 const callbackBase='http://127.0.0.1:'+callbackServer.address().port;
 function signed(custom,tx,extra={}){
  const params=new URLSearchParams({ad_unit:'123',user_id:custom.user_id,custom_data:JSON.stringify(custom),transaction_id:tx,reward_amount:'999',reward_item:'forged-gems',...extra});params.sort();
  const payload=params.toString();return '/admob/ssv?'+payload+'&signature='+sign('sha256',Buffer.from(decodeURIComponent(payload)),privateKey).toString('base64url')+'&key_id=local-test';
 }
 async function callback(url,expected=200){const r=await fetch(callbackBase+url);const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));return body;}
 const mission='daily_mission_talisman_fragment_ad';let last;
 for(let n=1;n<=3;n++){
  const id='signed-'+suffix+'-'+n,custom=prepare(id,mission,'daily_fragment',1);last=signed(custom,'signed-tx-'+suffix+'-'+n);
  const countBefore=bridgeCalls;await callback(last);assert.equal(bridgeCalls,countBefore+1);
  const forwarded=seen.at(-1);assert.equal(forwarded.user_id,uid);assert.equal(forwarded.ad_session_id,id);assert.equal(forwarded.ad_unit,'123');
  assert.equal(status(id),'granted');
  assert.equal(inventory().reduce((sum,item)=>sum+item.quantity,0),n===3?1:0);
  results.push({case:'signed_callback_'+n,handler_entered:true,bridge_entered:true,user_matches:true,session_matches:true,ledger_reward:'daily_fragment',daily_progress:n,inventory_quantity:inventory().reduce((sum,item)=>sum+item.quantity,0),status:status(id)});
 }
 const item=inventory()[0];assert.equal(item.quantity,1);
 assert.equal(sql(`SELECT attributes->>'quality' FROM game_items WHERE id=${literal(item.item_id)}`),'low');
 const countBeforeReplay=inventory()[0].quantity;await callback(last);assert.equal(inventory()[0].quantity,countBeforeReplay);
 console.log('PASS signed HTTP callback -> verifier -> real Nakama grant: daily 1/3, 2/3, 3/3; third grants exactly one low fragment; duplicate grants zero extra');
 // Negative cases cannot change assets or select rewards from callback parameters.
 const good=prepare('negative-'+suffix,'stamina_dialog_ad','stamina',15);
 let calls=bridgeCalls;
 await callback(signed(good,'bad-unit',{ad_unit:'999'}),400);assert.equal(bridgeCalls,calls);
 await callback(signed(good,'mismatch',{user_id:otherId}),400);assert.equal(bridgeCalls,calls);
 await callback(signed(good,'tamper').replace('reward_amount=999','reward_amount=998'),400);assert.equal(bridgeCalls,calls);
 await callback(signed({...good,user_id:otherId},'wrong-owner'),400);assert.equal(bridgeCalls,calls+1);
 assert.equal(status(good.ad_session_id),'prepared');assert.equal(profile().stamina,25);
 assert.equal(profile(otherId).stamina,10);assert.equal(inventory(otherId).length,0);
 assert.equal(profile(uid,'s002:g1:main').stamina,10);assert.equal(inventory(uid,'s002:g1:items').length,0);
 assert.equal(profile(uid,'main').stamina,10);assert.equal(inventory(uid,'items').length,0);
 assert.equal(profile().resources.gems,7,'callback cannot invent reward_item/amount');
 results.push({case:'negative_and_isolation',wrong_unit_rejected_before_bridge:true,user_metadata_mismatch_rejected_before_bridge:true,invalid_signature_rejected_before_bridge:true,wrong_ledger_owner_no_grant:true,other_user_unchanged:true,other_server_unchanged:true,legacy_storage_unchanged:true,callback_cannot_select_reward:true});
 assert(events.includes('admob_ssv_received_verified')&&events.includes('admob_ssv_reward_confirmed'));
 console.log('PASS wrong signature/unit/user/session ownership; other account/server and legacy profile unchanged; callback reward_item/amount ignored');
 const report={environment:'isolated local Nakama 3.24.2 + PostgreSQL 16',signatures:'local fixture key, never Google production proof',results};
 const out=path.join(root,'tmp','ssv-native-callback-results.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log('Report:',out);
}finally{
 if(callbackServer)await new Promise(resolve=>callbackServer.close(resolve));clearInterval(keepAlive);
 if(created.app)docker(['rm','-f',app]);if(created.pg)docker(['rm','-f',pg]);if(created.network)docker(['network','rm',network]);
}})().catch(e=>{console.error(e);process.exitCode=1;});

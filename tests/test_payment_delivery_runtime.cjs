// Opt-in native Nakama smoke. Creates and removes only its own ephemeral Docker resources.
const fs=require('fs'),path=require('path'),assert=require('assert'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),suffix=Date.now()+'-'+process.pid;
const {migrationSql}=require('../tools/migrate_s1.cjs');
const network='c271-test-'+suffix,pg='c271-pg-'+suffix,app='c271-nakama-'+suffix;
for(const name of [network,pg,app])if(!/^c271-[a-z0-9-]+$/.test(name))throw Error('Invalid test resource name');
const created={network:false,pg:false,app:false};
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options}).trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sql=text=>docker(['exec','-i',pg,'psql','-X','-q','-A','-t','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-f','-'],{input:text});
let base='';
async function http(route,body,authorization){
  const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  const text=await response.text();if(!response.ok)throw Error('HTTP '+response.status+': '+text);return text?JSON.parse(text):{};
}
const keepAlive=setInterval(()=>{},1000);
(async()=>{try{
  console.log('Native smoke: provisioning isolated PostgreSQL and Nakama 3.24.2');
  docker(['network','create',network]);created.network=true;
  docker(['run','-d','--name',pg,'--network',network,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=nakama','postgres:16-alpine']);created.pg=true;
  let ready=false;
  for(let i=0;i<30;i++){try{docker(['exec',pg,'pg_isready','-U','postgres','-d','nakama']);ready=true;break;}catch(_e){await sleep(500);}}
  assert(ready,'test PostgreSQL readiness');
  docker(['run','--rm','--network',network,'--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2','migrate','up','--database.address','postgres@'+pg+':5432/nakama']);
  docker(['run','-d','--name',app,'--network',network,'-p','127.0.0.1::7350','--mount','type=bind,src='+path.join(root,'nakama/data')+',dst=/nakama/data,readonly',
    '--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2','--name','c271test','--database.address','postgres@'+pg+':5432/nakama',
    '--socket.max_request_size_bytes','8388608','--runtime.path','/nakama/data','--runtime.js_entrypoint','build/index.js','--runtime.env','MULTI_SERVER_ENABLED=true',
    '--runtime.env','CONFIG_ADMIN_USER_ID=00000000-0000-0000-0000-000000000143','--runtime.env','MONETIZATION_MODE=production',
    '--runtime.http_key','c271-test-key','--runtime.env','MONETIZATION_VERIFIER_SECRET=c271-test-secret',
    '--runtime.env','ADMOB_REWARDED_UNIT_ID_DEVELOP=c271-test-unit','--logger.level','WARN']);created.app=true;
  const port=docker(['inspect','-f','{{(index (index .NetworkSettings.Ports "7350/tcp") 0).HostPort}}',app]);
  assert(/^\d+$/.test(port));base='http://127.0.0.1:'+port;
  ready=false;for(let i=0;i<40;i++){try{await http('/healthcheck');ready=true;break;}catch(_e){if(i>2&&docker(['inspect','-f','{{.State.Running}}',app])!=='true')break;await sleep(500);}}
  if(!ready)throw Error('Nakama did not initialize: '+docker(['logs',app]));
  console.log('Native smoke: runtime initialized; verifying authenticated scoped RPCs');
  sql(`INSERT INTO users(id,username,custom_id) VALUES('00000000-0000-0000-0000-000000000143','c143admin','c271-native-${suffix}')`);
  const auth=await http('/v2/account/authenticate/custom?create=true',{id:'c271-native-'+suffix},'Basic '+Buffer.from('defaultkey:').toString('base64'));
  const claims=JSON.parse(Buffer.from(auth.token.split('.')[1],'base64url').toString());
  const uid=claims.uid;assert(/^[a-f0-9-]{36}$/.test(uid));
  const call=async(id,body)=>{const response=await http('/v2/rpc/'+id,JSON.stringify({app_version:'999.0.0',config_version:1,...body}),'Bearer '+auth.token);return JSON.parse(response.payload);};

  const runSeed=()=>execFileSync('python',['-B',path.join(root,'nakama/seed_all.py')],{encoding:'utf8',timeout:120000,
    env:{...process.env,NAKAMA_URL:base,NAKAMA_SEED_URL:'',NAKAMA_HTTP_KEY:'c271-test-key',NAKAMA_SEED_TIMEOUT:'90'}});
  assert(runSeed().includes('committed atomically'));
  sql(`UPDATE remote_config_releases SET snapshot=jsonb_set(snapshot,'{system,payment_enabled}','false');
    INSERT INTO game_servers(server_id,display_name,status,allow_new_characters,config_version) SELECT 's001','C271 fixture','open',TRUE,MAX(config_version) FROM remote_config_releases;
    INSERT INTO player_characters(account_id,server_id,generation,status) VALUES('${uid}','s001',1,'ready');
    INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_profiles','s001:g1:main','${uid}','{"resources":{"gems":0}}','fixture',0,0);
    INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_inventory','s001:g1:items','${uid}','{"items":[]}','fixture',0,0),('player_heroes','s001:g1:states','${uid}','{"heroes":[]}','fixture',0,0); INSERT INTO game_store_products(product_id,pack_id,display_name,active) VALUES('c271pack','c271pack','Test pack',TRUE);`);
  const bridge=async body=>http('/v2/rpc/google_play_delivery?http_key=c271-test-key&unwrap=true',{verifier_secret:'c271-test-secret',...body});
  assert.equal((await bridge({action:'lease'})).success,true);
  const noSecret=await http('/v2/rpc/google_play_delivery?http_key=c271-test-key&unwrap=true',{action:'lease'});assert.equal(noSecret.code,403);
  assert.equal((await call('google_play_delivery',{action:'lease',verifier_secret:'c271-test-secret'})).code,403);
  const {createHash}=require('crypto');
  const hash=n=>createHash('sha256').update('native-c271-'+n).digest('hex');
  const order=n=>'native-c271-order-'+n;
  const make=async(n,status='pending')=>{
    sql(`UPDATE monetization_purchase_orders SET status='expired' WHERE status='pending'; INSERT INTO monetization_purchase_orders(id,user_id,product_id,status,reward_snapshot,fulfillment_type,vip_exp,vip_environment,platform,store_product_id,target_server_id,target_generation)
      VALUES('${order(n)}','${uid}','c271pack','${status}','[{"reward_type":"currency","reward_id":"gems","quantity":100},{"reward_type":"entitlement","reward_id":"no_ads_seconds","quantity":3600}]','consumable',500,'production','android','play.c271pack','s001',1)`);
    const r=await bridge({action:'enqueue',token_hash:hash(n),encrypted_token:'v1.aXY=.dGFn.Y2lwaGVydGV4dA==',package_name:'vn.fixture.test',product_id:'play.c271pack',expected_order_id:order(n),expected_user_id:uid});assert.equal(r.success,true,JSON.stringify(r));
  };
  const lease=async()=>{const r=await bridge({action:'lease',limit:20});assert.equal(r.success,true,JSON.stringify(r));return r.jobs;};
  const verified=n=>({state:'PURCHASED',package_name:'vn.fixture.test',product_id:'play.c271pack',order_id:order(n),user_id:uid,transaction_id:'GPA.fixture.'+n,quantity:1,test_purchase:false});
  const apply=async(job,v)=>bridge({action:'apply',token_hash:job.token_hash,lease_id:job.lease_id,verified:v});
  await make(1);
  const [j]=await lease();assert(j);
  assert.equal((await lease()).length,0,'live lease excluded');
  assert.equal((await apply({...j,lease_id:'stale'},verified(1))).code,409);
  const first=await apply(j,verified(1));assert.equal(first.delivered,true,JSON.stringify(first));
  const effects=()=>sql(`SELECT jsonb_build_array((SELECT COUNT(*) FROM monetization_purchases),(SELECT COUNT(*) FROM storage WHERE collection='player_purchase_grants'),(SELECT COUNT(*) FROM storage WHERE collection='player_mail' AND value->>'source_type'='purchase'),(SELECT EXTRACT(EPOCH FROM no_ads_expires_at)::BIGINT FROM player_monetization_entitlements WHERE user_id='${uid}'))`);
  const before=effects();
  // Abrupt process loss after committed delivery and before Google finalization.
  docker(['kill','--signal','KILL',app]);docker(['start',app]);
  base='http://127.0.0.1:'+docker(['inspect','-f','{{(index (index .NetworkSettings.Ports "7350/tcp") 0).HostPort}}',app]);
  for(let i=0;i<40;i++){try{await http('/healthcheck');break;}catch(_e){await sleep(250);}}
  sql(`UPDATE payment_delivery_jobs SET lease_until=NOW()-INTERVAL '1 second'; UPDATE game_servers SET status='maintenance' WHERE server_id='s001';`);
  const [resumed]=await lease();assert.notEqual(resumed.lease_id,j.lease_id);
  assert.equal((await apply(j,verified(1))).code,409,'old worker fenced after restart');
  assert.equal((await apply(resumed,verified(1))).delivered,true,'delivered order can finalize during maintenance');
  assert.equal(effects(),before,'restart and replay cannot add effects or no-ads duration');
  assert.equal((await bridge({action:'finalized',token_hash:hash(1),lease_id:resumed.lease_id})).success,true);
  assert.equal((await lease()).length,0,'complete jobs are not leased');
  console.log('PASS native delivery, abrupt restart, expired lease fencing, finalization under maintenance and no repeated effects');
  sql(`UPDATE game_servers SET status='open' WHERE server_id='s001';`);
  await make(2);const [pending]=await lease();
  assert.equal((await apply(pending,{state:'PENDING',package_name:'vn.fixture.test'})).delivered,false);
  assert.equal(effects(),before,'PENDING has no rewards');
  assert.equal((await call('admin_order_fulfill',{order_id:order(2),reason:'support reviewed'})).code,409,'pending payment cannot be compensated');
  await make(3,'expired');const [expired]=await lease();assert.equal((await apply(expired,verified(3))).review,true);assert.equal(effects(),before);
  await make(4);const [bad]=await lease();assert.equal((await apply(bad,{...verified(4),user_id:'wrong-owner'})).review,true);assert.equal(effects(),before);
  await make(5);const [canceled]=await lease();await apply(canceled,{state:'CANCELED',package_name:'vn.fixture.test'});assert.equal(effects(),before);
  await make(6);const [qty]=await lease();assert.equal((await apply(qty,{...verified(6),quantity:2})).review,true);assert.equal(effects(),before);
  console.log('PASS native PENDING/canceled/expired/wrong owner/multi-quantity: no extra effects; admin cannot bypass pending Google payment');
  // Requeue provider retry atomically with audit; request cannot select new rewards.
  await make(7);const [retry]=await lease();await bridge({action:'retry',token_hash:hash(7),lease_id:retry.lease_id,reason:'PROVIDER_RETRY'});
  assert.equal((await call('admin_order_fulfill',{order_id:order(7),reason:'x'})).code,400);
  const queued=await call('admin_order_fulfill',{order_id:order(7),reason:'Verified support retry'});assert.equal(queued.success,true,JSON.stringify(queued));
  assert.equal(sql(`SELECT COUNT(*) FROM payment_delivery_audit WHERE order_id='${order(7)}'`),'1');
  const [next]=await lease();assert.equal((await apply(next,verified(7))).delivered,true);
  const afterTwo=effects();assert.notEqual(afterTwo,before);
  // Reapplying same live lease (e.g. bridge response lost) stays idempotent.
  const parallel=await Promise.all([apply(next,verified(7)),apply(next,verified(7))]);assert(parallel.every(r=>r.delivered),JSON.stringify(parallel));assert.equal(effects(),afterTwo);
  const inbox=await call('mail_list',{server_id:'s001',generation:1});assert.equal(inbox.success,true,JSON.stringify(inbox));
  const id=inbox.mails.find(m=>m.source_type==='purchase').id;
  const claimsResult=await Promise.all([call('mail_claim',{server_id:'s001',generation:1,id}),call('mail_claim',{server_id:'s001',generation:1,id})]);assert(claimsResult.some(r=>r.success),JSON.stringify(claimsResult));
  assert.equal((await call('mail_claim',{server_id:'s001',generation:1,id})).already_claimed,true);
  assert.equal(sql(`SELECT value->'resources'->>'gems' FROM storage WHERE user_id='${uid}' AND collection='player_profiles' AND key='s001:g1:main'`),'100');

  await make(8);
  sql(`CREATE FUNCTION c271_interrupt_ledger() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id='${order(8)}' THEN RAISE EXCEPTION 'fixture interruption'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER c271_interrupt BEFORE INSERT ON monetization_purchases FOR EACH ROW EXECUTE FUNCTION c271_interrupt_ledger();`);
  const [interrupted]=await lease();const partial=await apply(interrupted,verified(8));assert.equal(partial.delivered,false,JSON.stringify(partial));
  assert.equal(sql(`SELECT COUNT(*) FROM storage WHERE collection='player_purchase_grants'`),'3','Storage grant commits before failed SQL ledger');
  assert.equal(sql(`SELECT COUNT(*) FROM monetization_purchases`),'2','failed SQL transaction rolls back');
  sql(`DROP TRIGGER c271_interrupt ON monetization_purchases; DROP FUNCTION c271_interrupt_ledger(); UPDATE payment_delivery_jobs SET next_attempt_at=NOW() WHERE token_hash='${hash(8)}';`);
  const [repair]=await lease();assert.equal((await apply(repair,verified(8))).delivered,true);
  assert.equal(sql(`SELECT COUNT(*) FROM storage WHERE collection='player_mail' AND value->>'source_type'='purchase'`),'3','repair cannot send another mail');
  assert.equal(sql(`SELECT COUNT(*) FROM monetization_purchases`),'3');
  assert.equal(sql(`SELECT SUM(exp) FROM player_vip_credits WHERE user_id='${uid}'`),'1500','immutable VIP snapshot credited once per purchase');
  sql(`DELETE FROM player_vip_credits WHERE purchase_id=(SELECT id FROM monetization_purchases WHERE request_id='${order(8)}')`);
  assert.equal((await apply(repair,verified(8))).delivered,true,'VIP completion repaired before ack');
  assert.equal(sql(`SELECT SUM(exp) FROM player_vip_credits WHERE user_id='${uid}'`),'1500');
  console.log('PASS native committed Storage / failed SQL repair and missing VIP credit repair without repeated mail');
  console.log('PASS native admin queue/audit, parallel reapply, exactly one mail claim, disabled checkout does not block paid recovery');
}finally{
 clearInterval(keepAlive);
 if(created.app)docker(['rm','-f',app]);if(created.pg)docker(['rm','-f',pg]);if(created.network)docker(['network','rm',network]);
}})().catch(e=>{console.error(e);process.exitCode=1;});

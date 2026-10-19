// Opt-in native Nakama smoke. Creates and removes only its own ephemeral Docker resources.
const fs=require('fs'),path=require('path'),assert=require('assert'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),suffix=Date.now()+'-'+process.pid;
const {migrationSql}=require('../tools/migrate_s1.cjs');
const network='c143-test-'+suffix,pg='c143-pg-'+suffix,app='c143-nakama-'+suffix;
for(const name of [network,pg,app])if(!/^c143-[a-z0-9-]+$/.test(name))throw Error('Invalid test resource name');
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
    '--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2','--name','c143test','--database.address','postgres@'+pg+':5432/nakama',
    '--runtime.path','/nakama/data','--runtime.js_entrypoint','build/index.js','--runtime.env','MULTI_SERVER_ENABLED=true',
    '--runtime.env','CONFIG_ADMIN_USER_ID=00000000-0000-0000-0000-000000000143','--runtime.env','MONETIZATION_MODE=mock',
    '--runtime.http_key','c143-test-key','--runtime.env','MONETIZATION_VERIFIER_SECRET=c143-test-secret',
    '--runtime.env','ADMOB_REWARDED_UNIT_ID_DEVELOP=c143-test-unit','--logger.level','WARN']);created.app=true;
  const port=docker(['inspect','-f','{{(index (index .NetworkSettings.Ports "7350/tcp") 0).HostPort}}',app]);
  assert(/^\d+$/.test(port));base='http://127.0.0.1:'+port;
  ready=false;for(let i=0;i<40;i++){try{await http('/healthcheck');ready=true;break;}catch(_e){if(i>2&&docker(['inspect','-f','{{.State.Running}}',app])!=='true')break;await sleep(500);}}
  if(!ready)throw Error('Nakama did not initialize: '+docker(['logs',app]));
  console.log('Native smoke: runtime initialized; verifying authenticated scoped RPCs');
  sql(`INSERT INTO users(id,username,custom_id) VALUES('00000000-0000-0000-0000-000000000143','c143admin','c143-native-${suffix}')`);
  const auth=await http('/v2/account/authenticate/custom?create=true',{id:'c143-native-'+suffix},'Basic '+Buffer.from('defaultkey:').toString('base64'));
  const claims=JSON.parse(Buffer.from(auth.token.split('.')[1],'base64url').toString());
  const uid=claims.uid;assert(/^[a-f0-9-]{36}$/.test(uid));
  const call=async(id,body)=>{const response=await http('/v2/rpc/'+id,JSON.stringify({app_version:'999.0.0',config_version:1,...body}),'Bearer '+auth.token);return JSON.parse(response.payload);};
  // Rehearse the offline migration before the gameplay fixture. Never run it against a live runtime.
  sql(`INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url) VALUES(1,'{}','0.0.0','0.0.0','') ON CONFLICT DO NOTHING;
    INSERT INTO game_servers(server_id,display_name,status,config_version) VALUES('s001','Migration S1','disabled',1);
    INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_profiles','main','${uid}','{"display_name":"migration sentinel"}','migration-v1',0,0);`);
  const preview=JSON.parse(sql(migrationSql('plan')));
  assert.equal(preview.storage_count,1);
  docker(['stop',app]);
  const migrated=sql(migrationSql('apply',preview.manifest_hash,true));assert(migrated.includes('legacy_preserved'));
  sql(migrationSql('apply',preview.manifest_hash,true));
  const verified=JSON.parse(sql(migrationSql('verify')));assert.equal(verified.missing_or_changed,0);
  assert.equal(sql("SELECT status FROM game_servers WHERE server_id='s001'"),'disabled');
  assert.equal(sql("SELECT COUNT(*) FROM storage WHERE key IN ('main','s001:g1:main')"),'2');
  // Remove only this test fixture before continuing; raw legacy sentinel is recreated below.
  sql(`DELETE FROM player_server_preferences WHERE account_id='${uid}';DELETE FROM player_characters WHERE account_id='${uid}';
    DELETE FROM storage WHERE user_id='${uid}';DELETE FROM server_migration_checkpoints WHERE id='legacy_to_s001_g1';DELETE FROM game_servers WHERE server_id='s001';`);
  docker(['start',app]);
  base='http://127.0.0.1:'+docker(['inspect','-f','{{(index (index .NetworkSettings.Ports "7350/tcp") 0).HostPort}}',app]);
  for(let i=0;i<40;i++){try{await http('/healthcheck');break;}catch(_e){await sleep(250);}}
  sql(`INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url)
    VALUES(1,'{"system":{"payment_enabled":true,"rewarded_ads":{"schema_version":2,"placements":{"stamina_dialog_ad":{"type":"stamina","amount":5,"daily_limit":2}}}},"game_play":{}}','0.0.0','0.0.0','') ON CONFLICT(config_version) DO UPDATE SET snapshot=EXCLUDED.snapshot,min_app_version=EXCLUDED.min_app_version,latest_app_version=EXCLUDED.latest_app_version;
    INSERT INTO game_servers(server_id,display_name,status,allow_new_characters,config_version) VALUES('s001','S1','open',TRUE,1),('s002','S2','open',TRUE,1),('s003','S3','open',TRUE,1);
    INSERT INTO player_characters(account_id,server_id,generation,status) VALUES('${uid}','s001',1,'ready'),('${uid}','s002',1,'ready');
    INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES
      ('player_profiles','main','${uid}','{"display_name":"Legacy sentinel"}','v1',0,0),
      ('player_profiles','s001:g1:main','${uid}','{"display_name":"S1 before","name_changes_used":0,"avatar_url":"hero_1"}','v1',0,0),
      ('player_profiles','s002:g1:main','${uid}','{"display_name":"S2 sentinel","name_changes_used":0}','v1',0,0),
      ('player_identity','s001:g1:name','${uid}','{"display_name":"S1 before","name_changes_used":0}','v1',0,0),
      ('player_inventory','s001:g1:items','${uid}','{"items":[]}','v1',0,0);`);
  assert.equal((await call('get_config_bootstrap',{platform:'ios'})).reason,'SERVER_REQUIRED');
  assert.equal((await call('get_config_bootstrap',{platform:'ios',server_id:'s001',generation:1})).status,'ok');
  const renamed=await call('rename_player',{server_id:'s001',generation:1,display_name:'Native Player'});
  assert.equal(renamed.success,true,JSON.stringify(renamed));
  assert.equal(sql("SELECT value->>'display_name' FROM storage WHERE collection='player_profiles' AND key='s001:g1:main'"),'Native Player');
  const loser='00000000-0000-0000-0000-000000000144',ticket='00000000-0000-0000-0000-000000000145';
  sql(`INSERT INTO users(id,username,google_id) VALUES('${loser}','google_fixture','verified_google_fixture');
    INSERT INTO game_servers(server_id,display_name,status,config_version) VALUES('s004','S4','open',1);
    INSERT INTO player_characters(account_id,server_id,generation,status) VALUES('${loser}','s004',1,'ready');
    INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_profiles','s004:g1:main','${loser}','{"display_name":"Google S4","level":4}','google-v1',0,0);
    INSERT INTO account_link_intents(id,initiator,other_id,google_id,identity_snapshot,versions,finance_snapshot,multi_snapshot)
    SELECT '${ticket}','${uid}','${loser}','verified_google_fixture',
      (SELECT jsonb_object_agg(id::TEXT,jsonb_build_object('email',email,'google',google_id,'password',password,'custom',custom_id,'disabled',disable_time)) FROM users WHERE id IN('${uid}','${loser}')),
      (SELECT jsonb_object_agg(user_id::TEXT||'/'||collection||'/'||key,version) FROM storage WHERE user_id IN('${uid}','${loser}')),
      account_link_finance_snapshot('${uid}','${loser}'),multi_account_link_snapshot('${uid}','${loser}');`);
  const merge=JSON.parse(sql(`SELECT commit_multi_google_account_link('${ticket}','${uid}','${uid}')`));
  assert.equal(merge.winner_id,uid);
  assert.equal(JSON.parse(sql(`SELECT commit_multi_google_account_link('${ticket}','${uid}','${uid}')`)).replayed,true);
  assert.equal(sql(`SELECT value->>'display_name' FROM storage WHERE user_id='${uid}' AND key='s004:g1:main'`),'Google S4');
  assert.equal(sql(`SELECT status FROM player_characters WHERE account_id='${uid}' AND server_id='s004'`),'ready');
  assert.equal(sql(`SELECT google_id FROM users WHERE id='${uid}'`),'verified_google_fixture');
  assert.equal(sql(`SELECT status FROM account_link_state WHERE user_id='${loser}'`),'archived');
  assert.equal(sql("SELECT value->>'display_name' FROM storage WHERE collection='player_profiles' AND key='s002:g1:main'"),'S2 sentinel');
  assert.equal(sql("SELECT value->>'display_name' FROM storage WHERE collection='player_profiles' AND key='main'"),'Legacy sentinel');
  assert.equal(sql("SELECT active_requests FROM game_servers WHERE server_id='s001'"),'0');
  const serverCards=await call('list_servers',{});
  const s1Card=serverCards.servers.find(s=>s.server_id==='s001');
  assert.equal(s1Card.character_name,'Native Player');assert.equal(s1Card.character_level,1);
  assert(serverCards.servers.every((s,i,list)=>i===0||Number(list[i-1].created_at_ms)>=Number(s.created_at_ms)),'newest-first API order');
  sql(`INSERT INTO game_store_products(product_id,pack_id,display_name,active) VALUES('c143pack','c143pack','Test pack',TRUE);
    INSERT INTO game_store_product_rewards(product_id,line_no,reward_type,reward_id,quantity) VALUES('c143pack',1,'currency','gems',10);
    INSERT INTO game_content_configs(id,payload) VALUES('vip','{"max_level":1,"levels":[{"level":1,"min_exp":500}],"product_exp":{"c143pack":500}}')
      ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload;`);
  const buy=async sid=>call('create_purchase_order',{server_id:sid,generation:1,platform:'android',product_id:'c143pack'});
  const order1=await buy('s001'),order2=await buy('s002');assert.equal(order1.status,'success',JSON.stringify(order1));assert.equal(order2.status,'success',JSON.stringify(order2));
  assert.notEqual(order1.data.purchase_order_id,order2.data.purchase_order_id,'pending orders scoped by character');
  assert.equal((await buy('s001')).data.purchase_order_id,order1.data.purchase_order_id,'pending order replay');
  const claim=async(sid,id)=>call('iap_claim',{server_id:sid,generation:1,platform:'android',purchase_order_id:id});
  assert.equal((await claim('s002',order1.data.purchase_order_id)).reason,'ORDER_TARGET_MISMATCH');
  const paid=await claim('s001',order1.data.purchase_order_id);assert.equal(paid.status,'success',JSON.stringify(paid));
  assert.equal(paid.data.vip.exp,500,'VIP credited in original character');
  assert.equal((await claim('s001',order1.data.purchase_order_id)).status,'success');
  assert.equal(sql("SELECT value->'resources'->>'gems' FROM storage WHERE key='s001:g1:main'"),'10','claim replay cannot grant twice');
  assert.equal((await claim('s002',order2.data.purchase_order_id)).status,'success');
  const refundBody={verifier_secret:'c143-test-secret',purchase_token_hash:'mock:'+order1.data.purchase_order_id};
  assert.equal((await http('/v2/rpc/google_play_rtdn_confirm?http_key=c143-test-key&unwrap=true',refundBody)).data.changed,true);
  assert.equal((await http('/v2/rpc/google_play_rtdn_confirm?http_key=c143-test-key&unwrap=true',refundBody)).data.changed,false,'refund idempotency');
  assert.equal((await claim('s001',order1.data.purchase_order_id)).code,409,'voided receipt cannot restore rewards');
  assert.equal((await call('get_monetization_status',{server_id:'s001',generation:1})).data.vip.exp,0,'refund only revokes original VIP scope');
  assert.equal(sql("SELECT COUNT(*) FROM monetization_purchases WHERE target_server_id='s002' AND target_generation=1"),'1');
  const ad=async sid=>call('prepare_rewarded_ad',{server_id:sid,generation:1,placement_id:'stamina_dialog_ad',request_id:'same_request_both_servers'});
  const ad1=await ad('s001'),ad2=await ad('s002');assert.equal(ad1.status,'success',JSON.stringify(ad1));assert.equal(ad2.status,'success',JSON.stringify(ad2));
  assert.notEqual(ad1.data.ad_session_id,ad2.data.ad_session_id,'request IDs are character-scoped');
  assert.equal((await call('confirm_rewarded_ad',{server_id:'s001',generation:1,ad_session_id:ad2.data.ad_session_id})).reason,'AD_TARGET_MISMATCH');
  assert.equal((await call('confirm_rewarded_ad',{server_id:'s002',generation:1,ad_session_id:ad2.data.ad_session_id})).status,'success');
  const made=await call('create_character',{server_id:'s003',generation:1});assert.equal(made.success,true,JSON.stringify(made));
  assert.equal((await call('enter_server',{server_id:'s003',generation:1})).success,true);
  assert.equal((await call('iap_claim',{server_id:'s001',generation:1,platform:'ios'})).code,404);
  sql("UPDATE game_servers SET status='disabled' WHERE server_id='s001'");
  const late=await http('/v2/rpc/admob_ssv_confirm?http_key=c143-test-key&unwrap=true',{
    verifier_secret:'c143-test-secret',ad_session_id:ad1.data.ad_session_id,user_id:uid,transaction_id:'late-ssv-1',ad_unit:'c143-test-unit'});
  assert.equal(late.status,'success',JSON.stringify(late));assert.equal(late.data.queued,true);
  assert.equal(sql("SELECT COUNT(*) FROM server_financial_inbox WHERE target_server_id='s001' AND status='pending' AND event_type='admob_ssv'"),'1');
  assert.equal((await call('get_config_bootstrap',{platform:'ios',server_id:'s001',generation:1})).reason,'SERVER_UNAVAILABLE');
  assert.equal((await call('get_config_bootstrap',{platform:'ios',server_id:'s002',generation:2})).reason,'GENERATION_MISMATCH');
  const lifecycle=async(action,body)=>call('admin_server_'+action,body);
  sql("UPDATE game_servers SET status='disabled' WHERE server_id='s002'");
  const scope={server_id:'s002',action:'reset',expected_generation:1,expected_revision:1,reason:'isolated reset test'};
  const plan=await lifecycle('plan',scope);assert.equal(plan.success,true,JSON.stringify(plan));
  assert.equal(plan.counts.storage,2);
  const execution={...scope,plan_id:plan.plan_id,manifest_hash:plan.manifest_hash,request_id:'reset_native_test'};
  assert.equal((await lifecycle('execute',{...execution,manifest_hash:'invalid'})).success,false,'wrong manifest hash rejected');
  const reset=await lifecycle('execute',execution);assert.equal(reset.success,true,JSON.stringify(reset));
  assert.equal((await lifecycle('execute',execution)).success,true,'request replay');
  assert.equal(sql("SELECT generation FROM game_servers WHERE server_id='s002'"),'2');
  assert.equal(sql("SELECT COUNT(*) FROM storage WHERE key='s002:g1:main'"),'1','reset retains snapshot namespace');
  assert.equal((await lifecycle('enable',{server_id:'s002',expected_revision:2,reason:'test reenable'})).success,true);
  assert.equal((await call('create_character',{server_id:'s002',generation:2})).success,true,'retired character can recreate');
  assert.equal((await call('enter_server',{server_id:'s002',generation:2})).success,true);
  assert.equal((await lifecycle('disable',{server_id:'s002',expected_revision:3,reason:'delete fixture'})).success,true);
  const delScope={server_id:'s002',action:'delete',expected_generation:2,expected_revision:4,reason:'delete only current generation'};
  const dp=await lifecycle('plan',delScope);assert.equal(dp.success,true,JSON.stringify(dp));
  const deleted=await lifecycle('execute',{...delScope,plan_id:dp.plan_id,manifest_hash:dp.manifest_hash,request_id:'delete_native_test'});
  assert.equal(deleted.success,true,JSON.stringify(deleted));
  const job=typeof deleted.job==='string'?JSON.parse(deleted.job):deleted.job;
  const stepped=await lifecycle('job_step',{job_id:job.id});assert.equal(stepped.success,true,JSON.stringify(stepped));
  assert.equal(stepped.job.status,'succeeded',JSON.stringify(stepped));
  assert.equal(sql("SELECT status FROM game_servers WHERE server_id='s002'"),'deleted');
  assert.equal(sql("SELECT COUNT(*) FROM storage WHERE key LIKE 's002:g2:%'"),'0');
  assert.equal(sql("SELECT COUNT(*) FROM storage WHERE key='s002:g1:main'"),'1','retired generation requires retained cleanup');
  assert.equal(sql("SELECT value->>'display_name' FROM storage WHERE collection='player_profiles' AND key='s001:g1:main'"),'Native Player');
  const cleanupScope={server_id:'s002',action:'cleanup',expected_generation:1,expected_revision:6,reason:'retired generation cleanup'};
  const cp=await lifecycle('plan',cleanupScope);assert.equal(cp.success,true,JSON.stringify(cp));
  const cleanupRequest={...cleanupScope,plan_id:cp.plan_id,manifest_hash:cp.manifest_hash,request_id:'cleanup_native_test'};
  assert.equal((await lifecycle('execute',cleanupRequest)).success,false,'retention cannot be bypassed');
  sql("UPDATE server_generation_snapshots SET retain_until=NOW()-INTERVAL '1 second' WHERE server_id='s002' AND generation=1");
  const cleanup=await lifecycle('execute',cleanupRequest);assert.equal(cleanup.success,true,JSON.stringify(cleanup));
  const cleaned=await lifecycle('job_step',{job_id:cleanup.job.id});assert.equal(cleaned.job.status,'succeeded',JSON.stringify(cleaned));
  assert.equal(sql("SELECT COUNT(*) FROM storage WHERE key LIKE 's002:g1:%'"),'0');
  assert.equal(sql("SELECT COUNT(*) FROM monetization_purchases WHERE target_server_id='s002' AND target_generation=1"),'1','cleanup retains financial dedupe');
  console.log('PASS native Nakama 3.24.2: isolated migration/replay/verify, Google merge/archive/replay, scoped IAP/VIP and ads, late callback inbox, reset/recreate/delete/retained cleanup, S1/shared/legacy isolation');
}finally{
  clearInterval(keepAlive);
  // Exact generated names only. No existing project/container/volume is removed.
  for(const [flag,name] of [['app',app],['pg',pg]])if(created[flag])docker(['rm','-f',name]);
  if(created.network)docker(['network','rm',network]);
}})().catch(error=>{console.error(error.message);process.exitCode=1;});

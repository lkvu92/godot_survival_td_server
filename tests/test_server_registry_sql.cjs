// Real PostgreSQL registry/admin regression, restricted to a disposable test schema.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{spawnSync}=require('child_process');
const pg=process.env.SEED_TEST_PSQL,port=process.env.SEED_TEST_PORT;
if(!pg||!port)throw Error('Set SEED_TEST_PSQL and SEED_TEST_PORT for a disposable PostgreSQL instance');
const schema='server_registry_test_'+Date.now();
if(!/^server_registry_test_\d+$/.test(schema))throw Error('Invalid disposable schema');
function execute(sql,args=[],csv=false){
  const bound=sql.replace(/\$(\d+)\b/g,(_,n)=>{
    const v=args[Number(n)-1];if(v===undefined)throw Error('Unbound parameter '+n);
    if(v===null)return 'NULL';if(typeof v==='number')return String(v);if(typeof v==='boolean')return v?'TRUE':'FALSE';
    return "'"+String(v).replace(/'/g,"''")+"'";
  });
  const result=spawnSync(pg,['-X','-q',...(csv?['--csv']:[]),'-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],
    {input:bound,encoding:'utf8',env:{...process.env,PGOPTIONS:'-c search_path='+schema+',public'},maxBuffer:8*1024*1024});
  if(result.status!==0)throw Error(result.stderr||result.error?.message||'psql failed');
  return result.stdout;
}
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  if(!rows.length)return [];
  const headers=rows.shift();return rows.filter(r=>r.length===headers.length).map(r=>Object.fromEntries(r.map((v,i)=>[headers[i],v==='t'?true:v==='f'?false:/^-?\d+(\.\d+)?$/.test(v)?Number(v):v])));
}
const nk={sqlExec:(sql,args)=>execute(sql,args),sqlQuery:(sql,args)=>parseCsv(execute(sql,args,true))};
const sandbox=vm.createContext({});
for(const name of ['server_context','server_admin','character_repository','server_weekly','weekly_leaderboard','monetization_rpc'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',name+'.js'),'utf8'),sandbox);
sandbox.parseJsonb=v=>typeof v==='string'?JSON.parse(v):v;
const fn=name=>vm.runInContext(name,sandbox);
const account='00000000-0000-0000-0000-000000000143';
const ctx={userId:account,env:{CONFIG_ADMIN_USER_ID:account,MULTI_SERVER_ENABLED:'true'}};
const call=(action,body)=>JSON.parse(fn('serverAdminHandler')(action)(ctx,{},nk,JSON.stringify(body)));
try{
  execute(`CREATE SCHEMA ${schema};CREATE TABLE users(id UUID PRIMARY KEY,disable_time TIMESTAMPTZ);INSERT INTO users VALUES('${account}');
    CREATE TABLE account_link_state(user_id UUID PRIMARY KEY,status TEXT);
    CREATE TABLE remote_config_releases(config_version BIGINT PRIMARY KEY);INSERT INTO remote_config_releases VALUES(1);`);
  fn('createServerRegistryTables')(nk);fn('createServerRegistryTables')(nk);
  const req={server_id:'s002',request_id:'create_s002_test',display_name:'S2 Thanh Phong',config_version:1,opens_at:'2026-01-01T00:00:00Z',allow_new_characters:true,reason:'test fixture'};
  assert.equal(JSON.parse(fn('serverAdminHandler')('create')({userId:account,env:{}},{},nk,JSON.stringify(req))).code,403);
  const created=call('create',req);assert.equal(created.success,true);assert.equal(created.server.status,'disabled');
  assert.equal(call('create',req).replayed,true);
  assert.equal(call('create',{...req,display_name:'Changed'}).reason,'REQUEST_ID_CONFLICT');
  assert.equal(call('create',{...req,request_id:'other_request',config_version:999}).reason,'CONFIG_NOT_FOUND');
  assert.equal(call('list',{}).servers.length,1);
  assert.equal(call('inspect',{server_id:'s002'}).server.character_count,0);
  assert.equal(call('disable',{server_id:'s002',expected_revision:1,reason:'disable test'}).server.revision,2);
  assert.equal(call('disable',{server_id:'s002',expected_revision:1,reason:'stale'}).reason,'REVISION_OR_STATE_CONFLICT');
  assert.equal(nk.sqlQuery('SELECT COUNT(*)::INT AS count FROM server_operation_audit',[])[0].count,2,'replay/conflict cannot append audit mutation');
  assert.equal(JSON.parse(fn('enterGameServer')(ctx,{},nk,JSON.stringify({server_id:'s002',generation:1}))).reason,'SERVER_UNAVAILABLE');
  assert.equal(call('update',{server_id:'s002',expected_revision:2,display_name:'S2 updated',opens_at:req.opens_at,allow_new_characters:true,reason:'update test'}).server.revision,3);
  assert.equal(call('enable',{server_id:'s002',expected_revision:3,reason:'enable test'}).server.status,'open');
  execute("UPDATE game_servers SET active_requests=1 WHERE server_id='s002'");
  assert.equal(call('disable',{server_id:'s002',expected_revision:4,reason:'drain test'}).drained,false);
  assert.equal(call('enable',{server_id:'s002',expected_revision:5,reason:'not drained'}).reason,'REVISION_OR_STATE_CONFLICT');
  execute("UPDATE game_servers SET active_requests=0 WHERE server_id='s002'");
  assert.equal(call('enable',{server_id:'s002',expected_revision:5,reason:'drained'}).server.status,'open');
  fn('createServerWeeklyTables')(nk);fn('createServerWeeklyTables')(nk);
  call('create',{...req,server_id:'s001',request_id:'create_s001_test'});
  execute("UPDATE game_servers SET status='open' WHERE server_id IN ('s001','s002')");
  const leaseScope={accountId:account,serverId:'s002',generation:1};
  fn('withServerRequest')(nk,leaseScope,()=>{
    assert.equal(nk.sqlQuery("SELECT active_requests FROM game_servers WHERE server_id='s002'",[])[0].active_requests,1);
    execute("UPDATE game_servers SET status='disabled' WHERE server_id='s002'");
    assert.throws(()=>fn('withServerRequest')(nk,leaseScope,()=>{}),/SERVER_REQUEST_FENCED/);
  });
  assert.equal(nk.sqlQuery("SELECT active_requests FROM game_servers WHERE server_id='s002'",[])[0].active_requests,0,'existing writer drains and releases after disable');
  execute("UPDATE game_servers SET status='open' WHERE server_id='s002'");
  const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/leaderboard_rewards.json'),'utf8'));
  for(const [sid,score] of [['s001',100],['s002',900]])nk.sqlQuery('SELECT server_weekly_record($1,1,$2::UUID,$3::JSONB,$4,$5::JSONB,1)',[sid,account,JSON.stringify({cultivation_realm:score}),sid,JSON.stringify(cfg)]);
  assert.equal(nk.sqlQuery("SELECT COUNT(*)::INT AS count FROM server_weekly_scores",[])[0].count,2);
  execute(`INSERT INTO server_weekly_periods(server_id,generation,period_id,starts_at,closes_at,config_version,config)
    SELECT server_id,generation,period_id-604800,starts_at-INTERVAL '7 days',closes_at-INTERVAL '7 days',config_version,config FROM server_weekly_periods;
    INSERT INTO server_weekly_scores SELECT server_id,generation,period_id-604800,board_id,user_id,score,achieved_at-INTERVAL '7 days',display_name FROM server_weekly_scores;`);
  for(const sid of ['s001','s002'])nk.sqlQuery('SELECT server_weekly_tick($1,1,$2::JSONB,1)',[sid,JSON.stringify(cfg)]);
  const awards=nk.sqlQuery('SELECT server_id,rank,period_id FROM server_weekly_awards ORDER BY server_id',[]);
  assert.equal(awards.length,2);assert(awards.every(a=>a.rank===1),'same account ranks independently on each server');
  const memory=new Map(),key=r=>r.userId+'/'+r.collection+'/'+r.key,clone=x=>JSON.parse(JSON.stringify(x));
  const actualQuery=nk.sqlQuery;
  const storeNk={...nk,sqlQuery:(sql,args)=>sql.includes('FROM game_items')?[{stackable:true,max_stack:99999}]:actualQuery(sql,args),
    storageRead:refs=>refs.flatMap(r=>memory.has(key(r))?[clone(memory.get(key(r)))]:[]),
    storageWrite:writes=>{
      for(const w of writes){const old=memory.get(key(w));if(w.version==='*'?!!old:!old||old.version!==w.version)throw Error('CAS');}
      return writes.map(w=>{const saved={...clone(w),version:String(Number(memory.get(key(w))?.version||0)+1)};memory.set(key(w),saved);return saved;});
    }};
  for(const sid of ['s001','s002'])for(const [collection,suffix,value] of [['player_profiles','main',{resources:{gold:0,gems:0}}],['player_inventory','items',{items:[]}]]){
    const r={collection,key:sid+':g1:'+suffix,userId:account,value,version:'1'};memory.set(key(r),r);
  }
  const runtime=fn('characterRuntime')(storeNk,{accountId:account,serverId:'s001',generation:1});
  const rewardBody=JSON.stringify({board_id:'cultivation_realm',period_id:awards[0].period_id});
  assert.equal(JSON.parse(fn('claimServerWeekly')(ctx,{},runtime,rewardBody)).success,true);
  assert.equal(JSON.parse(fn('claimServerWeekly')(ctx,{},runtime,rewardBody)).already_claimed,true);
  assert.equal(memory.get(account+'/player_profiles/s001:g1:main').value.resources.gems,300);
  assert.equal(memory.get(account+'/player_profiles/s002:g1:main').value.resources.gems,0);
  const resetRuntime=fn('characterRuntime')(storeNk,{accountId:account,serverId:'s001',generation:2});
  assert.equal(JSON.parse(fn('claimServerWeekly')(ctx,{},resetRuntime,rewardBody)).reason,'REWARD_NOT_FOUND');
  console.log('PASS PostgreSQL server registry: repeatable DDL, auth, config pin, create replay/conflict, revision CAS and atomic audit');
  console.log('PASS server weekly PostgreSQL/RPC: independent rank, scoped finalization, atomic reward/claim replay and reset-generation isolation');
}finally{
  // Only the exact freshly generated test schema is removed; no game schema/database is targeted.
  execute(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}

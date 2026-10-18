// Native disposable PostgreSQL + real compiled RPCs + atomic storage adapter.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{spawnSync,spawn}=require('child_process');
const root=path.join(__dirname,'..'),pg=process.env.SEED_TEST_PSQL,port=process.env.SEED_TEST_PORT;
if(!pg||!port)throw Error('Set SEED_TEST_PSQL and SEED_TEST_PORT for a disposable database');
const schema='weekly_test_'+Date.now(),clone=x=>JSON.parse(JSON.stringify(x));
function sql(query){const r=spawnSync(pg,['-X','-q','-A','-t','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:query,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,PGOPTIONS:'-c search_path='+schema+',public'}});if(r.status!==0)throw Error(r.stderr||String(r.error));return r.stdout.trim();}
const literal=x=>x===null?'NULL':"'"+(Array.isArray(x)?'{'+x.map(v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+'}':String(x)).replace(/'/g,"''")+"'";
const bind=(query,args)=>query.replace(/\$(\d+)/g,(_,n)=>literal(args[+n-1]));
const cfg=JSON.parse(fs.readFileSync(path.join(root,'data/leaderboard_rewards.json'),'utf8'));
const context=vm.createContext({});
for(const f of ['config_rpc','monetization_rpc','weekly_leaderboard'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',f+'.js'),'utf8'),context);
const fn=name=>vm.runInContext(name,context),store=new Map();let release=clone(cfg),version=1,conflict=false,storageWrites=0;
const storageKey=r=>r.userId+'/'+r.collection+'/'+r.key;
const nk={
 sqlExec(query,args=[]){return sql(bind(query,args));},
 sqlQuery(query,args=[]){if(query.includes('FROM remote_config_releases'))return[{config_version:version,snapshot:{system:{leaderboard_rewards:release}}}];return JSON.parse(sql(`SELECT COALESCE(json_agg(t),'[]'::JSON) FROM (${bind(query,args)}) t`));},
 storageRead(reads){return reads.flatMap(r=>store.has(storageKey(r))?[clone(store.get(storageKey(r)))]:[]);},
 storageWrite(writes){if(conflict)throw Error('CAS');for(const w of writes){const old=store.get(storageKey(w));if(w.version==='*'?!!old:!old||old.version!==w.version)throw Error('CAS');}storageWrites++;for(const w of writes)store.set(storageKey(w),{...clone(w),version:String(storageWrites+1)});return writes;}
};
const user=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
const ctx=n=>({userId:user(n),env:{}}),logger={};
const call=(name,n,body)=>JSON.parse(fn(name)(ctx(n),logger,nk,JSON.stringify(body)));
function seedStorage(n){for(const [collection,key,value] of [['player_profiles','main',{resources:{gems:0,gold:0}}],['player_inventory','items',{items:[]}]])store.set(storageKey({userId:user(n),collection,key}),{userId:user(n),collection,key,value,version:'1'});}
async function concurrent(queries){return await Promise.all(queries.map(query=>new Promise((resolve,reject)=>{const child=spawn(pg,['-X','-q','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{env:{...process.env,PGOPTIONS:'-c search_path='+schema+',public'}});let err='';child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve());child.stdin.end(query);})));}
(async()=>{try{
 sql(`CREATE SCHEMA ${schema};CREATE TABLE users(id UUID PRIMARY KEY,disable_time TIMESTAMPTZ,display_name TEXT NOT NULL DEFAULT 'Account name');CREATE TABLE account_link_state(user_id UUID,status TEXT);CREATE TABLE game_items(id TEXT PRIMARY KEY,stackable BOOL,max_stack INT);`);
 const items=JSON.parse(fs.readFileSync(path.join(root,'data/items.json'),'utf8'));
 sql('INSERT INTO game_items VALUES '+items.map(i=>`(${literal(i.id)},TRUE,999)`).join(','));
 fn('createWeeklyLeaderboardTables')(nk);fn('createWeeklyLeaderboardTables')(nk);
 assert(fn('validWeeklyLeaderboardConfig')(cfg));
 for(const mutate of [c=>c.claim_days=0,c=>c.boards.combat_power.tiers[10].from=10,c=>c.boards.combat_power.tiers[0].rewards[0].amount=-1,c=>c.boards.campaign_stage.tiers[0].rewards[2].pool=[],c=>c.boards.combat_power.enabled='yes']){const bad=clone(cfg);mutate(bad);assert(!fn('validWeeklyLeaderboardConfig')(bad));}
 assert(fn('weeklyConfigItemsExist')(nk,cfg));const badItem=clone(cfg);badItem.boards.combat_power.tiers[0].rewards[2].id='missing_item';assert(!fn('weeklyConfigItemsExist')(nk,badItem));
 const tick=fn('tickWeeklyLeaderboards')(nk),current=Number(tick.period_id),old=current-604800;
 assert.equal(new Date(current*1000).getUTCDay(),1);assert.equal(new Date(current*1000).getUTCHours(),0);
 sql(`INSERT INTO users(id,disable_time) SELECT ('10000000-0000-0000-0000-'||lpad(n::TEXT,12,'0'))::UUID,NULL FROM generate_series(1,504)n;`);
 // Record only authenticated active users; freeze period config and preserve tie timestamp.
 fn('recordWeeklyLeaderboardScores')(nk,user(1),'one',{cultivation_realm:10,campaign_stage:20,combat_power:100});
 const achieved=sql(`SELECT achieved_at FROM weekly_leaderboard_scores WHERE user_id=${literal(user(1))} AND board_id='combat_power'`);
 release.boards.combat_power.tiers[0].rewards[0].amount=9999;version=2;
 fn('recordWeeklyLeaderboardScores')(nk,user(1),'renamed',{cultivation_realm:10,campaign_stage:20,combat_power:100});
 assert.equal(sql(`SELECT achieved_at FROM weekly_leaderboard_scores WHERE user_id=${literal(user(1))} AND board_id='combat_power'`),achieved);
 assert.equal(JSON.parse(sql(`SELECT config FROM weekly_leaderboard_periods WHERE period_id=${current}`)).boards.combat_power.tiers[0].rewards[0].amount,300);
 const status=call('getWeeklyLeaderboardRewards',1,{board_id:'combat_power'});assert.equal(status.my_record.rank,1);assert.equal(status.tiers[0].rewards[0].amount,300);assert.equal(call('getWeeklyLeaderboardRewards',2,{board_id:'combat_power'}).my_record,null);
 assert.equal(status.my_record.display_name,'renamed','Use weekly snapshot name despite users.display_name column');
 const failingNk={...nk,sqlQuery(){throw Error('simulated database outage');}};
 assert.equal(JSON.parse(fn('getWeeklyLeaderboardRewards')(ctx(1),logger,failingNk,JSON.stringify({board_id:'combat_power'}))).code,503,'Return application error without throwing HTTP 500');
 assert.equal(JSON.parse(fn('claimWeeklyLeaderboardReward')(ctx(1),logger,failingNk,JSON.stringify({board_id:'combat_power',period_id:old}))).code,503);
 assert.equal(call('getWeeklyLeaderboardRewards',1,{board_id:'invalid'}).success,false);
 // Seed previous-period source scores, then finalize using the actual DB functions.
 sql(`INSERT INTO weekly_leaderboard_periods VALUES(${old},to_timestamp(${old}),to_timestamp(${current}),1,${literal(JSON.stringify(cfg))}::JSONB,'open',NULL);
 INSERT INTO weekly_leaderboard_scores SELECT ${old},board,id,10000-n,to_timestamp(${old}+n),n::TEXT FROM users CROSS JOIN LATERAL (SELECT right(id::TEXT,12)::INT AS n) x CROSS JOIN unnest(ARRAY['cultivation_realm','campaign_stage','combat_power'])board;
 UPDATE users SET disable_time=NOW() WHERE id=${literal(user(503))};INSERT INTO account_link_state VALUES(${literal(user(502))},'archived');
 UPDATE weekly_leaderboard_scores SET score=20000 WHERE user_id IN(${literal(user(502))},${literal(user(503))});`);
 await concurrent([`SELECT weekly_leaderboard_tick(${literal(JSON.stringify(cfg))}::JSONB,2)`,`SELECT weekly_leaderboard_tick(${literal(JSON.stringify(cfg))}::JSONB,2)`]);
 assert.equal(+sql(`SELECT count(*) FROM weekly_leaderboard_awards WHERE period_id=${old}`),1500);
 assert.equal(sql(`SELECT status FROM weekly_leaderboard_periods WHERE period_id=${old}`),'finalized');
 assert.equal(+sql(`SELECT count(*) FROM weekly_leaderboard_awards WHERE user_id IN(${literal(user(501))},${literal(user(502))},${literal(user(503))})`),0);
 // All 13 boundaries and all category-specific quantities are the approved table.
 for(const rank of [1,2,3,4,5,6,7,8,9,10,11,50,51,200,201,500])for(const board of Object.keys(cfg.boards)){
  const award=JSON.parse(sql(`SELECT rewards FROM weekly_leaderboard_awards WHERE period_id=${old} AND board_id=${literal(board)} AND rank=${rank}`));
  const tier=cfg.boards[board].tiers.find(t=>rank>=t.from&&rank<=t.to);
  assert.equal(award[0].amount,tier.rewards[0].amount);assert.equal(award[1].amount,tier.rewards[1].amount);
  if(tier.rewards[2]){assert.equal(award[2].amount,tier.rewards[2].amount);if(board==='campaign_stage'){assert.equal(award[2].type,'item');assert(tier.rewards[2].pool.includes(award[2].id));}}
 }
 const randomBefore=sql(`SELECT rewards FROM weekly_leaderboard_awards WHERE period_id=${old} AND board_id='campaign_stage' AND rank=1`);
 fn('tickWeeklyLeaderboards')(nk);assert.equal(sql(`SELECT rewards FROM weekly_leaderboard_awards WHERE period_id=${old} AND board_id='campaign_stage' AND rank=1`),randomBefore);
 seedStorage(1);
 conflict=true;assert.equal(call('claimWeeklyLeaderboardReward',1,{period_id:old,board_id:'combat_power'}).code,409);assert.equal(storageWrites,0);
 conflict=false;
 for(const board of Object.keys(cfg.boards))assert.equal(call('claimWeeklyLeaderboardReward',1,{period_id:old,board_id:board,rewards:[{type:'resource',id:'gems',amount:999999}],rank:1}).success,true);
 const replay=call('claimWeeklyLeaderboardReward',1,{period_id:old,board_id:'combat_power'});assert(replay.already_claimed);assert.equal(replay.profile.resources.gems,900);assert.equal(replay.profile.resources.gold,300000);assert.equal(storageWrites,3);
 assert.equal(replay.inventory.find(i=>i.item_id==='talisman_enhance_charm').quantity,3);assert.equal(replay.inventory.find(i=>i.item_id==='element_enlightenment_charm').quantity,3);assert.equal(replay.inventory.filter(i=>i.item_id.startsWith('talisman_fragment_')).reduce((n,i)=>n+i.quantity,0),15);
 assert.equal(call('getWeeklyLeaderboardRewards',1,{board_id:'combat_power'}).awards[0].claimed,true);
 const encodedNk={...nk,sqlQuery(query,args){return nk.sqlQuery(query,args).map(row=>{for(const field of ['snapshot','config','rewards'])if(row[field]!==undefined)row[field]=Buffer.from(JSON.stringify(row[field]),'utf8');return row;});}};
 assert.equal(JSON.parse(fn('getWeeklyLeaderboardRewards')(ctx(1),logger,encodedNk,JSON.stringify({board_id:'campaign_stage'}))).awards[0].rewards[2].amount,15,'Nakama JSONB bytes decode');
 seedStorage(3);assert.equal(JSON.parse(fn('claimWeeklyLeaderboardReward')(ctx(3),logger,encodedNk,JSON.stringify({board_id:'campaign_stage',period_id:old}))).success,true);
 assert.equal(call('claimWeeklyLeaderboardReward',2,{period_id:current,board_id:'combat_power'}).code,404);
 seedStorage(2);sql(`UPDATE weekly_leaderboard_awards SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE user_id=${literal(user(2))}`);
 assert.equal(call('claimWeeklyLeaderboardReward',2,{period_id:old,board_id:'combat_power'}).code,410);
 // Equal scores use achieved time, then stable account ID; a disabled category
 // creates no awards. This also recovers a missed older period out of order.
 const older=old-604800,tieConfig=clone(cfg);tieConfig.boards.combat_power.enabled=false;
 sql(`INSERT INTO weekly_leaderboard_periods VALUES(${older},to_timestamp(${older}),to_timestamp(${old}),1,${literal(JSON.stringify(tieConfig))}::JSONB,'open',NULL);
 INSERT INTO weekly_leaderboard_scores SELECT ${older},board,id,100,to_timestamp(${older}+CASE WHEN id=${literal(user(3))} THEN 1 ELSE 2 END),'tie' FROM users CROSS JOIN unnest(ARRAY['cultivation_realm','campaign_stage','combat_power'])board WHERE id IN(${literal(user(1))},${literal(user(2))},${literal(user(3))});`);
 fn('tickWeeklyLeaderboards')(nk);
 assert.equal(+sql(`SELECT count(*) FROM weekly_leaderboard_awards WHERE period_id=${older}`),6);
 assert.equal(sql(`SELECT string_agg(user_id::TEXT,',' ORDER BY rank) FROM weekly_leaderboard_awards WHERE period_id=${older} AND board_id='cultivation_realm'`),[user(3),user(1),user(2)].join(','));
 // A missing config blocks new writes; immutable awards remain claimable.
 release=null;assert.equal(fn('tickWeeklyLeaderboards')(nk).period_id,null);
 assert.equal(call('claimWeeklyLeaderboardReward',1,{period_id:old,board_id:'combat_power'}).already_claimed,true);
 release=clone(cfg);
 release.enabled=false;assert.equal(fn('weeklyLeaderboardTickRpc')({userId:user(1),env:{}},logger,nk,'{}').includes('Forbidden'),true);
 assert.equal(fn('tickWeeklyLeaderboards')(nk).period_id,current,'Disable applies next period, preserving frozen current rules');
 assert.equal(JSON.parse(fn('weeklyLeaderboardTickRpc')({env:{}},logger,nk,'{}')).success,true);
 // Cutoff moves writes to new week and closes an empty period safely.
 sql(`UPDATE weekly_leaderboard_periods SET closes_at=clock_timestamp()-INTERVAL '1 second' WHERE period_id=${current}`);
 fn('tickWeeklyLeaderboards')(nk);assert.equal(sql(`SELECT status FROM weekly_leaderboard_periods WHERE period_id=${current}`),'finalized');
 console.log('PASS weekly PostgreSQL/RPC: 13 tiers, 1500 awards, concurrent close, config freeze, activity, exclusions, ties, persisted random loot, atomic CAS/replay, triple top1 totals, expiry, permissions and cutoff');
}finally{sql(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);}})().catch(e=>{console.error(e);process.exitCode=1;});

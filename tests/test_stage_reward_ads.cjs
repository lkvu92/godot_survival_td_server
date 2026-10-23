const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
let now=1800000000000,noAds=true,conflict=false,sequence=0;
class ServerDate extends Date {static now(){return now;}}
const context=vm.createContext({Date:ServerDate});
for(const file of ['feature_unlocks','config_rpc','progression_rpc','monetization_rpc','sweep_rpc'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',file+'.js'),'utf8'),context);
const fn=name=>vm.runInContext(name,context);
let config=JSON.parse(fs.readFileSync(path.join(root,'data/rewarded_ads.json'),'utf8'));
const db={},sessions=new Map(),claims=new Map();
const date=()=>new Date(now).toISOString().slice(0,10);
const row=(collection,value)=>db[collection]={collection,key:collection==='player_stage_runs'?'active':collection==='player_heroes'?'states':collection==='player_inventory'?'items':'main',value:clone(value),version:String(Number(db[collection]?.version||0)+1)};
row('player_profiles',{level:10,exp:0,resources:{gold:0,gems:0},completed_stage_levels:[]});
row('player_heroes',{heroes:[{hero_id:'hero',owned:true,level:10,exp:0}]});
row('player_inventory',{items:[]});
const nk={
 uuidv4:()=>`ad-${++sequence}`,
 storageRead(reads){return reads.filter(r=>db[r.collection]).map(r=>clone(db[r.collection]));},
 storageWrite(writes){if(conflict)throw Error('CAS conflict');for(const w of writes)assert.equal(w.version,db[w.collection].version);for(const w of writes)row(w.collection,w.value);},
 sqlQuery(sql,args=[]){
  if(sql.includes('FROM remote_config_releases'))return[{config_version:1,snapshot:{system:{rewarded_ads:config,ads_enabled:true,stage_sweep:clone(fn('SWEEP_DEFAULTS'))}}}];
  if(sql.includes('FROM player_monetization_entitlements'))return[{server_time:now/1000,no_ads_expires_at:noAds?now/1000+86400:0}];
  if(sql.includes('SELECT exp_weight'))return[{exp_weight:1,is_boss:false,arc_id:'arc_1'}];
  if(sql.includes('SELECT exp_multiplier'))return[{exp_multiplier:1,gold_reward:50,loot_table:[{item_id:'stone_fixture',weight:1,min_qty:2,max_qty:2}],boss_loot_table:[]}];
  if(sql.includes('SELECT stackable'))return[{stackable:true,max_stack:9999}];
  if(sql.includes('client_request_id=$2'))return[...sessions.values()].filter(s=>s.user_id===args[0]&&s.client_request_id===args[1]).map(clone);
  if(sql.includes("status = 'verified', admob_transaction_id")){const s=sessions.get(args[0]);if(!s||s.user_id!==args[1]||s.status!=='prepared')return[];s.status='verified';return[clone(s)];}
  if(sql.includes('SELECT context FROM monetization_ad_rewards')){const s=sessions.get(args[0]);return s&&s.user_id===args[1]?[{context:clone(s.context)}]:[];}
  if(sql.includes('SELECT status, placement_id, reward_type, reward_amount')){const s=sessions.get(args[0]);return s&&s.user_id===args[1]?[clone(s)]:[];}
  if(sql.includes('SELECT status, reward_type, reward_amount')){const s=sessions.get(args[0]);return s&&s.user_id===args[1]?[clone(s)]:[];}
  if(sql.includes('SELECT delivery_source'))return sessions.has(args[0])?[clone(sessions.get(args[0]))]:[];
  if(sql.includes('SELECT claim_slot'))return claims.has(args[0])?[clone(claims.get(args[0]))]:[];
  if(sql.includes('INSERT INTO monetization_daily_reward_claims')){
   if(claims.has(args[2]))return[];
   for(let slot=1;slot<=args[3];slot++)if(![...claims.values()].some(c=>c.reward_date===date()&&c.placement_id===args[1]&&c.claim_slot===slot)){
    const c={claim_slot:slot,reward_date:date(),placement_id:args[1],ad_session_id:args[2]};claims.set(args[2],c);return[clone(c)];
   }return[];
  }
  if(sql.includes('SELECT placement_id, ad_session_id FROM monetization_daily_reward_claims'))return[...claims.values()].filter(c=>c.reward_date===date()).map(clone);
  if(sql.includes('SELECT ad_session_id FROM monetization_ad_rewards'))return[...sessions.values()].filter(s=>s.status==='verified').map(clone);
  if(sql.includes('FROM monetization_daily_fragment_rewards'))return[];
  throw Error('Unexpected SQL '+sql);
 },
 sqlExec(sql,args=[]){
  if(sql.includes('DELETE FROM monetization_daily_reward_claims')){claims.delete(args[0]);return;}
  if(sql.includes('INSERT INTO monetization_ad_rewards')){sessions.set(args[0],{ad_session_id:args[0],user_id:args[1],placement_id:args[2],reward_type:args[3],reward_amount:args[4],custom_data:args[5],context:JSON.parse(args[6]),delivery_source:args[7],client_request_id:args[8],status:'prepared'});return;}
  if(sql.includes('UPDATE monetization_ad_rewards')){const s=sessions.get(args[0]);if(sql.includes("status='granted'")||sql.includes("status = 'granted'"))s.status='granted';if(sql.includes("status='rejected'"))s.status='rejected';if(sql.includes("delivery_source='no_ads'"))s.delivery_source='no_ads';return;}
  throw Error('Unexpected SQL update '+sql);
 }
};
context.parseJsonb=x=>typeof x==='string'?JSON.parse(x):x;
context.progressionMigrate=()=>{};context.cultivationEnsureProfile=()=>{};context.cultivationEnsurePreview=()=>{};
context.progressionReconcileLevelUnlocks=()=>{};context.progressionCompleteStage=()=>{};context.progressionMaxStageBaseExp=()=>1000;
context.eventRecord=()=>{};
context.serverGrantInventoryItem=(_nk,items,id,qty)=>{fn('addStoreInventoryItem')(nk,items,id,qty);return true;};
context.buildMonetizationResponse=()=>({daily_rewards:fn('buildDailyRewardStatus')(nk,'u')});
const ctx={userId:'u',env:{APP_ENVIRONMENT:'mock'}},logger={warn(){},error(){}};
const rpc=(name,body)=>JSON.parse(fn(name)(ctx,logger,nk,JSON.stringify(body)));
function settle(id,won=true){row('player_stage_runs',{run_id:id,status:'active',stage_id:'stage_1_1',difficulty_id:'normal',expires_at_ms:now+86400000});const r=rpc('awardStageProgression',{run_id:id,stage_id:'stage_1_1',difficulty_id:'normal',hero_id:'hero',base_exp:100,won,objective_hp_ratio:1});assert(r.success);return r;}
const prepare=(run,request)=>rpc('prepareRewardedAd',{placement_id:'stage_reward_x2_ad',request_id:request,context:{run_id:run,loot:[{item_id:'forged',quantity:9999}]}});
let result=settle('victory');assert(result.stage_reward.eligible);
const before=clone(db);
result=prepare('victory','first');assert.equal(result.status,'success');assert(result.data.stage_reward.claimed);
assert.equal(db.player_profiles.value.exp,before.player_profiles.value.exp+200);
assert.equal(db.player_heroes.value.heroes[0].exp,before.player_heroes.value.heroes[0].exp+200);
assert.equal(db.player_profiles.value.resources.gold,before.player_profiles.value.resources.gold+50);
assert.equal(db.player_inventory.value.items[0].quantity,4);
assert(!db.player_inventory.value.items.some(i=>i.item_id==='forged'));
const after=clone(db);assert.equal(prepare('victory','first').status,'success');assert.deepEqual(db,after);
assert.equal(prepare('victory','another-session').code,409);
assert.equal(claims.size,1,'Duplicate run/session cannot spend another quota slot');
settle('cas');conflict=true;assert.throws(()=>prepare('cas','cas-session'),/CAS/);conflict=false;
const beforeRetry=clone(db);result=prepare('cas','cas-session');assert.equal(result.status,'success');
assert.equal(db.player_profiles.value.exp,beforeRetry.player_profiles.value.exp+200);
// Simulate storage committed but SQL grant marker lost: recovery cannot pay twice.
const recoveredId=result.data.ad_session_id;sessions.get(recoveredId).status='verified';const committed=clone(db);
assert.equal(prepare('cas','cas-session').status,'success');assert.deepEqual(db,committed);
for(let i=0;i<3;i++){settle('quota-'+i);assert.equal(prepare('quota-'+i,'quota-'+i).status,'success');}
settle('sixth');assert.equal(prepare('sixth','sixth').code,409);
now+=86400000;assert.equal(prepare('sixth','next-day').status,'success','UTC-day rollover resets five-per-day quota');
settle('loss',false);assert.equal(prepare('loss','loss').code,409);
row('player_stage_runs',{run_id:'active',status:'active',won:true,stage_reward:{eligible:true}});assert.equal(prepare('active','active').code,409);
settle('training');db.player_stage_runs.value.stage_reward.eligible=false;assert.equal(prepare('training','training').code,409);
// Preparation alone (cancelled/unverified ad) cannot issue rewards or spend quota.
settle('cancel');noAds=false;const cancelledBefore=clone(db),claimCount=claims.size;
result=prepare('cancel','cancel');assert.equal(result.status,'success');assert(!result.data.skip_ad);assert.deepEqual(db,cancelledBefore);assert.equal(claims.size,claimCount);
// New system config amounts/limits are read dynamically, not the legacy table.
config.placements.stage_reward_x2_ad.daily_limit=0;assert.equal(prepare('cancel','disabled').code,403);
config.placements.stage_reward_x2_ad.daily_limit=5;
settle('production');ctx.env.APP_ENVIRONMENT='production';
result=prepare('production','production');assert.equal(result.status,'success');
const productionId=result.data.ad_session_id;
const unverified=clone(db);result=rpc('confirmRewardedAd',{ad_session_id:productionId});assert.equal(result.data.status,'prepared');assert.deepEqual(db,unverified,'Client confirmation alone cannot grant production rewards');
assert(fn('grantPreparedReward')(nk,'u',productionId,'verified-ssv-transaction').granted);
const verified=clone(db);result=rpc('confirmRewardedAd',{ad_session_id:productionId});
assert(result.data.stage_reward.claimed && result.data.stage_reward.total_exp===400,'Production polling must include the canonical doubled summary');assert.deepEqual(db,verified);
settle('race');
const raceA=prepare('race','race-a').data.ad_session_id,raceB=prepare('race','race-b').data.ad_session_id;
const quotaBeforeRace=claims.size;
conflict=true;assert.throws(()=>fn('grantPreparedReward')(nk,'u',raceA,'ssv-race-a'),/CAS/);conflict=false;
assert(fn('grantPreparedReward')(nk,'u',raceB,'ssv-race-b').granted);
const raceCommitted=clone(db);
assert(!fn('grantPreparedReward')(nk,'u',raceA,'ssv-race-a').granted);assert.deepEqual(db,raceCommitted);
assert.equal(claims.size,quotaBeforeRace+1,'A losing CAS session must release its ungranted quota reservation');
ctx.env.APP_ENVIRONMENT='mock';
config.placements.stamina_dialog_ad.amount=9;config.placements.stamina_dialog_ad.daily_limit=2;
config.placements.card_reroll_ad.run_limit=7;
assert.equal(fn('rewardedAdsConfig')(nk).placements.stamina_dialog_ad.amount,9);assert.equal(fn('rewardedRunLimit')(nk,'card_reroll_ad'),7);
noAds=true;row('player_profiles',{level:10,stamina:0,resources:{}});
for(let i=0;i<2;i++)assert.equal(rpc('prepareRewardedAd',{placement_id:'stamina_dialog_ad',request_id:'stamina-'+i}).status,'success');
assert.equal(db.player_profiles.value.stamina,18);assert.equal(rpc('prepareRewardedAd',{placement_id:'stamina_dialog_ad',request_id:'stamina-over'}).code,409);
config.placements.talisman_enhance_charm_ad.amount=3;config.placements.talisman_enhance_charm_ad.daily_limit=2;
const beforeCharms=db.player_inventory.value.items.find(i=>i.item_id==='talisman_enhance_charm')?.quantity||0;
for(let i=0;i<2;i++)assert.equal(rpc('prepareRewardedAd',{placement_id:'talisman_enhance_charm_ad',request_id:'charm-'+i}).status,'success');
assert.equal(db.player_inventory.value.items.find(i=>i.item_id==='talisman_enhance_charm').quantity,beforeCharms+6);
assert.equal(rpc('prepareRewardedAd',{placement_id:'talisman_enhance_charm_ad',request_id:'charm-over'}).code,409);
config.placements.stamina_dialog_ad.amount=-1;assert.deepEqual(clone(fn('rewardedAdsConfig')(nk)),{});
vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build/config_tables.js'),'utf8'),context);
let initialSystem;
fn('createGameConfigTables')({sqlExec(sql,args=[]){if(sql.includes('INSERT INTO remote_config_settings')&&args[0]==='system'&&args[1]==='rewarded_ads')initialSystem=JSON.parse(args[3]);}},{info(){}});
assert.deepEqual(initialSystem,JSON.parse(fs.readFileSync(path.join(root,'data/rewarded_ads.json'),'utf8')),'Initial System setting must match canonical seed defaults');
const patch=require('../nakama/build_rewarded_system_patch.cjs').sql;
assert(patch.includes("'system','rewarded_ads','json'")&&!/UPDATE player_|DELETE FROM monetization/i.test(patch));
console.log('PASS C134: real settlement/prepare/grant, EXP+Gold+identical loot x2, forged data ignored, replay/CAS/crash recovery, five/day/reset, loss/training/cancel blocked and dynamic System amounts/limits');

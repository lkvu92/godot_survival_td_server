const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..'),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build/weekly_leaderboard.js'),'utf8'),context);
const valid=vm.runInContext('validWeeklyLeaderboardConfig',context),{config,settings}=require('../nakama/build_weekly_leaderboard_settings.cjs');
assert(valid(config));assert.equal(settings[0].module,'system');assert.equal(settings[0].key,'leaderboard_rewards');assert.deepEqual(JSON.parse(settings[0].value),config);
const bootstrap=fs.readFileSync(path.join(root,'nakama/data/modules/config_tables.ts'),'utf8');
assert(bootstrap.includes('leaderboard_rewards: '+JSON.stringify(config)+','),'Bootstrap and reviewed seed defaults must match');
const gems=[300,250,220,200,180,160,140,120,110,100,80,50,30],gold=[100000,90000,80000,75000,70000,65000,60000,55000,50000,45000,35000,25000,15000],charms=[3,3,2,2,2,2,1,1,1,1,1,1,0],fragments=[15,12,10,9,8,7,6,5,4,3,3,2,1];
for(const [board,entry] of Object.entries(config.boards))entry.tiers.forEach((t,i)=>{assert.equal(t.rewards[0].amount,gems[i]);assert.equal(t.rewards[1].amount,gold[i]);assert.equal(t.rewards[2]?.amount||0,board==='campaign_stage'?fragments[i]:charms[i]);});
for(const change of [c=>c.schema_version=2,c=>c.boards.combat_power.tiers[12].from=200,c=>c.boards.cultivation_realm.tiers[0].rewards[0].id='exp',c=>c.boards.campaign_stage.tiers[0].rewards[2].pool=[],c=>c.boards.combat_power.enabled=1]){const bad=JSON.parse(JSON.stringify(config));change(bad);assert(!valid(bad));}
// Publishing checks semantic validity and real catalog IDs, not only JSON syntax.
for(const name of ['config_rpc','monetization_rpc','sweep_rpc'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',name+'.js'),'utf8'),context);
let published=0,missing=false;
const draft={min_app_version:'1.0.0',latest_app_version:'1.0.0',ads_enabled:false,payment_enabled:false,rewarded_ads:JSON.parse(fs.readFileSync(path.join(root,'data/rewarded_ads.json'),'utf8')),leaderboard_rewards:JSON.parse(JSON.stringify(config))};
draft.tower_sweep=JSON.parse(vm.runInContext('JSON.stringify(TOWER_SWEEP_DEFAULTS)',context));
draft.stage_sweep=JSON.parse(vm.runInContext('JSON.stringify(SWEEP_DEFAULTS)',context));
const nk={sqlQuery(query,args){if(query.includes('SELECT module, key'))return Object.entries(draft).map(([key,value])=>({module:'system',key,value_type:typeof value==='boolean'?'bool':typeof value==='string'?'string':'json',value:typeof value==='string'?value:JSON.stringify(value)}));if(query.includes('FROM game_items'))return missing?[]:JSON.parse(args[0]).map(id=>({id}));if(query.includes('FROM remote_config_releases'))return[{config_version:1,snapshot:{system:draft}}];throw Error(query);},sqlExec(){published++;}};
const publish=vm.runInContext('publishConfigRelease',context),admin={userId:'admin',env:{CONFIG_ADMIN_USER_ID:'admin'}};
assert.equal(JSON.parse(publish(admin,{},nk,'{}')).status,'ok');assert.equal(published,1);
missing=true;assert.equal(JSON.parse(publish(admin,{},nk,'{}')).code,422);assert.equal(published,1);
missing=false;draft.leaderboard_rewards.boards.combat_power.tiers[12].from=200;
assert.equal(JSON.parse(publish(admin,{},nk,'{}')).code,422);assert.equal(published,1);
console.log('PASS weekly config: approved 3 x 13 reward tiers, defaults/draft equality and invalid ranges/currencies/types rejected');

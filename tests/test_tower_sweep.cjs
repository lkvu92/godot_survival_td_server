const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const clone=x=>JSON.parse(JSON.stringify(x));let now=1800000000000,db,revision=0,conflict=false;
const c=vm.createContext({Date:class extends Date{static now(){return now;}}});
for(const f of ['progression_rpc','resource_rpc','sweep_rpc'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',f+'.js'),'utf8'),c);
const fn=n=>vm.runInContext(n,c),config=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/trial_tower.json'),'utf8'));
c.parseJsonObject=v=>v||{};c.parseJsonb=v=>v||{};c.readContentConfig=()=>clone(config);
c.getRemoteConfigValue=(_nk,_section,key,fallback)=>key==='tower_sweep'?clone(fn('TOWER_SWEEP_DEFAULTS')):key==='stage_sweep'?clone(fn('SWEEP_DEFAULTS')):fallback;
vm.runInContext(`trialTowerStatus=()=>JSON.stringify({success:true});progressionMigrate=()=>{};progressionReconcileLevelUnlocks=()=>{};progressionHeroAttributes=()=>({});progressionNextHeroExp=()=>99999999;progressionNextUserExp=()=>40000000;progressionApplyUser=(_nk,p,exp)=>{p.exp=(p.exp||0)+exp;};`,c);
c.serverGrantInventoryItem=(_nk,items,id,quantity)=>{const item=items.find(r=>r.item_id===id);if(item)item.quantity+=quantity;else items.push({item_id:id,quantity});return true;};
const key=r=>r.collection+':'+r.key;
function row(collection,k,value){db[collection+':'+k]={collection,key:k,userId:'u',value:clone(value),version:String(++revision)};}
const nk={uuidv4:()=>String(++revision),notificationSend(){},storageRead:refs=>refs.flatMap(r=>db[key(r)]?[clone(db[key(r)])]:[]),storageWrite(writes){if(conflict)throw Error('CAS');for(const w of writes){const old=db[key(w)];assert(w.version==='*'?!old:old&&old.version===w.version,'CAS');}for(const w of writes)row(w.collection,w.key,w.value);return writes.map(w=>db[key(w)]);}};
const rpc=(name,payload={})=>JSON.parse(fn(name)({userId:'u'},{warn(){}},nk,JSON.stringify(payload)));
const profile=()=>db['player_profiles:main'].value,tower=()=>db['player_trial_tower:main'].value,items=()=>db['player_inventory:items'].value.items;
const qty=id=>items().filter(r=>r.item_id===id).reduce((n,r)=>n+r.quantity,0);
function reset(){db={};conflict=false;row('player_profiles','main',{level:30,exp:0,stamina:20,last_stamina_update:now/1000,resources:{gems:100,gold:0}});row('player_inventory','items',{items:[{item_id:'tower_sweep_ticket',quantity:10},{item_id:'campaign_sweep_ticket',quantity:10}]});row('player_heroes','states',{heroes:[{hero_id:'hero',owned:true,level:30,exp:0}]});row('player_trial_tower','main',{highest_cleared:3,tickets:5});}
const selection={sweep_type:'tower',floor:1,hero_id:'hero'};
const start=(id='tower-request',rounds=2)=>rpc('startSweep',{...selection,rounds,request_id:id});
reset();let preview=rpc('previewSweep',selection).preview;assert.equal(preview.max_rounds,5);assert.equal(preview.round_duration_ms,90000);assert.equal(preview.exp,60000);assert.equal(preview.exp%5000,0);
assert(!rpc('previewSweep',{...selection,floor:4}).success);assert(!rpc('previewSweep',{...selection,hero_id:'unowned'}).success);
assert(start().success);assert.equal(profile().sweep.reserved_stamina,4);assert.equal(qty('tower_sweep_ticket'),10);assert.equal(tower().tickets,5);
assert(start().duplicate);assert(!rpc('startSweep',{stage_id:'stage_1_1',level_id:'normal',hero_id:'hero',rounds:1,request_id:'campaign-request'}).success);
now+=90000;assert(rpc('getSweepStatus').success);assert.equal(profile().sweep.completed_rounds,1);assert.equal(qty('tower_sweep_ticket'),9);assert.equal(qty('campaign_sweep_ticket'),10);assert.equal(tower().tickets,4);assert.equal(profile().stamina,18);assert.equal(profile().exp,60000);
const snapshot=clone(db);conflict=true;assert(!rpc('cancelSweep',{session_id:profile().sweep.session_id}).success);assert.deepEqual(db,snapshot);conflict=false;
assert(rpc('cancelSweep',{session_id:profile().sweep.session_id}).success);assert.equal(profile().sweep.status,'cancelled');assert.equal(qty('tower_sweep_ticket'),9);assert.equal(tower().tickets,4);assert.equal(profile().sweep.reserved_stamina,0);
reset();assert(start('tower-finish',2).success);assert(rpc('finishSweep',{session_id:profile().sweep.session_id,max_cost_gems:10}).success);assert.equal(qty('tower_sweep_ticket'),8);assert.equal(tower().tickets,3);assert.equal(profile().stamina,16);assert.equal(profile().resources.gems,90);assert.equal(profile().sweep.receipts.length,2);assert(rpc('finishSweep',{session_id:profile().sweep.session_id,max_cost_gems:10}).duplicate);assert.equal(qty('tower_sweep_ticket'),8);
reset();profile().sweep={status:'running',sweep_type:'campaign'};assert(!start().success);reset();tower().tickets=0;assert(!start().success);reset();profile().stamina=1;assert(!start().success);
c.cpObject=v=>v||{};c.cpArray=v=>Array.isArray(v)?v:[];
reset();tower().highest_cleared=0;
row('player_stage_runs','active',{run_id:'duel',stage_id:'stage_trial_tower',hero_id:'hero',floor:1,status:'active',phase:'countdown',combat_started_at_ms:now-10000,expires_at_ms:now+60000,min_win_duration_ms:3000});
const win={run_id:'duel',result:'win',player_hp:100,demon_hp:0};
const beforeWin=clone(db);conflict=true;assert(!rpc('finishTrialTower',win).success);assert.deepEqual(db,beforeWin);conflict=false;
const settled=rpc('finishTrialTower',win);assert(settled.success&&settled.rewards_granted);assert.equal(tower().highest_cleared,1);assert.equal(qty('exp_boost_card_10'),1);assert.equal(profile().exp,60000);assert.equal(profile().resources.gold,30000);
assert(rpc('finishTrialTower',win).duplicate);assert.equal(qty('exp_boost_card_10'),1);assert(!rpc('finishTrialTower',{...win,result:'loss'}).success);
nk.sqlQuery=()=>[];
for(const mode of ['normal','epic','legend']){const loot=fn('stageCompletionLoot')(nk,{id:'stage_1_10',arc_id:'arc_1',is_boss:true},{level_id:mode,gold_reward:0,loot_table:[],boss_loot_table:[]});assert.equal(loot.find(r=>r.item_id==='tower_sweep_ticket').drop_rate,{normal:.05,epic:.075,legend:.1}[mode]);}
console.log('PASS C167: cleared-floor eligibility, dynamic rounded EXP, 90s config, cross-type exclusion, reservations, per-round ticket/stamina/entry debit, cancellation, CAS and finish replay');

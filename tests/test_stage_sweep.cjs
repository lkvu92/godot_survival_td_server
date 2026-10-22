// C144 acceptance exercises compiled production functions with atomic versioned Storage.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const clone=x=>JSON.parse(JSON.stringify(x));let now=1800000000000,db,revision=0,crash='',race=null,sequence=0;
class Clock extends Date{static now(){return now;}}
const c=vm.createContext({Date:Clock});
for(const file of ['progression_rpc','resource_rpc','sweep_rpc'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',file+'.js'),'utf8'),c);
const fn=n=>vm.runInContext(n,c),config=clone(fn('SWEEP_DEFAULTS'));
c.parseJsonObject=v=>typeof v==='string'?JSON.parse(v):v||{};c.parseJsonb=c.parseJsonObject;
c.getRemoteConfigValue=(_nk,section,key,fallback)=>key==='stage_sweep'?clone(config):key==='tower_sweep'?clone(fn('TOWER_SWEEP_DEFAULTS')):fallback;
vm.runInContext(`progressionMigrate=()=>{};cultivationEnsureProfile=()=>{};cultivationEnsurePreview=()=>{};progressionReconcileLevelUnlocks=()=>{};progressionReconcileCampaignUnlocks=()=>{};progressionMaxStageBaseExp=()=>100;progressionHeroAttributes=()=>({});progressionNextHeroExp=()=>100000;progressionNextUserExp=()=>100000;progressionApplyUser=(_nk,p,exp)=>{p.exp=(p.exp||0)+exp;return {};};eventRecord=()=>{};`,c);
c.serverGrantInventoryItem=(_nk,items,id,quantity)=>{const item=items.find(r=>r.item_id===id);if(item)item.quantity+=quantity;else items.push({item_id:id,quantity});return true;};
const id=r=>r.collection+':'+r.key;
function row(collection,key,value){db[collection+':'+key]={collection,key,userId:'u',value:clone(value),version:String(++revision)};}
const nk={
 uuidv4:()=>`session-${++sequence}`,
 storageRead(reads){return reads.flatMap(r=>db[id(r)]?[clone(db[id(r)])]:[]);},
 storageWrite(writes){
  if(race){const hook=race;race=null;hook();}
  if(crash==='before'){crash='';throw Error('worker crash before commit');}
  // Validate all before mutating any; same transaction semantics as Nakama Storage.
  for(const w of writes){const old=db[id(w)];if(w.version==='*'?!!old:!old||old.version!==w.version)throw Error('CAS_CONFLICT');}
  for(const w of writes)row(w.collection,w.key,w.value);
  if(crash==='after'){crash='';throw Error('worker crash after commit');}
  return writes.map(w=>({collection:w.collection,key:w.key,userId:'u',version:db[id(w)].version}));
 },
 notificationSend(){throw Error('disconnected socket');},
 sqlQuery(sql,args){
  if(sql.includes('FROM game_stages'))return[{id:'stage_1_1',exp_weight:1,is_boss:false,arc_id:'arc_1'}];
  if(sql.includes('FROM game_stage_levels'))return[{stamina_cost:1,exp_multiplier:1,gold_reward:10,loot_table:[{item_id:'material',base_quantity:10,min_qty:1,max_qty:20,drop_rate:1}],boss_loot_table:[]}];
  if(sql.includes('SELECT stackable'))return[{stackable:true,max_stack:999999}];
  return[];
 }
};
c.talismanCreateStageRun=()=>({run:{run_id:'combat',status:'active',expires_at_ms:now+60000},version:db['player_stage_runs:active'].version});
const ctx={userId:'u',env:{}},logger={warn(){}};
const rpc=(name,body={})=>JSON.parse(fn(name)(ctx,logger,nk,JSON.stringify(body)));
const profile=()=>db['player_profiles:main'].value,items=()=>db['player_inventory:items'].value.items;
function reset(){db={};crash='';race=null;row('player_profiles','main',{level:10,exp:0,stamina:10,resources:{gold:0},stage_grades:{'stage_1_1:normal':'S'},unlocked_stages:[{stage_id:'stage_1_1',unlocked_levels:['normal','epic','legend']}]});row('player_inventory','items',{items:[{item_id:'campaign_sweep_ticket',quantity:10}]});row('player_heroes','states',{heroes:[{hero_id:'hero',owned:true,level:1,exp:0}]});row('player_stage_runs','active',{status:'settled'});}
const request=(rounds=2)=>({stage_id:'stage_1_1',level_id:'normal',hero_id:'hero',rounds,request_id:'request_'+(++sequence)});
const start=(rounds=2)=>{const result=rpc('startSweep',request(rounds));assert(result.success,JSON.stringify(result));return result.session;};
const process=()=>fn('sweepProcess')(nk,'u',logger,now,4);
for(const [hp,grade]of [[1,'S'],[.900001,'S'],[.9,'A'],[.800001,'A'],[.8,'B'],[.700001,'B'],[.7,'C'],[.600001,'C'],[.6,'D'],[0,'D']])assert.equal(fn('sweepGrade')(nk,hp),grade);
assert.equal(fn('sweepGrade')(nk,1,false),'');assert.throws(()=>fn('sweepGrade')(nk,1.01));assert.throws(()=>fn('sweepGrade')(nk,NaN));
reset();fn('sweepSetBest')(profile(),'stage_1_1','normal','A');assert.equal(profile().stage_grades['stage_1_1:normal'],'S');assert.equal(fn('sweepQuantity')(nk,{base_quantity:10},'A'),9);assert.equal(fn('sweepQuantity')(nk,{base_quantity:1},'D'),1);assert.equal(fn('sweepQuantity')(nk,{base_quantity:0},'D'),0);
vm.runInContext('progressionCompleteStage=()=>{};',c);
row('player_stage_runs','active',{run_id:'current_A',status:'active',stage_id:'stage_1_1',difficulty_id:'normal',expires_at_ms:now+60000});
const currentA=rpc('awardStageProgression',{stage_id:'stage_1_1',difficulty_id:'normal',run_id:'current_A',hero_id:'hero',won:true,base_exp:100,objective_hp_ratio:.9});
assert(currentA.success,JSON.stringify(currentA));assert.equal(profile().stage_grades['stage_1_1:normal'],'S');assert.equal(items().find(r=>r.item_id==='material').quantity,9,'actual ordinary settlement grants current A');assert.equal(profile().resources.gold,9);
reset();
for(const level_id of ['epic','legend'])assert.equal(rpc('previewSweep',{...request(),level_id}).code,'STAGE_S_REQUIRED');
assert.deepEqual(rpc('getSweepOptions').options.map(r=>r.level_id),['normal']);
// Only due rounds debit. Receipt, inventory, EXP, lock and resources commit together.
reset();const initial=start();assert.equal(profile().stamina,10);assert.equal(items()[0].quantity,10);assert.equal(rpc('getSweepOptions').available_tickets,8);assert.equal(rpc('getSweepOptions').available_stamina,8);
now+=89999;process();assert.equal(profile().sweep.completed_rounds,0);now++;
crash='before';assert.throws(process,/before commit/);assert.equal(profile().exp,0);assert.equal(profile().sweep.receipts.length,0);process();assert.equal(profile().exp,100);assert.equal(profile().stamina,9);assert.equal(profile().sweep.receipts.length,1);assert.equal(profile().resources.gold,10);assert.equal(items().find(r=>r.item_id==='material').quantity,10);
now+=90000;crash='after';assert.throws(process,/after commit/);const committed=clone(db);process();assert.deepEqual(db,committed,'retry after commit must not pay twice');assert.equal(profile().sweep.receipts.length,2);assert.equal(profile().sweep.status,'completed');assert.equal(profile().activity,undefined);
const recovered=rpc('getSweepStatus');assert(recovered.success);assert.equal(recovered.session.receipts.length,2);assert.equal(recovered.profile.exp,200);assert.equal(recovered.heroes[0].exp,200);assert.equal(recovered.inventory.items.find(r=>r.item_id==='campaign_sweep_ticket').quantity,8);
// The shared production wrapper protects inventory-only mutations and stamina.
reset();start(10);const guarded=fn('sweepResourceRuntime')(nk,'u');
let inventory=guarded.storageRead([{collection:'player_inventory',key:'items',userId:'u'}])[0];inventory.value.items[0].quantity=9;
assert.throws(()=>guarded.storageWrite([{...inventory,value:inventory.value}]),/TICKETS_RESERVED/);
let p=guarded.storageRead([{collection:'player_profiles',key:'main',userId:'u'}])[0];p.value.stamina=9;
assert.throws(()=>guarded.storageWrite([{...p,value:p.value}]),/STAMINA_RESERVED/);assert.equal(profile().stamina,10);assert.equal(items()[0].quantity,10);
profile().sweep.status='blocked';const blockedId=profile().sweep.session_id;assert.equal(rpc('startStage',{stage_id:'stage_1_1',level_id:'normal'}).code,'SWEEP_ACTIVE');
assert(rpc('cancelSweep',{session_id:blockedId}).success);assert.equal(profile().sweep.status,'cancelled');assert.equal(profile().activity,undefined);assert.equal(profile().stamina,10);
// Cancellation cutoff is server time, inclusive at exactly the completion deadline.
for(const [elapsed,rounds]of [[89999,0],[90000,1],[90001,1],[180000,2]]){reset();const session=start(3);now+=elapsed;const result=rpc('cancelSweep',{session_id:session.session_id});assert(result.success);assert.equal(result.session.completed_rounds,rounds);assert.equal(result.session.status,'cancelled');assert.equal(profile().stamina,10-rounds);assert.equal(profile().activity,undefined);const old=clone(db);rpc('cancelSweep',{session_id:session.session_id});assert.deepEqual(db,old);}
// Start idempotency and both interleavings of simultaneous combat / sweep starts.
reset();let req=request();assert(rpc('startSweep',req).success);const once=clone(db);assert(rpc('startSweep',req).success);assert.deepEqual(db,once);assert.equal(rpc('startStage',{stage_id:'stage_1_1',level_id:'normal'}).code,'SWEEP_ACTIVE');
for(const stage_id of ['stage_1_1','stage_boss_fixture','stage_ruins_fixture','stage_tower_fixture','stage_0_admin_test'])for(const level_id of ['normal','epic','legend'])assert.equal(rpc('startStage',{stage_id,level_id}).code,'SWEEP_ACTIVE',stage_id+':'+level_id);
assert.equal(rpc('tribulationAction',{action:'start',hp_ratio:1}).code,'SWEEP_ACTIVE');
reset();let combatResult;race=()=>{combatResult=rpc('startStage',{stage_id:'stage_1_1',level_id:'normal'});};assert.equal(rpc('startSweep',request()).success,false);assert(combatResult.success);assert.equal(profile().sweep,undefined);
reset();let sweepResult;race=()=>{sweepResult=rpc('startSweep',request());};assert.throws(()=>rpc('startStage',{stage_id:'stage_1_1',level_id:'normal'}),/CAS/);assert(sweepResult.success);assert.equal(db['player_stage_runs:active'].value.status,'settled');
// Worker catch-up is bounded even after a long outage.
reset();start(10);now+=900000;process();assert.equal(profile().sweep.completed_rounds,4);assert.equal(profile().sweep.status,'running');process();assert.equal(profile().sweep.completed_rounds,8);process();assert.equal(profile().sweep.completed_rounds,10);assert.equal(profile().activity,undefined);
// Replay spending at its original deadline before applying offline regeneration.
reset();profile().stamina=30;profile().last_stamina_update=Math.floor(now/1000);start(10);now+=3600000;process();process();process();assert.equal(profile().stamina,30,'offline recovery must regenerate after historical debits');
// Fixed fragment quantity must not accidentally turn the legacy 70% drop into 100%.
vm.runInContext('Math.random = () => 0.9',c);
assert.equal(fn('sweepRoll')([{item_id:'fragment',group:'fragment',group_drop_rate:0.7,weight:1,quantity:3}]).length,0);
vm.runInContext('Math.random = () => 0.1',c);
assert.equal(fn('sweepRoll')([{item_id:'fragment',group:'fragment',group_drop_rate:0.7,weight:1,quantity:3}])[0].quantity,3);
console.log('PASS C144 runtime: strict HP boundaries, best S/current A quantity, exact mode, resource reservations, both start races, pre/post-commit crashes, missed socket recovery, inclusive cancel cutoff, final/cancel unlock and bounded catch-up');
// Completion preview and actual rolls must share boss/fragment selection.
const previewNk={sqlQuery(sql,args){
 if(sql.includes('FROM game_arcs'))return[{element:'fire'}];
 if(sql.includes('FROM game_talismans'))return args[0]==='Hạ phẩm'?[{id:1,element:'fire'},{id:2,element:'water'}]:[{id:3,element:'fire'},{id:4,element:'water'}];
 throw Error('Unexpected preview query '+sql);
}};
const finalBoss={id:'stage_2_10',arc_id:'arc_2',is_boss:true},rewardLevel={level_id:'legend',gold_reward:10,loot_table:[],boss_loot_table:[]};
const preview=fn('stageCompletionLoot')(previewNk,finalBoss,rewardLevel),fragments=preview.filter(r=>r.group==='fragment');
assert.equal(fragments.length,4);assert(Math.abs(fragments.reduce((sum,r)=>sum+r.drop_rate,0)-.7)<1e-9);
assert(Math.abs(fragments.find(r=>r.item_id==='talisman_fragment_1').drop_rate-.7*.85*.75)<1e-9);
assert.equal(preview.find(r=>r.item_id==='campaign_sweep_ticket').quantity_outcomes.length,3);
for(const level_id of ['normal','epic'])assert(!fn('stageCompletionLoot')(previewNk,finalBoss,{...rewardLevel,level_id}).some(r=>r.group==='fragment'));
assert(!fn('stageCompletionLoot')(previewNk,{...finalBoss,id:'stage_2_05'},rewardLevel).some(r=>r.group==='fragment'));
assert.equal(fn('stageCompletionLoot')(previewNk,{...finalBoss,arc_id:'arc_0'},rewardLevel).length,0);
for(const [roll,expected]of [[0,0],[.249999,0],[.25,1],[.849999,1],[.85,2],[.999999,2]])assert.equal(fn('stageTicketQuantity')(previewNk,roll),expected);
console.log('PASS completion loot: shared fragment preview probabilities, tier/element weights, difficulty/final-boss exclusions, exact ticket boundaries');

// Instant completion: one atomic debit + all remaining rewards, including due rounds free.
reset();let instant=start(3);profile().resources.gems=20;now+=90000;
assert.equal(rpc('getSweepStatus').instant_finish.cost_gems,10);
let finished=rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:10});
assert(finished.success,JSON.stringify(finished));assert.equal(profile().resources.gems,10);
assert.equal(finished.session.completed_rounds,3);assert.equal(profile().stamina,7);
assert.equal(finished.session.receipts.length,3);assert.equal(profile().activity,undefined);
let saved=clone(db);assert(rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:10}).success);assert.deepEqual(db,saved);
reset();instant=start(3);profile().resources.gems=14;saved=clone(db);
assert.equal(rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:15}).code,'INSUFFICIENT_GEMS');assert.deepEqual(db,saved);
profile().resources.gems=20;saved=clone(db);
assert.equal(rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:10}).code,'PRICE_CHANGED');assert.deepEqual(db,saved);
crash='before';assert(!rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:15}).success);assert.deepEqual(db,saved);
crash='after';assert(!rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:15}).success);assert.equal(profile().resources.gems,5);
saved=clone(db);assert(rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:15}).success);assert.deepEqual(db,saved);
reset();instant=start(3);profile().resources.gems=20;
race=()=>{process();}; // Worker may commit first; entire finish transaction must fail CAS.
now+=90000;saved=clone(db);
assert(!rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:15}).success);
assert.equal(profile().resources.gems,20);assert.equal(profile().sweep.completed_rounds,1);
assert(rpc('finishSweep',{session_id:instant.session_id,max_cost_gems:10}).success);assert.equal(profile().resources.gems,10);
console.log('PASS instant finish: quote, due-round exclusion, all rewards, insufficient funds, consent limit, atomic pre/post crash, replay and worker CAS race');

// Catalog projection must not re-read/re-decode published rules for every loot line.
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/config_rpc.js'),'utf8'),c);
let ruleReads=0;
c.getRemoteConfigValue=(_nk,section,key,fallback)=>{if(key==='stage_sweep'){ruleReads++;return clone(config);}if(key==='tower_sweep')return clone(fn('TOWER_SWEEP_DEFAULTS'));return fallback;};
const projectionNk=Object.create(nk),projectionQueries=[];
projectionNk.sqlQuery=(sql,args)=>{
 projectionQueries.push(JSON.stringify([sql,args]));
 if(sql.includes('SELECT * FROM game_stage_levels'))return Array.from({length:150},(_,i)=>({id:'preview_'+i,stage_id:'stage_1_1',level_id:'normal',gold_reward:10,loot_table:[{item_id:'material',base_quantity:10,drop_rate:1}],boss_loot_table:[]}));
 return nk.sqlQuery(sql,args);
};
const projected=fn('stageLevelsWithCompletionLoot')(projectionNk);
assert.equal(projected.length,150);assert.equal(ruleReads,1,'Read sweep rules once per projection');
assert.equal(projectionQueries.length,new Set(projectionQueries).size,'Repeated SQL in projection');
assert(projected.every(r=>r.completion_loot.find(x=>x.item_id==='material').quantity===10));
assert(projected.every(r=>r.completion_loot[0].item_id==='campaign_sweep_ticket'));
console.log('PASS catalog loading regression: 150 stage levels, single rules decode, no repeated SQL, unchanged reward quantities');

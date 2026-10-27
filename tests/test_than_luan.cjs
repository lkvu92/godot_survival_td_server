const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
const progression=JSON.parse(fs.readFileSync(path.join(root,'data/progression.json'),'utf8'));
let activeConfig=copy(progression),db=new Map(),serial=0,race=null;
let roll=0,rollCount=0;
const rng=Object.create(Math);rng.random=()=>{rollCount++;return roll;};
const c=vm.createContext({Math:rng});
for(const name of ['character_repository','combat_power','progression_rpc','feature_unlocks'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',name+'.js'),'utf8'),c);
const fn=name=>vm.runInContext(name,c),id=r=>[r.userId,r.collection,r.key].join('/');
const base={sqlQuery(sql){if(sql.includes("key='progression'"))return [{value:copy(activeConfig)}];throw Error(sql);},
 storageRead(refs){return refs.map(r=>db.get(id(r))).filter(Boolean).map(copy);},
 storageWrite(writes){
  if(race){const cb=race;race=null;cb();}
  for(const w of writes){const old=db.get(id(w));if(w.version==='*'?old:!old||old.version!==w.version)throw Error('CAS');}
  return writes.map(w=>{const r={...copy(w),version:String(++serial)};db.set(id(w),r);return copy(r);});
 }};
function scoped(server='s001',account='a'){return fn('characterRuntime')(base,{accountId:account,serverId:server,generation:1});}
function setup(nk,level=35,auraLevel,items){
 const profile={level,resources:{gold:1000000000}};if(auraLevel!==undefined)profile.than_luan={level:auraLevel,revision:0};
 nk.storageWrite([{collection:'player_profiles',key:'main',userId:'a',value:profile,version:'*'},
 {collection:'player_inventory',key:'items',userId:'a',value:{items:items||['low','medium','high'].map(t=>({item_id:'law_fragment_'+t,quantity:10000}))},version:'*'}]);
}
const invoke=(name,nk,req={})=>JSON.parse(fn(name)({userId:'a'},{},nk,JSON.stringify(req)));
const read=(nk,col='player_profiles',key='main')=>nk.storageRead([{collection:col,key,userId:'a'}])[0];
const upgrade=(nk,level,request='upgrade_'+level)=>{
 const receipt=read(nk,'player_item_requests','than_luan_'+request);
 return invoke('upgradeThanLuan',nk,{expected_level:level,request_id:request,expected_revision:receipt?receipt.value.expected_revision:read(nk).value.than_luan?.revision||0,use_charm:false});
};
const battleProfile={level:50,than_luan:{level:20}};
const battleRow=fn('thanLuanBattleSnapshot')(battleProfile,activeConfig.than_luan);
assert.equal(battleRow.level,20);assert.equal(battleRow.aura_id,'tl_2');
battleProfile.than_luan.level=50;assert.equal(battleRow.level,20);
battleRow.stats.persistent_damage_reduction=999;
assert.notEqual(activeConfig.than_luan.levels[19].stats.persistent_damage_reduction,999);
assert.equal(Object.keys(fn('thanLuanBattleSnapshot')({level:29,than_luan:{level:50}},activeConfig.than_luan)).length,0);
let nk=scoped();setup(nk);
assert(invoke('getThanLuanState',nk).success);assert.equal(read(nk).value.than_luan.level,1);
const saved=copy([...db]);invoke('getThanLuanState',nk);assert.deepEqual([...db],saved,'Reconcile is idempotent');
let result=invoke('upgradeThanLuan',nk,{expected_level:1,expected_revision:0,use_charm:false,request_id:'upgrade_1',level:50,profile:{than_luan:{level:50}},cost:{quantity:0},stats:{persistent_damage_reduction:.99}});
assert(result.success);assert.equal(result.state.level,2);assert.equal(result.state.materials.law_fragment_low,9970,'Forged stats, level and price cannot alter the transaction');
const after=copy([...db]);assert(upgrade(nk,1).duplicate);assert.deepEqual([...db],after);
assert.equal(upgrade(nk,2,'upgrade_1').code,'REQUEST_CONFLICT');assert.equal(upgrade(nk,1,'different_req').code,'LEVEL_CONFLICT');
let totals={low:30,medium:0,high:0};
for(let level=2;level<50;level++){
 const cost=progression.than_luan.levels[level].cost;totals[cost.item_id.replace('law_fragment_','')]+=cost.quantity;
 result=upgrade(nk,level);assert(result.success,'Upgrade '+level);assert.equal(result.state.aura_id,'tl_'+(Math.floor(level/10)+1));
 for(const [key,factor] of Object.entries({persistent_damage_reduction:.003,dot_damage_reduction:.006,control_duration_reduction:.008}))assert(Math.abs(result.state.stats[key]-(level+1)*factor)<1e-9);
}
assert.deepEqual(totals,{low:558,medium:950,high:2215});assert.equal(upgrade(nk,50).code,'MAX_LEVEL');
assert.equal(result.state.next,null);assert.equal(result.state.stats.persistent_damage_reduction,.15);
let other=scoped('s002');setup(other,29);assert.equal(invoke('getThanLuanState',other).state.level,0);assert.equal(upgrade(other,1).code,'FEATURE_LOCKED');
let p=read(other);p.value.level=30;other.storageWrite([{...p,value:p.value}]);assert.equal(invoke('getThanLuanState',other).state.level,1);
assert.equal(read(nk).value.than_luan.level,50,'Server isolation');
const inv=read(other,'player_inventory','items');inv.value.items=[];other.storageWrite([{...inv,value:inv.value}]);
const insufficient=copy([...db]);assert.equal(upgrade(other,1).code,'INSUFFICIENT_MATERIALS');assert.deepEqual([...db],insufficient);
other=scoped('s003');setup(other,35,1);race=()=>{const p=read(other);p.value.than_luan={level:2,revision:1};other.storageWrite([{...p,value:p.value}]);};
const beforeItems=read(other,'player_inventory','items');assert.equal(upgrade(other,1).code,'CONFLICT');assert.deepEqual(read(other,'player_inventory','items'),beforeItems,'CAS failure cannot debit inventory');
assert.equal(read(other).value.than_luan.level,2);
other=scoped('s004');setup(other,35,1);
race=()=>{assert(upgrade(other,1,'same_request').success);};
assert.equal(upgrade(other,1,'same_request').code,'CONFLICT');
assert(upgrade(other,1,'same_request').duplicate,'Same-request post-commit race replays safely');
assert.equal(read(other,'player_inventory','items').value.items[0].quantity,9970,'Exactly one debit under a same-request race');
// Failed attempts commit costs but preserve level/stats, and replays never reroll.
const chanceScope=scoped('s005');setup(chanceScope,35,20,[{item_id:'law_fragment_high',quantity:1000},{item_id:'than_luan_boost_charm',quantity:3}]);
const attempt={expected_level:20,expected_revision:0,use_charm:true,request_id:'failed_attempt'};
roll=.999;const beforeFailure=copy(read(chanceScope).value);const failed=invoke('upgradeThanLuan',chanceScope,attempt);
assert(failed.success&&failed.attempted&&failed.consumed&&!failed.upgraded&&failed.charm_consumed);
assert.equal(failed.state.level,20);assert.equal(failed.state.revision,1);
assert.equal(failed.success_rate,Math.min(100,Math.round(progression.than_luan.levels[20].success_rate*1.5)));
assert.equal(failed.profile.resources.gold,beforeFailure.resources.gold-progression.than_luan.levels[20].cost.gold);
assert.equal(failed.state.materials.than_luan_boost_charm,2);
const committed=copy([...db]),rolls=rollCount;roll=0;
const replay=invoke('upgradeThanLuan',chanceScope,attempt);assert(replay.duplicate&&!replay.upgraded);assert.equal(rollCount,rolls);assert.deepEqual([...db],committed);
assert.equal(invoke('upgradeThanLuan',chanceScope,{...attempt,use_charm:false}).code,'REQUEST_CONFLICT');
assert.equal(invoke('upgradeThanLuan',chanceScope,{...attempt,request_id:'stale_revision'}).code,'REVISION_CONFLICT');
const succeeded=invoke('upgradeThanLuan',chanceScope,{...attempt,expected_revision:1,request_id:'success_attempt'});assert(succeeded.upgraded&&succeeded.state.level===21);
const capped=scoped('s008');setup(capped,35,10,[{item_id:'law_fragment_medium',quantity:1000},{item_id:'than_luan_boost_charm',quantity:1}]);
roll=.999;const capResult=invoke('upgradeThanLuan',capped,{expected_level:10,expected_revision:0,use_charm:true,request_id:'capped_chance'});
assert.equal(capResult.success_rate,100);assert(capResult.upgraded);assert.equal(capResult.state.materials.than_luan_boost_charm||0,0);
const unassisted=scoped('s009');setup(unassisted,35,20);
const unassistedFailure=upgrade(unassisted,20,'failed_without_charm');assert(unassistedFailure.consumed&&!unassistedFailure.upgraded&&!unassistedFailure.charm_consumed);
assert.equal(unassistedFailure.state.level,20);roll=0;
const poor=scoped('s006');setup(poor,35,1);const poorProfile=read(poor);poorProfile.value.resources.gold=0;poor.storageWrite([{...poorProfile}]);
assert.equal(upgrade(poor,1).code,'INSUFFICIENT_GOLD');
assert.equal(invoke('upgradeThanLuan',nk,{expected_level:49,expected_revision:49,request_id:'missingcharm',use_charm:true}).code,'LEVEL_CONFLICT');
const noCharm=scoped('s007');setup(noCharm,35,1,[{item_id:'law_fragment_low',quantity:1000},{item_id:'element_enlightenment_charm',quantity:10}]);const noCharmBefore=copy([...db]);
assert.equal(invoke('upgradeThanLuan',noCharm,{expected_level:1,expected_revision:0,request_id:'missingcharm',use_charm:true}).code,'INSUFFICIENT_CHARM');assert.deepEqual([...db],noCharmBefore);
activeConfig.than_luan.levels[0].stats.dot_damage_reduction=NaN;assert.equal(upgrade(other,2).code,'CONFIG_INVALID');activeConfig=copy(progression);
assert.equal(JSON.parse(fn('upgradeThanLuan')({}, {},other,'{}')).code,'AUTH_REQUIRED');
for(const req of [null,[],{expected_level:1,request_id:'x'},{expected_level:1.5,request_id:'abcdefgh'}])assert.equal(invoke('upgradeThanLuan',other,req).code,'INVALID_REQUEST');
assert.deepEqual(copy(fn('featureForRpc')('upgrade_than_luan',{})),['laws']);
assert.deepEqual(copy(fn('featureForRpc')('get_than_luan_state',{})),['laws']);
// Same stat/economy fixtures are consumed by the Godot integration suite.
const fixture={progression,heroes:JSON.parse(fs.readFileSync(path.join(root,'data/heroes.json'))),skills:JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'))),items:JSON.parse(fs.readFileSync(path.join(root,'data/items.json'))),effects:JSON.parse(fs.readFileSync(path.join(root,'data/effects.json')))};
const states=fixture.heroes.map(h=>({hero_id:h.id,owned:true,level:35}));
fixture.power=[];
for(const level of [0,1,10,11,20,21,30,31,40,41,50]){
 const profile={level:35,than_luan:{level,revision:0},elements:{},element_affinities:{}};
 const result=fn('calculateCombatPower')(profile,states,[],fixture.heroes,fixture.skills,progression,fixture.items);
 fixture.power.push({profile,states,result:copy(result)});
 if(level)assert(result.heroes.every(h=>h.breakdown.than_luan>0));
}
const output=path.resolve(root,'../tmp/than_luan_fixture.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(fixture));
console.log('PASS Pháp Tắc: 49 upgrades, exact costs, chance/charm caps, failed-attempt debits, immutable replays without RNG, revision/CAS fences, insufficient funds/charm, server isolation and rating fixtures');

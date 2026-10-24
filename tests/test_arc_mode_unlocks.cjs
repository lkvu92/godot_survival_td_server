const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const clone=x=>JSON.parse(JSON.stringify(x));
const c=vm.createContext({eventRecord:()=>{},parseJsonb:x=>typeof x==='string'?JSON.parse(x):x,parseJsonObject:x=>typeof x==='string'?JSON.parse(x):x});
for(const file of ['progression_rpc','resource_rpc','sweep_rpc'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/'+file+'.js'),'utf8'),c);
vm.runInContext('sweepConfig=()=>({enabled:true}); sweepCombatError=()=>null; talismanCreateStageRun=()=>({run:{run_id:"r"},version:"*"});',c);
const fn=n=>vm.runInContext(n,c);
const stages=[{id:'a1',arc_id:'a',sort_order:1},{id:'a2',arc_id:'a',sort_order:2},{id:'a3',arc_id:'a',sort_order:3},{id:'b1',arc_id:'b',sort_order:1}];
let rows=stages.flatMap(s=>['normal','epic','legend'].map(level_id=>({stage_id:s.id,arc_id:s.arc_id,level_id}))),profile,writes;
const nk={
 sqlQuery(sql,args=[]){
  if(sql.includes('AS stage_id'))return clone(rows);
  if(sql.includes('FROM game_stages WHERE id'))return clone(stages.filter(s=>s.id===args[0]));
  if(sql.includes('FROM game_stages WHERE arc_id'))return clone(stages.filter(s=>s.arc_id===args[0]&&s.sort_order>args[1]).slice(0,1));
  if(sql.includes('FROM game_arcs'))return [];
  if(sql.includes('FROM game_stage_levels'))return [{stamina_cost:1}];
  throw Error(sql);
 },
 storageRead(refs){return refs.filter(r=>r.collection==='player_profiles').map(r=>({...r,value:clone(profile),version:'v1'}));},
 storageWrite(input){writes.push(clone(input));}
};
function reset(){writes=[];profile={level:50,stamina:10,completed_stage_levels:[],unlocked_stages:stages.map(s=>({stage_id:s.id,unlocked_levels:['normal','epic','legend']}))};}
const clear=(id,mode)=>profile.completed_stage_levels.push({stage_id:id,level_id:mode});
const allowed=(id,mode)=>fn('progressionArcModeAllowed')(nk,profile,id,mode);
const start=(id,mode)=>JSON.parse(fn('startStage')({userId:'u'},{},nk,JSON.stringify({stage_id:id,level_id:mode})));
reset();clear('a1','normal');assert(!allowed('a1','epic'));assert.equal(start('a1','epic').code,'ARC_MODE_LOCKED');assert.equal(writes.length,0);assert.equal(profile.stamina,10);
clear('a3','normal');assert(!allowed('a1','epic'),'Boss clear alone cannot bypass missing middle stages');
fn('progressionCompleteStage')(nk,profile,'a2','normal');
for(const s of ['a1','a2','a3']){assert(allowed(s,'epic'));assert(!allowed(s,'legend'));assert.deepEqual(clone(profile.unlocked_stages.find(r=>r.stage_id===s).unlocked_levels),['normal','epic']);}
profile.unlocked_stages[0]='a1';assert(fn('progressionReconcileArcModes')(nk,profile));assert.deepEqual(clone(profile.unlocked_stages[0].unlocked_levels),['normal','epic'],'Legacy string stage entries migrate');
assert(!allowed('b1','epic'),'Other arcs stay locked');assert(start('a1','epic').success);assert.equal(writes.at(-1)[0].value.stamina,9);
clear('a1','epic');clear('a3','epic');assert(!allowed('a1','legend'));fn('progressionCompleteStage')(nk,profile,'a2','epic');
for(const id of ['a1','a2','a3'])assert(allowed(id,'legend'));
assert(start('a1','legend').success);
reset();assert(fn('progressionReconcileArcModes')(nk,profile));assert(profile.unlocked_stages.every(s=>s.unlocked_levels.join(',')==='normal'));assert(!fn('progressionReconcileArcModes')(nk,profile));
for(const id of ['a1','a2','a3'])clear(id,'epic');assert(!allowed('a1','legend'),'Forged/migrated epic history alone cannot bypass normal arc');
profile.stage_grades={'a1:epic':'S'};assert.throws(()=>fn('sweepPreviewData')(nk,{profile,heroes:{heroes:[{hero_id:'h',owned:true}]}},{stage_id:'a1',level_id:'epic',hero_id:'h'}),/ARC_MODE_LOCKED/);
rows=[];assert(!allowed('a1','epic'),'Missing catalog fails closed');
console.log('PASS C192 arc gates: partial/middle/boss clears, final normal/epic unlock all arc stages, cross-arc isolation, stale rights repair/idempotency, real start rejection without writes/stamina, missing config');

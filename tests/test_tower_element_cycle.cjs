const path=require('path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const config=JSON.parse(read('data/trial_tower.json'));
const heroes=JSON.parse(read('data/heroes.json'));
const skills=JSON.parse(read('data/skills.json'));
const c=vm.createContext({console,Date,Math,readContentConfig:()=>config});
vm.runInContext(read('nakama/data/modules/build/progression_rpc.js'),c);
Object.assign(c,{towerRewardEntries:(_nk,x)=>x,cpObject:x=>x||{},cpArray:x=>Array.isArray(x)?x:[],PROGRESSION_MAX_LEVEL:70,
 readCombatPowerCatalog:()=>({heroes,items:[],progression:{combat_power:{},element_combat:{}}}),cpEquipped:()=>[],cpApplyEquipment:x=>({...x}),thanLuanStats:()=>({}),thanLuanConfig:()=>({}),sweepCombatError:()=>false,
 talismanCreateStageRun:()=>({run:{run_id:'element-run',stage_id:'stage_trial_tower',status:'active',expires_at_ms:Date.now()+60000},version:'v'})});
for(const hero of heroes)for(let floor=1;floor<=30;floor++){
 let stored;
 const nk={storageRead:refs=>refs.map(r=>({...r,version:'v',value:r.collection==='player_profiles'?{element_affinities:{water:100,fire:50,earth:40,wood:30,metal:20},elements:{water:5}}:r.collection==='player_heroes'?{heroes:[{hero_id:hero.id,owned:true,level:30,current_attribute:{hp:1000,atk:100,def:20,attack_speed:1}}]}:r.collection==='player_trial_tower'?{highest_cleared:30,tickets:20,last_ticket_day:Math.floor((Date.now()+7*3600000)/86400000)}:{}})),storageWrite:rows=>{const r=rows.find(r=>r.collection==='player_stage_runs');if(r)stored=r.value;},sqlQuery:(q,args)=>{const h=heroes.find(h=>h.id===args[0]);return skills.filter(s=>h.skill_pool.includes(s.id));}};
 const response=JSON.parse(c.startTrialTower({userId:'u'},{warn(){}},nk,JSON.stringify({floor,hero_id:hero.id,request_id:'cycle_test'})));
 assert(response.success,JSON.stringify(response));
 const run=response.run,element=config.element_cycle[(floor-1)%5];
 assert.equal(run.demon_element,element);
 const opponent=heroes.find(h=>h.element===element);
 assert(run.demon_draft_catalog.filter(x=>x.skill_id).every(x=>opponent.skill_pool.includes(x.skill_id)));
 assert(Object.keys(run.demon_skill_levels).every(id=>opponent.skill_pool.includes(id)));
 assert.equal(run.demon_attributes.hp,1000);
 assert.equal(run.stat_multiplier,Math.round((.7+(floor-1)*.1)*10000)/10000);
 // Submit legal hero upgrades and verify AI uses its independent catalog.
 let levels={...run.skill_levels},picks=[];
 for(let i=0;i<19;i++){const choice=run.draft_catalog.find(x=>c.towerDraftLegal(x,levels));picks.push(choice.id);c.towerDraftApply(choice,levels);}
 nk.storageRead=()=>[{value:stored,version:'v'}];
 const prepared=JSON.parse(c.prepareTrialTower({userId:'u'},{},nk,JSON.stringify({run_id:run.run_id,picks})));
 assert(prepared.success,JSON.stringify(prepared));
 assert.equal(prepared.run.demon_picks.length,19);
 assert(prepared.run.demon_picks.every(id=>run.demon_draft_catalog.some(x=>x.id===id)));
}
console.log('PASS tower element cycle: every hero x 30 floors, separate skill catalog and AI draft, unchanged bare stats/scaling');

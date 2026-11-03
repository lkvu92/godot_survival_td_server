/* C239 Arc 2: explicit growth and stage loadouts, independent of heroes/arc power. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const data=path.resolve(__dirname,'../data'),file=path.join(data,'c239_arc2_migration.json'),read=n=>JSON.parse(fs.readFileSync(path.join(data,n+'.json'),'utf8'));
const ELEMENTS=['metal','water','wood','fire','earth'];
// id, role, base HP/ATK/DEF, per-level HP/ATK/DEF, speed, attack speed, range, gold.
const GROWTH=[
 ['snow_skeleton','fighter',65,7,1.6,8,1.1,.3,62,.8,38,10],
 ['frost_wolf','fast',42,5,.7,5,.8,.15,95,1.15,34,13],
 ['snow_mage','ranger',50,9,1.1,6,1.8,.2,46,.65,290,16],
 ['horn_cactus','tank',100,14,7,18,1.4,1.2,36,.45,54,22],
 ['ice_golem','boss',1900,32,9,300,6,1.5,18,.55,70,120],
 ['ghost_medium','boss',2600,38,10,380,8,1.8,34,.55,150,180]
];
function build(){
 const native=require('./creep_boss_skill_atlas.cjs').load(),enemies=Object.fromEntries(read('enemies').map(e=>[e.id,e])),species={};
 for(const [id,role,hp,atk,def,gh,ga,gd,speed,as,range,gold]of GROWTH)species['a2_'+id]={visual_definition_id:id,role,base_attributes:{hp,atk,def,move_speed:speed,attack_speed:as,attack_range:range,projectile_speed:340,crit_rate:0,crit_damage:1.5,regen_percent_per_10s:0},growth_per_level:{hp:gh,atk:ga,def:gd,move_speed:0,attack_speed:0,attack_range:0},reward:{exp:1,gold}};
 const types={melee:{metal:'metal_punch',water:'ice_claw',wood:'wood_vine',fire:'fire_claw',earth:'earth_punch'},ranged:{metal:'metal_bolt',water:'ice_bolt',wood:'wood_bolt',fire:'fire_ball',earth:'earth_orb'}};
 function attack(element,ranged){const type=types[ranged?'ranged':'melee'][element],skill=Object.values(native.skills).find(s=>s.element===element&&s.executor==='enemy_cast'&&s.levels[0].payload.type===type);assert(skill,type);return skill.id;}
 const stages=read('stages').filter(s=>s.arc_id==='arc_frozen_realm').map(source=>{
  const stage=structuredClone(source);stage.stage_rules={enemy_framework_version:2,migration:'c239_arc2',campaign_arc_order:2,dual_element_chance:0,element_policy:'legacy_70_percent_arc_else_authored'};stage.boss_skill_ids=[];stage.boss_skill_entry_indexes=[];delete stage.campaign_pressure_version;delete stage.campaign_opening_relief_version;
  for(const [wi,wave]of stage.waves.entries()){
   delete wave.boss_id;
   wave.entries=wave.entries.map(old=>{
    const enemy=enemies[old.enemy_id];assert(enemy&&species['a2_'+enemy.id],old.enemy_id);const boss=!!old.boss,level=Math.max(1,Number(stage.level||1)+(wi>=14?1:0)),binding=native.bindings[enemy.id];
    const passive=lv=>binding.generic_skills.map(ref=>({...ref,level:lv,slot:'generic_skills'}));
    const loadouts=lv=>Object.fromEntries(ELEMENTS.map(element=>[element,[{skill_id:attack(element,enemy.attack_type==='ranged'),level:lv,slot:'attack_skill'},...passive(lv)]]));
    const bossSkills=lv=>[{skill_id:'shared_neutral_basic',level:lv,slot:'attack_skill'},...binding.boss_skills.map(ref=>({...ref,level:lv,slot:'boss_skills'})),...passive(lv),{...native.defaults.boss_skills.control_resistance_growth,level:lv,slot:'boss_skills'}];
    const entry={species_id:'a2_'+enemy.id,level,count:old.count,interval:old.interval,start_delay:old.start_delay||0,boss,spawn_role:old.spawn_role||'normal',formation_lead_seconds:old.formation_lead_seconds||0,exp:old.modifiers?.exp??enemy.reward.exp,skills:boss?bossSkills(1):[],difficulty_overrides:{epic:{level:level+1},legend:{level:level+2}}};
    if(boss){entry.elements=['water'];entry.difficulty_overrides.epic.skills=bossSkills(2);entry.difficulty_overrides.legend.skills=bossSkills(3);}else{const weights=Object.fromEntries(ELEMENTS.map(e=>[e,(e==='water'?.7:0)+(e===enemy.element?.3:0)]));entry.random_elements={pool:ELEMENTS.filter(e=>weights[e]>0),weights,count:1,second_element_chance:0};entry.skills_by_element=loadouts(1);entry.difficulty_overrides.epic.skills_by_element=loadouts(2);entry.difficulty_overrides.legend.skills_by_element=loadouts(3);}
    return entry;
   });
  }
  return stage;
 });assert.equal(stages.length,10);return require('./c239_loadout_templates.cjs').compact(require('./c239_role_balance.cjs').apply({version:1,arc_id:'arc_frozen_realm',species,stages}));
}
function load(){return JSON.parse(fs.readFileSync(file,'utf8'));}
if(require.main===module){const value=build();if(process.argv.includes('--write'))fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');else assert.deepEqual(load(),value);console.log(`PASS Arc 2 migration: ${value.stages.length} stages, ${Object.keys(value.species).length} species`);}
module.exports={build,load,ELEMENTS};

/* C239 Arc 6/7 migration: independent per-species growth, native atlas and weighted individual elements. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const data=path.resolve(__dirname,'../data'),read=n=>JSON.parse(fs.readFileSync(path.join(data,n+'.json'),'utf8')),ELEMENTS=['metal','water','wood','fire','earth'];
function build(order){
 assert([6,7].includes(order));const arc=order===6?'arc_ngu_to_quy_khu':'arc_van_yeu_co_linh',source=read('stages').filter(s=>s.arc_id===arc),enemies=Object.fromEntries(read('enemies').map(e=>[e.id,e])),native=require('./creep_boss_skill_atlas.cjs').load(),species={};
 const canonical=id=>order===7?id.replace(/_(metal|water|wood|fire|earth)$/,''):(enemies[id].source_enemy_id||id);
 const previous=Object.assign({},...[1,2,3,4,5].map(n=>require('./arc'+n+'_levelled_catalog.cjs').load().species));
 const previousByVisual=Object.fromEntries(Object.entries(previous).map(([key,s])=>[s.visual_definition_id,key]));
 const speciesKey=id=>order===6&&previousByVisual[canonical(id)]?previousByVisual[canonical(id)]:'a'+order+'_'+canonical(id);
 const oldIds=[...new Set(source.flatMap(s=>s.waves.flatMap(w=>w.entries.map(e=>e.enemy_id))))];
 for(const id of oldIds){const enemy=enemies[id],baseId=canonical(id),key=speciesKey(id);if(species[key]||previous[key])continue;const visual=order===7?baseId+'_fire':id,ref=enemies[visual],boss=!!ref.is_boss,ranger=ref.attack_type==='ranged',tank=/sentinel|protector|colossus|brute|co_giap/.test(id),role=boss?'boss':tank?'tank':ranger?'ranger':'fighter';const a=ref.attributes;
  const hp=Number(a.hp)*.35,atk=Number(a.atk)*.3,def=Number(a.def)*.35;
  species[key]={visual_definition_id:visual,role,base_attributes:{hp,atk,def,move_speed:Number(a.move_speed),attack_speed:Number(a.attack_speed),attack_range:Number(a.attack_range),projectile_speed:Number(a.projectile_speed||340),crit_rate:0,crit_damage:1.5,regen_percent_per_10s:0},growth_per_level:{hp:hp*(tank?.12:boss?.1:.08),atk:atk*(ranger?.12:.08),def:def*(tank?.12:.08),move_speed:0,attack_speed:0,attack_range:0},reward:{exp:1,gold:Number(ref.reward?.gold||0)}};
 }
 const types={melee:{metal:'metal_punch',water:'ice_claw',wood:'wood_vine',fire:'fire_claw',earth:'earth_punch'},ranged:{metal:'metal_bolt',water:'ice_bolt',wood:'wood_bolt',fire:'fire_ball',earth:'earth_orb'}};
 const find=(element,type,id='')=>{const s=Object.values(native.skills).find(s=>s.element===element&&s.executor==='enemy_cast'&&s.levels[0].payload.type===type&&(!id||s.levels[0].payload.id===id));assert(s,`Missing ${element}/${type}/${id}`);return s.id;};
 const presentation_variants={};if(order===6)for(const id of oldIds){const key=speciesKey(id);(presentation_variants[key]??=[]).push(id);}
 const stages=source.map(src=>{const stage=structuredClone(src);stage.stage_rules={enemy_framework_version:2,migration:'c239_arc'+order,campaign_arc_order:order,dual_element_chance:.1};stage.boss_skill_ids=[];stage.boss_skill_entry_indexes=[];delete stage.campaign_pressure_version;delete stage.campaign_opening_relief_version;
 for(const [wi,wave] of stage.waves.entries()){delete wave.boss_id;wave.entries=wave.entries.map(old=>{const enemy=enemies[old.enemy_id],binding=native.bindings[old.enemy_id],boss=!!old.boss,level=Math.max(1,Number(stage.level||1)+(wi>=14?1:0));assert(enemy&&binding,old.enemy_id);
  const passive=lv=>binding.generic_skills.map(ref=>({...ref,level:lv,slot:'generic_skills'}));
  const loadouts=lv=>Object.fromEntries(ELEMENTS.map(element=>{const original=binding.attack_skill?native.skills[binding.attack_skill.skill_id].levels[0].payload:null;const type=order===7&&original?original.type:types[enemy.attack_type==='ranged'?'ranged':'melee'][element],id=order===7&&original?original.id:'';return[element,[{skill_id:find(element,type,id),level:lv,slot:'attack_skill'},...passive(lv)]]}));
  const bossSkills=lv=>[...(binding.attack_skill?[{...binding.attack_skill,level:lv,slot:'attack_skill'}]:[{skill_id:'shared_neutral_basic',level:lv,slot:'attack_skill'}]),...binding.boss_skills.map(ref=>({...ref,level:lv,slot:'boss_skills'})),...passive(lv)];
  const entry={species_id:speciesKey(old.enemy_id),level,count:old.count,interval:old.interval,start_delay:old.start_delay||0,boss,spawn_role:old.spawn_role||'normal',formation_lead_seconds:old.formation_lead_seconds||0,exp:old.modifiers?.exp??enemy.reward.exp,skills:boss?bossSkills(1):[],difficulty_overrides:{epic:{level:level+1},legend:{level:level+2}}};
  if(order===6)entry.presentation_id=old.enemy_id;
  if(boss){const required=[...new Set(entry.skills.map(s=>native.skills[s.skill_id].element).filter(e=>e!=='neutral'))];entry.elements=required.length?required:[enemy.element];entry.difficulty_overrides.epic.skills=bossSkills(2);entry.difficulty_overrides.legend.skills=bossSkills(3);}else{entry.random_elements={pool:ELEMENTS,count:1,second_element_chance:.1};entry.skills_by_element=loadouts(1);entry.difficulty_overrides.epic.skills_by_element=loadouts(2);entry.difficulty_overrides.legend.skills_by_element=loadouts(3);}return entry;
 });}return stage;});assert.equal(stages.length,10);return require('./c239_loadout_templates.cjs').compact(require('./c239_role_balance.cjs').apply({version:1,arc_id:arc,species,presentation_variants,stages}));
}
function load(order){return JSON.parse(fs.readFileSync(path.join(data,'c239_arc'+order+'_migration.json'),'utf8'));}
if(require.main===module){const order=Number(process.argv[2]),value=build(order);if(process.argv.includes('--write'))fs.writeFileSync(path.join(data,'c239_arc'+order+'_migration.json'),JSON.stringify(value,null,2)+'\n');else assert.deepEqual(load(order),value);console.log(`PASS Arc ${order}: ${value.stages.length} stages, ${Object.keys(value.species).length} species`);}
module.exports={build,load};

/* C239: authored growth, never imports hero stat/growth or arc balance curves. */
const fs=require('node:fs'),path=require('node:path');
const ELEMENTS=['metal','water','wood','fire','earth'];
const SPECIES=[
 ['stone_ape','pha_son_cu_vien','normal',60,5,1.6,58,220],
 ['blood_lion','huyet_man_cuong_su','normal',55,5.5,1.5,64,220],
 ['armored_rhino','co_giap_long_te','tank',95,4.5,5,49,220],
 ['venom_croc','doc_tich_man_ngac','ranger',32,7,0.6,49,360],
 ['thunder_bear','loi_trao_hung_bi','normal',65,5.5,1.8,58,220],
 ['shadow_leopard','huyen_lan_long_bao','normal',48,6,1.2,70,220],
 ['bone_beast','man_cot_toan_nghe','ranger',35,7.5,0.7,49,360],
 ['tiger_king','bach_ho_yeu_vuong','boss',1800,11,8,60,260],
];
function buildFramework(){
 const species={},skill_atlas={};
 for(const [id,visual,role,hp,atk,def,speed,range] of SPECIES){
  species[id]={visual_definition_id:`arc7_${visual}_fire`,role,base_attributes:{hp:hp*2,atk:atk*2,def,move_speed:speed,attack_range:range,attack_speed:.35,crit_rate:0,crit_damage:1.5},growth_per_level:{hp,atk,def,move_speed:0,attack_range:0,attack_speed:0},reward:{exp:1,gold:role==='boss'?1000:100}};
 }
 for(const element of ELEMENTS){
  for(const [suffix,kind] of [['strike','direct'],['burst','area'],['vitality','max_hp']]){
   const id=`${element}_${suffix}`;
   skill_atlas[id]={id,display_name:id,element,kind,vfx_key:{metal:'metal_slash',water:'ice_claw',wood:'wood_vine',fire:'claw',earth:'earth_punch'}[element],levels:Array.from({length:5},(_,i)=>kind==='max_hp'?{level:i+1,hp_multiplier:1.05+i*.025}:{level:i+1,damage_multiplier:kind==='area'?.8+i*.15:.65+i*.1,cooldown:kind==='area'?7-i*.25:2-i*.1,range:kind==='area'?300:380,radius:kind==='area'?110+i*10:0,slow_percent:kind==='area'?.1+i*.025:0,slow_duration:kind==='area'?1+i*.25:0})};
  }
 }
 const templates={}; for(let n=1;n<=7;n++){const m=n<=5?require(`./arc${n}_levelled_catalog.cjs`).load():require("./arc67_levelled_catalog.cjs").load(n);Object.assign(templates,m.loadout_templates);}
 const native=require("./creep_boss_skill_atlas.cjs").load();
 Object.assign(skill_atlas,native.skills);
 Object.assign(species,require("./arc1_levelled_catalog.cjs").load().species);
 Object.assign(species,require("./arc67_levelled_catalog.cjs").load(6).species);
 Object.assign(species,require("./arc67_levelled_catalog.cjs").load(7).species);
 Object.assign(species,require("./arc2_levelled_catalog.cjs").load().species);
 Object.assign(species,require("./arc5_levelled_catalog.cjs").load().species);
 Object.assign(species,require("./arc4_levelled_catalog.cjs").load().species);
 Object.assign(species,require("./arc3_levelled_catalog.cjs").load().species);
 for(const [id,variants] of Object.entries(require("./arc67_levelled_catalog.cjs").load(6).presentation_variants)){if(!species[id])throw Error("Missing presentation species "+id);species[id].presentation_variants=[...new Set(variants)];}
 return {version:2,max_level:200,boss_element_baselines:require("./c239_role_balance.cjs").baseline.boss_elements,species,skill_atlas,enemy_skill_bindings:native.bindings,native_defaults:native.defaults,loadout_templates:templates};
}
function buildPilot(source,{levelOffset=0}={}){
 const stage=structuredClone(source);stage.id='stage_c239_pilot';stage.arc_id='arc_c239_pilot';stage.display_name='C239 Levelled Enemy Pilot';
 stage.stage_rules={enemy_framework_version:2,generation_seed:239};
 delete stage.campaign_pressure_version;delete stage.campaign_opening_relief_version;delete stage.boss_skill_ids;delete stage.boss_skill_entry_indexes;
 for(const [wi,wave] of stage.waves.entries()){
  delete wave.boss_id;
  wave.entries=wave.entries.map((old,index)=>{
   const row=SPECIES.find(s=>old.enemy_id.includes(s[1]));if(!row)throw Error('Unknown pilot source '+old.enemy_id);
   const level=60+Math.floor(wi/4)+levelOffset;
   // Explicit spread includes neutral/all-five; weighted random appears on late waves.
   const elements=index===0&&wi===0?[]:index===1&&wi===0?[...ELEMENTS]:index%3===0?['wood','fire']:[ELEMENTS[(wi+index)%5]];
   const skillElement=elements.includes('fire')?'fire':elements[0];
   const skillList=lv=>!skillElement?[]:[{skill_id:`${skillElement}_strike`,level:lv},...(row[2]==='boss'?[{skill_id:`${skillElement}_burst`,level:lv}]:[]),...(row[2]==='tank'?[{skill_id:`${skillElement}_vitality`,level:lv}]:[])];
   const entry={species_id:row[0],level,elements,count:old.count,interval:old.interval,start_delay:old.start_delay||0,boss:!!old.boss,spawn_role:old.spawn_role,formation_lead_seconds:old.formation_lead_seconds||0,exp:old.modifiers?.exp||1,skills:skillList(2),difficulty_overrides:{epic:{level:level+5,skills:skillList(3)},legend:{level:level+10,skills:skillList(4)}}};
   if(wi>=8&&index===1){delete entry.elements;entry.random_elements={pool:['wood','fire'],weights:{wood:2,fire:1},count:2};entry.skills=[{skill_id:'fire_strike',level:2}];entry.difficulty_overrides.epic.skills=[{skill_id:'fire_strike',level:3}];entry.difficulty_overrides.legend.skills=[{skill_id:'fire_strike',level:4}];}
   const native=require('./creep_boss_skill_atlas.cjs').load();
   const binding=native.bindings[old.enemy_id];
   if(!binding)throw Error('Missing native pilot binding '+old.enemy_id);
   const nativeSkills=lv=>[...(binding.attack_skill?[{...binding.attack_skill,level:lv,slot:'attack_skill'}]:[]),...binding.boss_skills.map(ref=>({...ref,level:lv,slot:'boss_skills'})),...binding.generic_skills.map(ref=>({...ref,level:lv,slot:'generic_skills'}))];
   entry.skills=nativeSkills(1);
   delete entry.random_elements;
   const required=[...new Set(entry.skills.map(ref=>native.skills[ref.skill_id].element).filter(e=>e!=='neutral'))];
   entry.elements=[...new Set([...elements,...required])];
   entry.difficulty_overrides.epic.skills=nativeSkills(2);
   entry.difficulty_overrides.legend.skills=nativeSkills(3);
   return entry;
  });
 }
 return stage;
}
function writeFixture(output,{pilot=true,levelOffset=0}={}){
 const data=path.resolve(__dirname,'../data');fs.mkdirSync(output,{recursive:true});
 for(const name of fs.readdirSync(data).filter(n=>n.endsWith('.json')))fs.copyFileSync(path.join(data,name),path.join(output,name));
 const progression=JSON.parse(fs.readFileSync(path.join(data,'progression.json')));progression.enemy_framework=buildFramework();fs.writeFileSync(path.join(output,'progression.json'),JSON.stringify(progression,null,2)+'\n');
 if(pilot){
  const stages=JSON.parse(fs.readFileSync(path.join(data,'stages.json'))),source=stages.find(s=>s.id==='stage_7_05');stages.push(buildPilot(source,{levelOffset}));fs.writeFileSync(path.join(output,'stages.json'),JSON.stringify(stages,null,2)+'\n');
  const arcs=JSON.parse(fs.readFileSync(path.join(data,'arcs.json')));arcs.push({id:'arc_c239_pilot',order:0,stage_ids:['stage_c239_pilot']});fs.writeFileSync(path.join(output,'arcs.json'),JSON.stringify(arcs,null,2)+'\n');
  const levels=JSON.parse(fs.readFileSync(path.join(data,'stage_levels.json')));for(const row of levels.filter(r=>r.stage_id==='stage_7_05')){const clone=structuredClone(row);clone.id=`stage_c239_pilot_${row.level_id}`;clone.stage_id='stage_c239_pilot';clone.enemy_modifiers={};levels.push(clone);}fs.writeFileSync(path.join(output,'stage_levels.json'),JSON.stringify(levels,null,2)+'\n');
 }
 return output;
}
if(require.main===module){const args=process.argv.slice(2);if(args.includes('--write-seed')){const file=path.resolve(__dirname,'../data/progression.json'),data=JSON.parse(fs.readFileSync(file));data.enemy_framework=buildFramework();fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');console.log('C239 catalog seeded; no live stage changed');}else{const out=args.find(a=>a.startsWith('--fixture='));if(!out)throw Error('Use --write-seed or --fixture=directory');writeFixture(path.resolve(out.slice(10)));console.log('C239 fixture ready');}}
module.exports={buildFramework,buildPilot,writeFixture,ELEMENTS};

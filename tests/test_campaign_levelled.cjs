/* Catalog integrity against pre-migration seed; no player data or DB writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const data=path.resolve(__dirname,'../data'),read=n=>JSON.parse(fs.readFileSync(path.join(data,n+'.json'),'utf8'));
const original=read('stages'),enemies=Object.fromEntries(read('enemies').map(x=>[x.id,x])),catalog=read('progression').enemy_framework;
const ranges={2:[[10,20],[10,20]],3:[[20,30],[15,30]],4:[[30,40],[25,40]],5:[[40,50],[35,50]],6:[[50,60],[45,60]],7:[[55,65],[55,65]]};
const roleValues=require('../data/c239_role_baselines.json').roles;
let stages=0,waves=0,entries=0;
for(let order=2;order<=7;order++){
 const module=order<=5?require('../tools/arc'+order+'_levelled_catalog.cjs'):require('../tools/arc67_levelled_catalog.cjs'),migration=order<=5?module.load():module.load(order);
 assert.deepEqual(order<=5?module.build():module.build(order),migration,'authored migration reproducible');assert.equal(migration.stages.length,10);
 for(const [id,species]of Object.entries(migration.species)){const actual={...catalog.species[id]};delete actual.presentation_variants;assert.deepEqual(actual,species);assert(!species.elements&&!species.skills&&!species.element);for(const stat of ['hp','atk','def','move_speed','attack_speed','attack_range'])assert(Number.isFinite(species.base_attributes[stat])&&Number.isFinite(species.growth_per_level[stat]));}
 for(const [stageIndex,stage] of migration.stages.entries()){stages++;const [levels,requirements]=ranges[order];const interpolate=a=>Math.round(a[0]+(a[1]-a[0])*stageIndex/9);assert.equal(stage.level,interpolate(levels));assert.equal(stage.stage_rules.required_user_level,interpolate(requirements));const old=original.find(s=>s.id===stage.id);assert(old&&old.arc_id===migration.arc_id);assert.equal(stage.waves.length,old.waves.length);assert.equal(stage.stage_rules.campaign_arc_order,order);
  for(const [i,w]of stage.waves.entries()){waves++;assert.equal(w.entries.length,old.waves[i].entries.length);for(const [j,e]of w.entries.entries()){entries++;const prior=old.waves[i].entries[j];assert.equal(e.count,prior.count);assert.equal(e.interval,prior.interval);assert.equal(e.start_delay,prior.start_delay||0);assert.equal(e.exp,prior.modifiers?.exp??enemies[prior.enemy_id].reward.exp);assert(!e.modifiers);assert(catalog.species[e.species_id]);
   const speciesList=[...new Set(stage.waves.flatMap(w=>w.entries.filter(x=>!x.boss).map(x=>x.species_id)))].sort();const countMap={14:1,15:2,16:2,17:3,18:4};const targetCount=countMap[i]??(i>=19?speciesList.length:0);const count=Math.min(targetCount,speciesList.length);const offset=speciesList.length?(stageIndex+i)%speciesList.length:0;const elevated=new Set();for(let k=0;k<count;k++)elevated.add(speciesList[(offset+k)%speciesList.length]);const isElevated=(i>=14&&e.boss)||elevated.has(e.species_id);const expectedLevel=stage.level+(isElevated?1:0);assert.equal(e.level,expectedLevel);assert.equal(e.difficulty_overrides.epic.level,expectedLevel+1);assert.equal(e.difficulty_overrides.legend.level,expectedLevel+2);const role=catalog.species[e.species_id].role;if(!e.boss){for(const [stat,val] of Object.entries(roleValues[role]))assert.equal(catalog.species[e.species_id].base_attributes[stat],val);}else assert.equal(catalog.species[e.species_id].balance_profile,'element_boss');
   if(e.presentation_id && e.presentation_id!==catalog.species[e.species_id].visual_definition_id)assert(catalog.species[e.species_id].presentation_variants.includes(e.presentation_id),'presentation variant is explicitly bound to species');
   if(!e.boss){assert.equal(e.random_elements.count,1);assert.equal(e.random_elements.second_element_chance,order>=6?.1:0);for(const row of [e,...Object.values(e.difficulty_overrides)]){const map=catalog.loadout_templates[row.loadout_template_id];assert(map);for(const primary of e.random_elements.pool){assert(Array.isArray(map[primary]));for(const ref of map[primary]){const skill=catalog.skill_atlas[ref.skill_id];assert(skill&&skill.levels.some(l=>l.level===ref.level));assert(skill.element==='neutral'||skill.element===primary);}}}}
   else for(const row of [e,...Object.values(e.difficulty_overrides)])for(const ref of row.skills){const skill=catalog.skill_atlas[ref.skill_id];assert(skill&&skill.levels.some(l=>l.level===ref.level));assert(skill.element==='neutral'||e.elements.includes(skill.element));}
  }}
 }
}
for(const skill of Object.values(catalog.skill_atlas)){
 const type=skill.levels?.[0]?.payload?.type||'';
 if(type.startsWith('tiger_'))assert.equal(skill.element,'metal','Bach Ho native effect retains metal element');
 if(type.startsWith('vermilion_'))assert.equal(skill.element,'fire','Chu Tuoc native effect retains fire element');
}
const box=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(data,'../nakama/data/modules/build/seed.js'),'utf8'),box);const validate=vm.runInContext('validateEnemyFrameworkCatalog',box);assert.equal(validate(catalog),'');
const invalid=structuredClone(catalog),template=Object.values(invalid.loadout_templates)[0],element=Object.keys(template)[0];template[element].push({skill_id:'missing_skill',level:1,slot:'attack_skill'});assert.notEqual(validate(invalid),'','server rejects missing template skills');
console.log(`PASS C239 campaign: ${stages} stages, ${waves} waves, ${entries} entries; independent species, preserved schedule/EXP, fixed-element atlas and early/late arc policies`);

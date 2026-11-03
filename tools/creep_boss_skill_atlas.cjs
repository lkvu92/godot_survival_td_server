/* Canonical C239 creep/boss definitions; legacy fields are verified projections. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const data=path.resolve(__dirname,'../data'),file=path.join(data,'creep_boss_skill_atlas.json');
const read=name=>JSON.parse(fs.readFileSync(path.join(data,name+'.json'),'utf8'));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const signature=value=>JSON.stringify(stable(value));
function scaled(value,factor){if(Array.isArray(value))return value.map(v=>scaled(v,factor));if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,typeof v==='number'&&(k==='damage'||k.endsWith('damage_multiplier'))?Number((v*factor).toFixed(9)):scaled(v,factor)]));}
function bootstrap(){
 assert(!fs.existsSync(file),'Canonical source exists; edit it rather than reimport legacy projections');
 const skills={},bindings={},traits=Object.fromEntries(read('enemy_skills').map(s=>[s.id,s])),boss=Object.fromEntries(read('boss_skills').map(s=>[s.id,s]));
 function add(payload,slot){const element=payload.element||'neutral',executor=slot==='generic_skills'?'enemy_trait':'enemy_cast';payload=structuredClone(payload);payload.element=element;const hash=crypto.createHash('sha256').update(signature({payload,executor})).digest('hex').slice(0,16),id=`native_${payload.type||payload.id}_${element}_${hash}`;
  skills[id]??={id,display_name:payload.display_name||payload.id,element,kind:'native',executor,levels:Array.from({length:5},(_,i)=>({level:i+1,payload:scaled(payload,1+i*.1)}))};return{skill_id:id,level:1};}
 for(const enemy of read('enemies')){const binding={attack_skill:null,boss_skills:[],generic_skills:[]};if(enemy.attack_skill&&Object.keys(enemy.attack_skill).length)binding.attack_skill=add(enemy.attack_skill,'attack_skill');for(const s of enemy.boss_skills||[])binding.boss_skills.push(add(s,'boss_skills'));for(const s of enemy.generic_skills||[]){const payload={...s,params:{...(traits[s.id]?.params||{}),...(s.params||{})}};binding.generic_skills.push(add(payload,'generic_skills'));}bindings[enemy.id]=binding;}
 // Unassigned reusable definitions are also learnable/catalogued, not tied to a species.
 for(const s of Object.values(traits))add(s,'generic_skills');for(const s of Object.values(boss))add(s,'boss_skills');
 fs.writeFileSync(file,JSON.stringify({version:1,skills,bindings},null,2)+'\n');
}
function load(){return JSON.parse(fs.readFileSync(file,'utf8'));}
function payload(source,ref){const skill=source.skills[ref.skill_id];assert(skill,`Missing ${ref.skill_id}`);const row=skill.levels.find(r=>r.level===ref.level);assert(row,`Missing level ${ref.skill_id}/${ref.level}`);return structuredClone(row.payload);}
function project(enemies,source=load()){return enemies.map(enemy=>{const binding=source.bindings[enemy.id];assert(binding,`Missing binding ${enemy.id}`);const row=structuredClone(enemy);if(binding.attack_skill)row.attack_skill=payload(source,binding.attack_skill);else if(row.attack_skill)row.attack_skill={};for(const slot of ['boss_skills','generic_skills'])if(binding[slot].length||row[slot])row[slot]=binding[slot].map(ref=>payload(source,ref));return row;});}
function apply(){const source=load(),p=read('progression');p.enemy_framework.boss_element_baselines=require('./c239_role_balance.cjs').baseline.boss_elements;for(const id of Object.keys(p.enemy_framework.skill_atlas))if(p.enemy_framework.skill_atlas[id].kind==='native')delete p.enemy_framework.skill_atlas[id];Object.assign(p.enemy_framework.skill_atlas,source.skills);Object.assign(p.enemy_framework.species,require("./arc1_levelled_catalog.cjs").load().species);
 for(const id of Object.keys(p.enemy_framework.species))if(id.startsWith("a6_arc6_")||id==="a6_primordial_wraith")delete p.enemy_framework.species[id];
 Object.assign(p.enemy_framework.species,require("./arc67_levelled_catalog.cjs").load(6).species);
 Object.assign(p.enemy_framework.species,require("./arc67_levelled_catalog.cjs").load(7).species);
 Object.assign(p.enemy_framework.species,require("./arc2_levelled_catalog.cjs").load().species);
 Object.assign(p.enemy_framework.species,require("./arc5_levelled_catalog.cjs").load().species);
 Object.assign(p.enemy_framework.species,require("./arc4_levelled_catalog.cjs").load().species);
 Object.assign(p.enemy_framework.species,require("./arc3_levelled_catalog.cjs").load().species);for(const [id,variants] of Object.entries(require("./arc67_levelled_catalog.cjs").load(6).presentation_variants)){if(!p.enemy_framework.species[id])throw Error("Missing presentation species "+id);p.enemy_framework.species[id].presentation_variants=[...new Set(variants)];}p.enemy_framework.enemy_skill_bindings=source.bindings;p.enemy_framework.native_defaults=source.defaults;p.enemy_framework.loadout_templates={};for(let n=1;n<=7;n++){const migration=n<=5?require(`./arc${n}_levelled_catalog.cjs`).load():require("./arc67_levelled_catalog.cjs").load(n);Object.assign(p.enemy_framework.loadout_templates,migration.loadout_templates);}fs.writeFileSync(path.join(data,'progression.json'),JSON.stringify(p,null,2)+'\n');fs.writeFileSync(path.join(data,'enemies.json'),JSON.stringify(project(read('enemies'),source),null,2)+'\n');}
if(require.main===module){if(process.argv.includes('--bootstrap'))bootstrap();if(process.argv.includes('--apply'))apply();else if(!process.argv.includes('--bootstrap')){assert.deepEqual(project(read('enemies')),read('enemies'));console.log('PASS canonical atlas projections');}}
module.exports={load,project,payload,signature,scaled};

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n+'.json'),'utf8'));
const {load,project,payload,signature}=require('../tools/creep_boss_skill_atlas.cjs'),source=load(),framework=read('progression').enemy_framework,enemies=read('enemies');
assert.deepEqual(project(enemies),enemies,'legacy fields are generated projections');
assert.deepEqual(framework.enemy_skill_bindings,source.bindings);assert.deepEqual(framework.native_defaults,source.defaults);
const behavior=new Set();let references=0;
for(const [id,skill]of Object.entries(source.skills)){
 assert.deepEqual(framework.skill_atlas[id],skill);assert.equal(skill.kind,'native');assert.equal(skill.levels.length,5);assert(!skill.species_id&&!skill.learnable_by);
 const key=signature({executor:skill.executor,payload:skill.levels[0].payload});assert(!behavior.has(key),'identical behavior is stored once');behavior.add(key);
 for(const [i,row]of skill.levels.entries()){assert.equal(row.level,i+1);assert.equal(row.payload.element,skill.element);assert.equal(row.payload.type,skill.levels[0].payload.type);}
}
for(const [id,binding]of Object.entries(source.bindings)){
 assert(enemies.some(e=>e.id===id));for(const slot of ['attack_skill','boss_skills','generic_skills'])for(const ref of slot==='attack_skill'?(binding[slot]?[binding[slot]]:[]):binding[slot]){assert.equal(ref.level,1);assert(payload(source,ref));references++;}
}
const box=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build/seed.js'),'utf8'),box);const validate=vm.runInContext('validateEnemyFrameworkCatalog',box);assert.equal(validate(framework),'');
for(const mutate of [c=>c.enemy_skill_bindings.snow_skeleton.attack_skill={skill_id:'missing',level:1},c=>c.enemy_skill_bindings.snow_skeleton.boss_skills=[{skill_id:Object.keys(source.skills)[0],level:6}],c=>c.skill_atlas[Object.keys(source.skills)[0]].levels[0].payload.element='neutral']){const c=structuredClone(framework);mutate(c);assert.notEqual(validate(c),'');}
console.log(`PASS C239 atlas: ${behavior.size} deduplicated native skills, ${references} equipped references, ${enemies.length} enemy projections, five levels, canonical transport and invalid-reference rejection`);

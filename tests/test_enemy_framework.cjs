const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildFramework,buildPilot}=require('../tools/enemy_framework_catalog.cjs');
const root=path.resolve(__dirname,'..'),catalog=buildFramework(),clone=x=>structuredClone(x);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'data/progression.json'))).enemy_framework,catalog,'seed and generator agree');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build/seed.js'),'utf8'),ctx);
const validate=vm.runInContext('validateEnemyFrameworkCatalog',ctx),seed=vm.runInContext('validateSeedRequest',ctx);
assert.equal(validate(catalog),'');assert.equal(seed({table:'config',config_key:'progression',config_value:{enemy_framework:catalog}}),'');
for(const mutate of [x=>x.version=1,x=>x.max_level=0,x=>x.species.stone_ape.skills=[],x=>x.species.stone_ape.elements=['fire'],x=>x.species.stone_ape.growth_per_level.hp=-1,x=>x.species.stone_ape.growth_per_level.hp=NaN,x=>x.species.stone_ape.reward.exp=-1,x=>x.skill_atlas.fire_strike.element='unknown',x=>x.skill_atlas.fire_strike.levels[0].cooldown=0,x=>x.skill_atlas.fire_strike.levels[1].level=1,x=>x.skill_atlas.fire_burst.levels[0].slow_percent=1]){
 const invalid=clone(catalog);mutate(invalid);assert.notEqual(validate(invalid),'');assert.notEqual(seed({table:'config',config_key:'progression',config_value:{enemy_framework:invalid}}),'');
}
assert.equal(seed({table:'config',config_key:'progression',config_value:{legacy:true}}),'','legacy progression accepted');
const stage=JSON.parse(fs.readFileSync(path.join(root,'data/stages.json'))).find(s=>s.id==='stage_7_05'),before=JSON.stringify(stage),pilot=buildPilot(stage);
assert.equal(JSON.stringify(stage),before,'fixture never mutates source');assert.equal(pilot.waves.length,20);
for(const [i,wave]of pilot.waves.entries()){
 assert.equal(wave.entries.reduce((sum,e)=>sum+e.count,0),stage.waves[i].entries.reduce((sum,e)=>sum+e.count,0));
 assert.equal(wave.entries.reduce((sum,e)=>sum+e.exp*e.count,0),stage.waves[i].entries.reduce((sum,e)=>sum+e.modifiers.exp*e.count,0));
 for(const entry of wave.entries){assert(!entry.modifiers);assert(catalog.species[entry.species_id]);assert(entry.difficulty_overrides.epic.level>entry.level);for(const spec of entry.skills){assert(catalog.skill_atlas[spec.skill_id]);assert(catalog.skill_atlas[spec.skill_id].element === "neutral" || (entry.elements||entry.random_elements.pool).includes(catalog.skill_atlas[spec.skill_id].element));}}
}
for(const delta of [-5,5]){const lane=buildPilot(stage,{levelOffset:delta});assert.equal(lane.waves[0].entries[0].level,pilot.waves[0].entries[0].level+delta);}
const normal=catalog.species.stone_ape,tank=catalog.species.armored_rhino,ranger=catalog.species.venom_croc;
assert(tank.growth_per_level.hp>normal.growth_per_level.hp&&tank.growth_per_level.def>normal.growth_per_level.def);assert(ranger.growth_per_level.atk>normal.growth_per_level.atk);
console.log('PASS C239: authoritative seed validation, species growth, shared atlas, pilot isolation, exact EXP/count/timing inputs and difficulty levels');

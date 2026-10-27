const assert = require('node:assert/strict');
const fs = require('node:fs');
const {applySpawnFormation, LEADS} = require('../tools/campaign_spawn_formation.cjs');
const read = name => JSON.parse(fs.readFileSync(`${__dirname}/../data/${name}.json`, 'utf8'));
const stages = read('stages'), enemies = read('enemies');
assert.equal(applySpawnFormation(stages, enemies), 0, 'all authored campaign entries have current formation metadata');
const clone = value => JSON.parse(JSON.stringify(value));
const fixture = [{id:'test', arc_id:'arc_frozen_realm', waves:[{entries:[
  {enemy_id:'snow_mage', count:3, interval:1, start_delay:0, modifiers:{hp_mul:2}},
  {enemy_id:'horn_cactus', count:5}, {enemy_id:'frost_wolf', count:2},
  {enemy_id:'snow_skeleton', boss:true, count:1}
]}]}];
const before = clone(fixture);
assert.equal(applySpawnFormation(fixture, enemies), 4);
assert.deepEqual(fixture[0].waves[0].entries.map(e=>e.spawn_role), ['ranger','tanker','fast','boss']);
assert(fixture[0].waves[0].entries.every(e=>e.formation_lead_seconds===LEADS[e.spawn_role]));
assert.equal(applySpawnFormation(fixture, enemies), 0, 'idempotent authoring');
for (const stage of fixture) for (const wave of stage.waves) for (const entry of wave.entries) {
  delete entry.spawn_role;
  delete entry.formation_lead_seconds;
}
assert.deepEqual(fixture, before, 'counts, timing and combat modifiers unchanged');
const admin = [{arc_id:'arc_0',waves:[{entries:[{enemy_id:'dummy_boss'}]}]}];
assert.equal(applySpawnFormation(admin,enemies),0, 'admin untouched');
assert.throws(()=>applySpawnFormation([{arc_id:'arc_2',waves:[{entries:[{enemy_id:'missing'}]}]}],enemies));
const {loadCatalog, buildCatalog, mergeCatalog} = require('../tools/arc6_catalog.cjs');
const catalog = loadCatalog(`${__dirname}/..`);
const regenerated = mergeCatalog(catalog, buildCatalog(catalog));
assert.equal(applySpawnFormation(regenerated.stages, regenerated.enemies), 0, 'Arc6 regeneration retains formation metadata');
console.log('PASS C227: authored roles, boss override, lead times, idempotence, stats/count preservation and admin isolation');

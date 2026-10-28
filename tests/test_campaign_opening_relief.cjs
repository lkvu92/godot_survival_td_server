const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ROLES} = require('../tools/campaign_wave_roles.cjs');
const {getWaveExp} = require('../tools/campaign_wave_exp.cjs');
const {VERSION,WAVE_RULES,applyCampaignOpeningRelief} = require('../tools/campaign_opening_relief.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const stages = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stages.json'), 'utf8'));
const arcs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/arcs.json'), 'utf8'));
const campaignArcIds = new Set(arcs.filter(arc => Number(arc.order) >= 1).map(arc => arc.id));

const synthetic = [{id:'synthetic',arc_id:'arc_2',waves:Array.from({length:4}, (_, index) => ({entries:[
  {enemy_id:'flame_imp',count:5,interval:1,start_delay:0,modifiers:{exp:1}},
  {enemy_id:'flame_imp',count:3,interval:1,start_delay:.42,modifiers:{exp:1}},
  {enemy_id:'pyromancer',count:2,interval:1,start_delay:2.4,modifiers:{exp:1}}
].concat(index === 3 ? [{enemy_id:'boss',boss:true,count:1,interval:1,start_delay:0,modifiers:{exp:1}}] : [])}))}];
assert.equal(applyCampaignOpeningRelief(synthetic), 1);
for (let index = 0; index < 3; index++) {
  const wave = synthetic[0].waves[index];
  const regular = wave.entries.filter(entry => !entry.boss);
  assert.equal(regular.reduce((sum, entry) => sum + entry.count, 0), Math.round(10 * WAVE_RULES[index].count_multiplier));
  assert.equal(wave.entries.filter(entry => entry.boss).length, 0);
  assert.equal(wave.entries.reduce((sum, entry) => sum + entry.count * entry.modifiers.exp, 0), getWaveExp(index + 1));
  assert(regular.every(entry => entry.interval >= WAVE_RULES[index].timing_multiplier));
}
assert.equal(synthetic[0].waves[3].entries.find(entry => entry.boss).count, 1);
const once = clone(synthetic);
assert.equal(applyCampaignOpeningRelief(synthetic), 0);
assert.deepEqual(synthetic, once, 'opening relief is idempotent');

let count = 0, legacyCount = 0;
for (const stage of stages.filter(stage => campaignArcIds.has(stage.arc_id))) {
  count++;
  if (ROLES[stage.arc_id]) legacyCount++;
  assert.equal(stage.campaign_opening_relief_version, VERSION, `${stage.id} must use opening relief`);
  for (const [index, wave] of stage.waves.entries()) {
    assert.equal(wave.entries.reduce((sum, entry) => sum + entry.count * entry.modifiers.exp, 0), getWaveExp(index + 1));
    for (const entry of wave.entries) assert(entry.count > 0 && entry.modifiers.exp > 0);
  }
}
assert.equal(legacyCount, 50, 'original five arcs retained');
assert.equal(count, 70);
assert.equal(applyCampaignOpeningRelief(stages), 0, 'actual data already migrated');
console.log(`PASS C218 opening relief: ${count} stages, first 3 waves paced, boss/EXP/idempotence preserved`);

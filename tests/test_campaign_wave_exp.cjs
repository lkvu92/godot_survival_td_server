const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {getWaveExp, rebalanceWaveExp} = require('../tools/campaign_wave_exp.cjs');
const {ROLES} = require('../tools/campaign_wave_roles.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', `${name}.json`), 'utf8'));

// C153 test fixture keeps the independent server checkout runnable (C120).
// When the sibling client exists, additionally verify its actual implementation.
const requirements = [25, 35, 50, 70, 95, 125, 160, 205, 255, 315, 385, 465, 560, 670, 800, 950, 1120, 1310, 1520];
const playerPath = path.join(__dirname, '../../client/src/actors/Player.gd');
if (fs.existsSync(playerPath)) {
  const player = fs.readFileSync(playerPath, 'utf8');
  assert.deepEqual(JSON.parse(player.match(/const HERO_EXP_REQUIREMENTS := (\[[^\n]+\])/)[1]), requirements, 'sibling Player matches C153 contract fixture');
  assert.match(player, /roundi\(float\(required\) \* 1\.25\)/);
}
let expected = requirements.at(-1);
for (let wave = 1; wave < 50; wave++) {
  if (wave <= requirements.length) expected = requirements[wave - 1];
  else expected = Math.round(expected * 1.25);
  assert.equal(getWaveExp(wave), expected, `runtime EXP threshold at level${wave}`);
}
assert.equal(getWaveExp(20), 1900);
for (const invalid of [0, -1, 1.5, 50, NaN, '1']) assert.throws(() => getWaveExp(invalid));

const expTotal = wave => wave.entries.reduce((sum, entry) => sum + entry.count * entry.modifiers.exp, 0);
const identity = entry => {
  const copy = clone(entry);
  delete copy.count;
  if (copy.modifiers) delete copy.modifiers.exp;
  return JSON.stringify(copy);
};
const groupedCounts = wave => {
  const output = {};
  for (const entry of wave.entries) output[identity(entry)] = (output[identity(entry)] || 0) + entry.count;
  return output;
};
const synthetic = Object.keys(ROLES).map(arc_id => ({
  id: `synthetic_${arc_id}`, arc_id, extra: {preserve: ['metadata']},
  waves: Array.from({length: 20}, (_, index) => ({
    id: `wave_${index + 1}`, boss_skill_entry_indexes: [0], extra: {preserve: index},
    entries: [
      {enemy_id: ROLES[arc_id].grunt, count: 4, interval: 1.2, start_delay: 0.3, modifiers: {exp: 1, atk_mul: 2, nested: {preserve: true}}, marker: 'a'},
      {enemy_id: ROLES[arc_id].grunt, count: 3, interval: 0.8, start_delay: 7, modifiers: {exp: 1, hp_mul: 3}, marker: 'b'},
    ],
  })),
}));
// Boss/minion 75/25 allocation and already-exact wave no-op.
synthetic[0].waves[4].entries[0].boss = true;
synthetic[0].waves[4].entries[0].boss_skill_ids = ['preserved-passive'];
synthetic[0].waves[0].entries = [{enemy_id: ROLES.arc_2.grunt, count: 5, modifiers: {exp: 5}, retained: true}];
synthetic.push({id: 'admin', arc_id: 'arc_0', waves: [{entries: [{enemy_id: 'dummy', count: 1, modifiers: {exp: 987}}]}]});
const original = clone(synthetic);
assert.equal(rebalanceWaveExp(synthetic), 99);
for (let stageIndex = 0; stageIndex < synthetic.length; stageIndex++) {
  const before = original[stageIndex];
  const after = synthetic[stageIndex];
  if (!ROLES[before.arc_id]) { assert.deepEqual(after, before); continue; }
  assert.deepEqual({...after, waves: []}, {...before, waves: []}, 'stage metadata preserved');
  assert.equal(after.waves.length, before.waves.length);
  for (const [index, wave] of after.waves.entries()) {
    const old = before.waves[index];
    assert.equal(expTotal(wave), getWaveExp(index + 1));
    assert.deepEqual({...wave, entries: []}, {...old, entries: []}, 'wave metadata unchanged');
    assert.deepEqual(groupedCounts(wave), groupedCounts(old), 'exact species counts, timing, unknown metadata and all nonEXP modifiers preserved through splits');
    for (const [entryIndex, entry] of old.entries.entries()) assert.equal(identity(wave.entries[entryIndex]), identity(entry), 'primary entry indexes remain stable');
    for (const entry of wave.entries) {
      assert.ok(Number.isInteger(entry.count) && entry.count > 0);
      assert.ok(Number.isInteger(entry.modifiers.exp) && entry.modifiers.exp > 0);
    }
    for (const entry of old.entries) {
      const values = wave.entries.filter(part => identity(part) === identity(entry)).map(part => part.modifiers.exp);
      assert.ok(Math.max(...values) - Math.min(...values) <= 1, 'split allocations differ by at most one integer EXP');
    }
  }
}
assert.deepEqual(synthetic[0].waves[0], original[0].waves[0], 'already-correct waves untouched');
const bossWave = synthetic[0].waves[4];
assert.equal(bossWave.entries.filter(entry => entry.boss).reduce((sum, entry) => sum + entry.count * entry.modifiers.exp, 0), Math.round(getWaveExp(5) * 0.75));
const once = clone(synthetic);
assert.equal(rebalanceWaveExp(synthetic), 0);
assert.deepEqual(synthetic, once, 'idempotence');

const stages = read('stages');
const levels = read('stage_levels');
let stageCount = 0;
let waveCount = 0;
let combinations = 0;
for (const stage of stages.filter(candidate => ROLES[candidate.arc_id])) {
  stageCount++;
  const roles = ROLES[stage.arc_id];
  for (const mode of ['normal', 'epic', 'legend']) {
    assert.ok(levels.some(level => level.stage_id === stage.id && level.level_id === mode));
    combinations++;
    let level = 1;
    let carriedExp = 0;
    for (const [index, wave] of stage.waves.entries()) {
      if (mode === 'normal') waveCount++;
      assert.equal(expTotal(wave), getWaveExp(index + 1), `${stage.id}/${mode}/wave${index + 1}`);
      for (const entry of wave.entries) {
        assert.ok(Number.isInteger(entry.modifiers.exp) && entry.modifiers.exp > 0);
        assert.ok(entry.boss || index >= 3 || entry.enemy_id !== roles.rusher, 'rusher gate preserved');
        assert.ok(entry.boss || index >= 6 || entry.enemy_id !== roles.tanker, 'tanker gate preserved');
        for (let kill = 0; kill < entry.count; kill++) {
          carriedExp += entry.modifiers.exp;
          while (carriedExp >= getWaveExp(level)) { carriedExp -= getWaveExp(level); level++; }
        }
      }
      assert.equal(level, index + 2, 'one level per complete wave');
      assert.equal(carriedExp, 0, 'zero excess EXP');
    }
  }
}
assert.equal(stageCount, 50);
assert.equal(waveCount, 881);
assert.equal(combinations, 150);
const actualBefore = clone(stages);
assert.equal(rebalanceWaveExp(stages), 0, 'seed already exact');
assert.deepEqual(stages, actualBefore);
console.log(`PASS C153 exact wave EXP: ${stageCount} stages, ${waveCount} waves, ${combinations} modes; runtime rounding, per-kill simulation, split preservation`);

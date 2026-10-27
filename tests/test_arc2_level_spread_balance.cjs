const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ARC_ID, factorForStage, applyArc2LevelSpread} = require('../tools/arc2_level_spread_balance.cjs');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const arcs = read('arcs'), stages = read('stages'), levels = read('stage_levels');
const arc = arcs.find(row => row.id === ARC_ID);
assert.equal(applyArc2LevelSpread(arcs, stages, levels), 0, 'authored data already migrated');
assert.equal(applyArc2LevelSpread(arcs, stages, levels), 0, 'migration remains idempotent');
for (const [index, id] of arc.stage_ids.entries()) {
  const stage = stages.find(row => row.id === id);
  assert.equal(stage.stage_rules.arc2_level_spread_balance_version, 2);
  assert.equal(stage.stage_rules.arc2_stat_correction, factorForStage(index));
  assert.equal(stage.stage_rules.target_normal_hero_level, 10 + index);
  for (const wave of stage.waves) for (const entry of wave.entries) {
    for (const key of ['hp_mul','atk_mul','def_mul']) assert(Number.isFinite(entry.modifiers[key]) && entry.modifiers[key] > 0, `${id} ${key}`);
  }
  for (const row of levels.filter(level => level.stage_id === id)) assert.equal(row.stage_rules.recommendation_status, 'STALE_ARC2_LEVEL_SPREAD_V1');
}
const pendingStages = clone(stages), pendingLevels = clone(levels);
for (const id of arc.stage_ids) {
  const stage = pendingStages.find(row => row.id === id);
  delete stage.stage_rules.arc2_level_spread_balance_version;
  delete stage.stage_rules.arc2_stat_correction;
  delete stage.stage_rules.target_normal_hero_level;
}
assert.equal(applyArc2LevelSpread(arcs, pendingStages, pendingLevels), 10);
assert.equal(applyArc2LevelSpread(arcs, pendingStages, pendingLevels), 0);
console.log('PASS C218 Arc2 Lv10..19 curve and idempotent 0.45..0.85 correction');

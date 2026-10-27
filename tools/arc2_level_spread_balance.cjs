/* C218 v2.4.0: one-time, idempotent Arc 2 Lv10..19 pressure recurve. */
const fs = require('node:fs');
const path = require('node:path');

const ARC_ID = 'arc_frozen_realm';
const VERSION = 2;
const round = value => Math.round(Number(value) * 1e6) / 1e6;
const factorForStage = index => round(0.45 + 0.40 * index / 9);

function applyArc2LevelSpread(arcs, stages, stageLevels = []) {
  const arc = arcs.find(row => row.id === ARC_ID);
  if (!arc || !Array.isArray(arc.stage_ids) || arc.stage_ids.length !== 10) throw Error('Arc 2 must contain exactly 10 stages');
  let changed = 0;
  for (const [index, stageId] of arc.stage_ids.entries()) {
    const stage = stages.find(row => row.id === stageId);
    if (!stage) throw Error(`Missing Arc 2 stage ${stageId}`);
    const rules = stage.stage_rules || {};
    if (Number(rules.arc2_level_spread_balance_version) >= VERSION) continue;
    const factor = factorForStage(index);
    const priorFactor = Number(rules.arc2_stat_correction || 1);
    const migrationRatio = factor / priorFactor;
    for (const wave of stage.waves || []) for (const entry of wave.entries || []) {
      const modifiers = entry.modifiers || (entry.modifiers = {});
      for (const key of ['hp_mul', 'atk_mul', 'def_mul']) {
        if (!Number.isFinite(Number(modifiers[key]))) throw Error(`${stageId}/${wave.id || wave.wave_id}/${entry.enemy_id} missing ${key}`);
        modifiers[key] = round(Number(modifiers[key]) * migrationRatio);
      }
    }
    stage.stage_rules = {...rules, arc2_level_spread_balance_version:VERSION, arc2_stat_correction:factor, target_normal_hero_level:10+index};
    for (const row of stageLevels.filter(level => level.stage_id === stageId)) {
      row.stage_rules = {...(row.stage_rules || {}), recommendation_status:'STALE_ARC2_LEVEL_SPREAD_V1'};
    }
    changed++;
  }
  return changed;
}

if (require.main === module) {
  const mode = process.argv[2];
  if (!['--check','--write'].includes(mode) || process.argv.length !== 3) throw Error('Use --check or --write');
  const root = path.join(__dirname, '..');
  const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
  const arcs = read('arcs'), stages = read('stages'), levels = read('stage_levels');
  const changed = applyArc2LevelSpread(arcs, stages, levels);
  if (mode === '--write' && changed) {
    fs.writeFileSync(path.join(root, 'data', 'stages.json'), JSON.stringify(stages, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'data', 'stage_levels.json'), JSON.stringify(levels, null, 2) + '\n');
  }
  console.log(`${mode === '--check' && changed ? 'FAIL' : 'PASS'} C218 Arc2 level spread: ${changed} stages ${mode === '--write' ? 'updated' : 'pending'}; factors=0.45..0.85`);
  if (mode === '--check' && changed) process.exitCode = 1;
}

module.exports = {ARC_ID, VERSION, factorForStage, applyArc2LevelSpread};

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../tools/campaign_pressure_engine.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', `${name}.json`), 'utf8'));
const catalog = {arcs:read('arcs'),stages:read('stages'),stageLevels:read('stage_levels'),heroes:read('heroes'),skills:read('skills'),enemies:read('enemies'),profiles:read('campaign_pressure_profiles')};

assert(engine.validProfiles(catalog.profiles, catalog.arcs));
assert(!engine.validProfiles({...catalog.profiles, profiles:catalog.profiles.profiles.slice(1)}, catalog.arcs));
assert.equal(engine.pressurePhase(0).id, 'opening');
assert.equal(engine.pressurePhase(.5).id, 'mid');
assert.equal(engine.pressurePhase(1).id, 'final');
assert(engine.stageBudget(catalog.profiles.profiles[0], 9, 10) > engine.stageBudget(catalog.profiles.profiles[0], 0, 10));
assert.equal(engine.requirement(1), 25);
assert.equal(engine.requirement(20), 1900);

const report = engine.analyzeCatalog({...catalog,difficultyId:'normal'});
assert.equal(report.results.filter(result => !result.stage_id.startsWith('stage_6_')).length, 150, 'original 50 campaign stages × P25/P50/P75');
assert.equal(report.results.filter(result => result.stage_id.startsWith('stage_6_')).length, 30, 'Arc 6 ten stages × P25/P50/P75');
assert.equal(report.results.length, 180, '60 campaign stages × P25/P50/P75');
for (const result of report.results) {
  assert(result.waves.length > 0, `${result.stage_id} has waves`);
  for (const wave of result.waves) {
    assert(wave.enemy_count > 0);
    assert(wave.total_ehp > 0);
    assert(wave.clear_time >= 0);
    assert(wave.allowed_clear_time > 0);
    assert(wave.survival_budget > 0);
    assert(Number.isFinite(wave.wave_pressure));
    assert.equal(wave.model, 'analytical_single_target_neutral_v1');
  }
}
const target = report.results.find(result => result.stage_id === 'stage_1_03' && result.card_quantile === .12);
assert(target, 'Arc 2 Stage 3 P50 lane is benchmarked');
assert.equal(target.waves[0].phase, 'opening');
assert.equal(target.waves.at(-1).phase, 'final');
assert.throws(() => engine.buildProposals(catalog), /DEPRECATED_INVALID_MODEL/, 'invalid analytical factors cannot become recommendations');
const rerun = engine.analyzeCatalog({...catalog,difficultyId:'normal'});
assert.deepEqual(rerun, report, 'analytical report is deterministic and read-only');
console.log(`PASS C218 pressure engine: ${report.results.length} neutral lanes across all campaign arcs; stage_1_03 P50 benchmarked`);

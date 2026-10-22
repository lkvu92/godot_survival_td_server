const fs = require('fs'), vm = require('vm'), assert = require('assert');
const clone = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '../nakama/data/modules/build/progression_rpc.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '../nakama/data/modules/build/sweep_rpc.js'), 'utf8'), context);
// Isolate settlement from unrelated cultivation, unlock and event systems.
vm.runInContext(`
progressionMigrate = () => {};
cultivationEnsureProfile = () => {};
cultivationEnsurePreview = () => {};
progressionReconcileLevelUnlocks = () => {};
progressionMaxStageBaseExp = () => 1000;
progressionCompleteStage = (_nk, p, stage_id, level_id) => {
  p.completed_stage_levels = p.completed_stage_levels || [];
  if (!p.completed_stage_levels.some(e => e.stage_id === stage_id && e.level_id === level_id))
    p.completed_stage_levels.push({stage_id, level_id});
};
eventRecord = () => {};
`, context);
const award = vm.runInContext('awardStageProgression', context);
let db, version = 0, conflict = false, stageId = 'stage_1_1', arcId = 'arc_1', goldReward = 0;
function row(collection, key, value) {
  db[collection] = {collection, key, value: clone(value), version: String(++version)};
}
const nk = {
  storageRead(reads) { return reads.map(r => db[r.collection]).filter(Boolean).map(clone); },
  storageWrite(writes) {
    if (conflict) throw Error('version conflict');
    for (const w of writes) assert.equal(w.version, db[w.collection].version);
    for (const w of writes) row(w.collection, w.key, w.value);
  },
  sqlQuery(sql) {
    if (sql.includes('exp_weight')) return [{exp_weight: 1.1, is_boss: false, arc_id: arcId}];
    if (sql.includes('exp_multiplier')) return [{exp_multiplier: 1.25, gold_reward: goldReward, loot_table: [], boss_loot_table: []}];
    return [];
  }
};
context.parseJsonb = x => x;
context.getRemoteConfigValue = (_nk, _key, field, fallback) => field==='stage_sweep'?clone(vm.runInContext('SWEEP_DEFAULTS',context)):fallback;
context.serverGrantInventoryItem=(_nk,items,item_id,quantity)=>{items.push({item_id,quantity});return true;};
function run(id, difficulty = 'normal') {
  row('player_stage_runs', 'active', {run_id: id, status: 'active', stage_id: stageId, difficulty_id: difficulty, expires_at_ms: Date.now() + 60000});
}
function reset(completed = []) {
  db = {}; conflict = false;
  row('player_profiles', 'main', {level: 1, exp: 0, completed_stage_levels: completed});
  row('player_heroes', 'states', {heroes: [{hero_id: 'hero', owned: true, level: 1, exp: 0}]});
  row('player_inventory', 'items', {items: []});
  run('one');
}
function settle(id, won = true, difficulty = 'normal', base_exp = 101) {
  return JSON.parse(award({userId: 'u'}, {}, nk, JSON.stringify({stage_id: stageId, difficulty_id: difficulty, hero_id: 'hero', run_id: id, won, base_exp,objective_hp_ratio:1})));
}
reset();
let result = settle('one');
assert(result.success && result.first_clear);
assert.equal(result.first_clear_bonus_exp, 139);
assert.equal(result.exp_awarded, 278);
assert.equal(result.profile.exp, 278);
assert.equal(result.hero.exp, 278);
assert.equal(result.profile.next_level_exp, 5000);
assert.equal(db.player_profiles.value.completed_stage_levels.length, 1);
assert.equal(settle('one').success, false);
run('two'); result = settle('two');
assert(!result.first_clear); assert.equal(result.exp_awarded, 139); assert.equal(result.first_clear_bonus_exp, 0);
run('epic', 'epic'); result = settle('epic', true, 'epic');
assert(result.first_clear); assert.equal(result.exp_awarded, 278);
reset(); result = settle('one', false);
assert(!result.first_clear); assert.equal(result.exp_awarded, 139);
assert.equal(db.player_profiles.value.completed_stage_levels.length, 0);
run('after-loss'); assert(settle('after-loss').first_clear);
reset(); db.player_profiles.value.gameplay_boosts={exp:{multiplier:1.5,expires_at_ms:Date.now()+60000}};
result = settle('one');
assert.equal(result.exp_awarded, 417);
assert.equal(result.first_clear_bonus_exp, 209);
assert.equal(result.profile.exp, 417);
reset(); goldReward = 101; db.player_profiles.value.gameplay_boosts={gold:{multiplier:1.25,expires_at_ms:Date.now()+60000}};
result = settle('one');
assert.equal(result.loot.find(reward => reward.resource_id === 'gold').quantity, 126);
goldReward = 0;
reset([{stage_id: 'stage_1_1', level_id: 'normal'}]);
assert(!settle('one').first_clear);
reset(); conflict = true;
assert.throws(() => settle('one'), /version conflict/);
assert.equal(db.player_profiles.value.exp, 0);
assert.equal(db.player_profiles.value.completed_stage_levels.length, 0);
conflict = false; assert(settle('one').first_clear);
reset(); result = settle('one', true, 'normal', 0);
assert(result.first_clear); assert.equal(result.exp_awarded, 0);
for (const training of [{stage: 'stage_0_1', arc: 'arc_0'}, {stage: 'stage_0_1', arc: 'arc_1'}, {stage: 'arena_fixture', arc: 'arc_0'}]) {
  stageId = training.stage; arcId = training.arc;
  for (const won of [true, false]) {
    reset();
    db.player_profiles.value.exp = 123;
    db.player_heroes.value.heroes[0].exp = 45;
    for (const id of ['one', 'repeat']) {
      if (id !== 'one') run(id);
      result = settle(id, won, 'normal', 999);
      assert(result.success);
      assert.equal(result.exp_awarded, 0);
      assert.equal(result.first_clear_bonus_exp, 0);
      assert.equal(result.profile.exp, 123);
      assert.equal(result.hero.exp, 45);
      assert.equal(db.player_profiles.value.exp, 123);
      assert.equal(db.player_heroes.value.heroes[0].exp, 45);
      assert.equal(db.player_stage_runs.value.status, 'settled');
      assert.equal(settle(id, won).success, false);
    }
  }
}
console.log('PASS first-clear EXP: normal first/repeat/difficulty/loss/replay/conflict, active EXP boost; training victory/defeat/repeat grant zero User/Hero EXP');

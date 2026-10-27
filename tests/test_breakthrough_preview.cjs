// C110: shared EXP grants must return a ready dialog without login repair.
const fs = require('node:fs'), path = require('node:path');
const vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const context = vm.createContext({});
for (const file of ['config_rpc', 'progression_rpc', 'resource_rpc']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'nakama/data/modules/build', file + '.js'), 'utf8'), context);
}
const fn = name => vm.runInContext(name, context);
const progression = JSON.parse(fs.readFileSync(path.join(root, 'data/progression.json'), 'utf8'));
context.parseJsonb = value => typeof value === 'string' ? JSON.parse(value) : value;
context.getRemoteConfigValue = (_nk, _module, _key, fallback) => fallback;
const nk = {sqlQuery(sql) {
  if (sql.includes('game_config')) return [{value: progression}];
  throw Error('Unexpected SQL: ' + sql);
}};
for (const level of [9, 19, 29, 39, 49, 59, 69]) {
  const threshold = fn('progressionNextUserExp')(nk, level);
  const profile = {level, exp: threshold - 1, talent_tier: 'ha_pham', main_element: 'metal',
    element_affinities: {metal: 5, water: 5, wood: 5, fire: 5, earth: 5},
    breakthrough: fn('cultivationDefaultBreakthrough')()};
  fn('progressionApplyUser')(nk, profile, 0);
  assert.equal(profile.breakthrough.count_rolled, false, 'No premature preview');
  fn('progressionApplyUser')(nk, profile, 1);
  assert.equal(profile.level, level);
  assert.equal(profile.exp, threshold);
  assert.equal(profile.breakthrough.milestone_level, level);
  assert.equal(profile.breakthrough.count_rolled, true);
  assert(profile.breakthrough.tribulation_count >= 1 && profile.breakthrough.tribulation_count <= 9);
  assert(profile.breakthrough.attempts_left > 0);
  profile.breakthrough.attempts_left = 2;
  profile.breakthrough.encounter_id = 'preserved';
  const state = JSON.stringify(profile.breakthrough);
  fn('progressionApplyUser')(nk, profile, 1000);
  assert.equal(JSON.stringify(profile.breakthrough), state, 'Extra EXP must not reset attempts or reroll');
}
// Also cover leveling into a milestone in a single reward, as sweeps do.
const profile = {level: 8, exp: 0, element_affinities: {}, breakthrough: fn('cultivationDefaultBreakthrough')()};
fn('progressionApplyUser')(nk, profile,
  fn('progressionNextUserExp')(nk, 8) + fn('progressionNextUserExp')(nk, 9));
assert.equal(profile.level, 9);
assert.equal(profile.breakthrough.milestone_level, 9);
assert.equal(profile.breakthrough.count_rolled, true);
console.log('PASS C110 immediate breakthrough preview: all seven milestones, crossing level, no early roll, preserved attempts/encounter on repeated EXP');

// Existing level-50 accounts resume progression; global maximum consumes no EXP.
const resumed = {level:50,exp:0,element_affinities:{},breakthrough:fn('cultivationDefaultBreakthrough')()};
fn('progressionApplyUser')(nk,resumed,fn('progressionNextUserExp')(nk,50));
assert.equal(resumed.level,51);
const maxed = {level:70,exp:12345,element_affinities:{},breakthrough:fn('cultivationDefaultBreakthrough')()};
fn('progressionApplyUser')(nk,maxed,999999);
assert.equal(maxed.level,70);assert.equal(maxed.exp,0);assert.equal(maxed.next_level_exp,0);
assert(fn('progressionNextHeroExp')(nk,69)>0);assert.equal(fn('progressionNextHeroExp')(nk,70),0);
console.log('PASS C225: level 50 resumes, level 69 threshold and level 70 EXP cap');

// C237: exercise compiled production reward/unlock functions, not a mirrored model.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
function runtime() {
  const context = vm.createContext({});
  for (const file of ['progression_rpc', 'sweep_rpc', 'config_rpc']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'nakama/data/modules/build', file + '.js'), 'utf8'), context);
  }
  context.parseJsonb = value => typeof value === 'string' ? JSON.parse(value) : value;
  context.getRemoteConfigValue = (_nk, _module, key, fallback) => key === 'stage_sweep'
    ? clone(vm.runInContext('SWEEP_DEFAULTS', context))
    : key === 'tower_sweep' ? clone(vm.runInContext('TOWER_SWEEP_DEFAULTS', context)) : fallback;
  return {context, fn: name => vm.runInContext(name, context)};
}
const {context, fn} = runtime();
const arc = 'arc_van_yeu_co_linh';
const elements = ['metal', 'water', 'wood', 'fire', 'earth'];
// Unequal catalog counts must still yield equal element probabilities in Arc 7.
const talismans = elements.flatMap((element, i) => Array.from({length: i === 0 ? 2 : 1}, (_, j) => ({id: i * 10 + j + 1, element})));
const rewardNk = {sqlQuery(sql) {
  if (sql.includes('FROM game_arcs')) return [{element: 'earth'}];
  if (sql.includes('FROM game_talismans')) return clone(talismans);
  throw Error('Unexpected SQL: ' + sql);
}};
const level = {level_id: 'legend', gold_reward: 100, loot_table: [], boss_loot_table: []};
const stage = {id: 'stage_7_10', arc_id: arc, is_boss: true};
const table = fn('sweepRewardTable')(rewardNk, stage.id, 'legend', stage, level, 'S');
const fragments = table.filter(row => row.group === 'fragment');
assert.equal(fragments.length, talismans.length * 2);
assert(Math.abs(fragments.reduce((sum, row) => sum + row.weight, 0) - 1) < 1e-12);
for (const element of elements) {
  const ids = talismans.filter(row => row.element === element).map(row => 'talisman_fragment_' + row.id);
  const weight = fragments.filter(row => ids.includes(row.item_id)).reduce((sum, row) => sum + row.weight, 0);
  assert(Math.abs(weight - 0.2) < 1e-12, 'Arc 7 fragment pool gives each element 20%');
}
assert(fragments.every(row => row.group_drop_rate === 0.7 && row.quantity === 3));
const preview = fn('stageCompletionLoot')(rewardNk, stage, level);
assert(Math.abs(preview.filter(row => row.group === 'fragment').reduce((sum, row) => sum + row.drop_rate, 0) - 0.7) < 1e-12);
assert.equal(preview.find(row => row.item_id === 'tower_sweep_ticket').drop_rate, 0.1);
for (const mode of ['normal', 'epic']) {
  assert(!fn('sweepRewardTable')(rewardNk, stage.id, mode, stage, {...level, level_id: mode}, 'S').some(row => row.group === 'fragment'));
}
for (const other of [{...stage, id: 'stage_7_05'}, {...stage, is_boss: false}, {...stage, id: 'stage_8_10'}]) {
  assert(!fn('stageCompletionLoot')(rewardNk, other, level).some(row => row.group === 'fragment' || row.item_id === 'tower_sweep_ticket'));
}
// All five old finals retain the original 75/25 main/other affinity distribution.
for (let index = 1; index <= 5; index++) {
  const oldStage = {...stage, id: `stage_${index}_10`, arc_id: 'legacy_arc'};
  const old = fn('sweepRewardTable')(rewardNk, oldStage.id, 'legend', oldStage, level, 'S').filter(row => row.group === 'fragment');
  const earthIds = talismans.filter(row => row.element === 'earth').map(row => 'talisman_fragment_' + row.id);
  assert(Math.abs(old.filter(row => earthIds.includes(row.item_id)).reduce((sum, row) => sum + row.weight, 0) - 0.75) < 1e-12);
}
// Arc 7 also requires its configured minimum account level.
const arcs = [{id: 'arc_ngu_to_quy_khu', sort_order: 6, level_min:51}, {id: arc, sort_order: 7, level_min:61}];
const stages = [{id: 'stage_6_10', arc_id: arcs[0].id, sort_order: 10}, ...Array.from({length: 10}, (_, i) => ({id: `stage_7_${String(i + 1).padStart(2, '0')}`, arc_id: arc, sort_order: i + 1}))];
const rows = stages.flatMap(row => ['normal', 'epic', 'legend'].map(level_id => ({stage_id: row.id, arc_id: row.arc_id, level_id})));
const unlockNk = {sqlQuery(sql, args) {
  if (sql.includes('SELECT id, level_min, sort_order FROM game_arcs')) return clone(arcs);
  if (sql.includes('AS stage_id')) return clone(rows);
  if (sql.includes('FROM game_stages WHERE id')) return clone(stages.filter(row => row.id === args[0]));
  if (sql.includes('FROM game_stages WHERE arc_id')) return clone(stages.filter(row => row.arc_id === args[0] && (!sql.includes('sort_order >') || row.sort_order > args[1])).slice(0, 1));
  if (sql.includes('FROM game_arcs WHERE id')) return clone(arcs.filter(row => row.id === args[0]));
  if (sql.includes('FROM game_arcs WHERE sort_order >')) return clone(arcs.filter(row => row.sort_order > args[0]).slice(0, 1));
  throw Error('Unexpected unlock SQL: ' + sql);
}};
const profile = {level: 61, unlocked_arcs: [arcs[0].id], unlocked_stages: [{stage_id: 'stage_6_10', unlocked_levels: ['normal']}], completed_stage_levels: []};
fn('progressionCompleteStage')(unlockNk, profile, 'stage_6_10', 'normal');
assert(profile.unlocked_arcs.includes(arc));
assert(profile.unlocked_stages.some(row => row.stage_id === 'stage_7_01'));
assert.equal(profile.level, 61);
const underLevel = {level:60, completed_stage_levels:[{stage_id:'stage_6_10',level_id:'normal'}]};
fn('progressionReconcileCampaignUnlocks')(unlockNk, underLevel);
assert(!underLevel.unlocked_arcs.includes(arc));
assert(!fn('progressionArcModeAllowed')(unlockNk, profile, 'stage_7_01', 'epic'));
for (const row of stages.filter(row => row.arc_id === arc)) fn('progressionCompleteStage')(unlockNk, profile, row.id, 'normal');
assert(fn('progressionArcModeAllowed')(unlockNk, profile, 'stage_7_01', 'epic'));
assert(!fn('progressionArcModeAllowed')(unlockNk, profile, 'stage_7_01', 'legend'));
for (const row of stages.filter(row => row.arc_id === arc)) fn('progressionCompleteStage')(unlockNk, profile, row.id, 'epic');
assert(fn('progressionArcModeAllowed')(unlockNk, profile, 'stage_7_01', 'legend'));
const historical = {level: 61, completed_stage_levels: [{stage_id: 'stage_6_10', level_id: 'normal'}]};
assert(fn('progressionReconcileCampaignUnlocks')(unlockNk, historical));
assert(historical.unlocked_arcs.includes(arc));
assert(!fn('progressionReconcileCampaignUnlocks')(unlockNk, historical), 'Reconciliation is idempotent');

// Ordinary settlement must actually grant the final-boss ticket, not just show it.
const settlement = runtime();
vm.runInContext(`
  progressionMigrate=()=>{};cultivationEnsureProfile=()=>{};cultivationEnsurePreview=()=>{};
  progressionReconcileLevelUnlocks=()=>{};progressionCompleteStage=()=>{};
  progressionMaxStageBaseExp=()=>100;progressionNextHeroExp=()=>0;
  progressionApplyUser=(_nk,p)=>({level:p.level});eventRecord=()=>{};
  Math.random=()=>0.01;
`, settlement.context);
settlement.context.serverGrantInventoryItem = (_nk, items, item_id, quantity) => { items.push({item_id, quantity}); return true; };
for (const [stageId, isBoss, expectTicket] of [['stage_7_10', true, true], ['stage_7_05', true, false], ['stage_7_10', false, false]]) {
  const db = Object.fromEntries([
    ['player_profiles', {level: 50, resources: {}}],
    ['player_heroes', {heroes: [{hero_id: 'hero_1', owned: true, level: 50, exp: 0}]}],
    ['player_inventory', {items: []}],
    ['player_stage_runs', {run_id: 'arc7-test', status: 'active', stage_id: stageId, difficulty_id: 'normal', expires_at_ms: Date.now() + 60000}]
  ].map(([collection, value]) => [collection, {collection, value, version: 'v1'}]));
  const nk = {
    storageRead: refs => refs.map(ref => clone(db[ref.collection])),
    storageWrite: writes => { for (const write of writes) db[write.collection] = clone(write); },
    sqlQuery(sql) {
      if (sql.includes('FROM game_stages')) return [{exp_weight: 1, arc_id: arc, is_boss: isBoss}];
      if (sql.includes('FROM game_stage_levels')) return [{exp_multiplier: 1, gold_reward: 1, loot_table: [], boss_loot_table: []}];
      return [];
    }
  };
  const response = JSON.parse(settlement.fn('awardStageProgression')({userId: 'u'}, {}, nk, JSON.stringify({stage_id: stageId, difficulty_id: 'normal', hero_id: 'hero_1', run_id: 'arc7-test', won: true, base_exp: 0, objective_hp_ratio: 1})));
  assert(response.success, JSON.stringify(response));
  assert.equal(response.loot.some(row => row.item_id === 'tower_sweep_ticket'), expectTicket);
  assert.equal(db.player_inventory.value.items.some(row => row.item_id === 'tower_sweep_ticket'), expectTicket);
  assert.equal(response.stage_reward.total_loot.some(row => row.item_id === 'tower_sweep_ticket'), expectTicket, 'Final result summary must retain the granted tower ticket');
  const savedRun = db.player_stage_runs.value;
  savedRun.stage_reward.claimed = true;
  savedRun.stage_reward.multiplier = 2;
  const doubled = settlement.fn('stageRewardSummary')(savedRun);
  const ticket = doubled.total_loot.find(row => row.item_id === 'tower_sweep_ticket');
  assert.equal(ticket?.quantity || 0, expectTicket ? 1 : 0, 'Ad summary must not double fixed ticket grants');
}
console.log('PASS C237 backend: equal-element rewards, tickets, Lv61 gate, below-level denial and difficulty reconciliation');

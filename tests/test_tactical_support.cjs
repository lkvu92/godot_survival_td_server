const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
const cards = read('cards'), tower = read('trial_tower'), effects = read('effects');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'nakama/data/modules/build/progression_rpc.js'), 'utf8'), ctx);
const run = (fn, ...args) => ctx[fn](...args);
const expected = {
  deep_wound: ['deep_wound_reduction', [0.1, 0.2, 0.3]],
  effect_accuracy: ['effect_accuracy', [0.1, 0.15, 0.2]],
  effect_resistance: ['harmful_effect_resistance', [0.1, 0.15, 0.2]],
  control_tenacity: ['control_duration_reduction', [0.1, 0.2, 0.3]],
  healing_power: ['healing_received_bonus', [0.1, 0.2, 0.3]]
};
for (const [family, [stat, values]] of Object.entries(expected)) {
  const rows = cards.filter(c => c.support_family === family);
  assert.equal(rows.length, 3, `${family} has exactly three tiers`);
  assert.deepEqual(rows.map(c => c.tier), ['common', 'rare', 'legendary']);
  assert.deepEqual(rows.map(c => c.effect.value), values);
  assert.deepEqual(rows.map(c => c.min_hero_level), [1, 11, 16]);
  assert.deepEqual(rows.map(c => c.selection_weight), [70, 20, 10]);
  const levels = {};
  for (const card of rows) {
    assert.equal(card.effect.stat, stat);
    const draft = tower.preparation.supports.find(c => c.id === card.id);
    assert(draft && draft.description && draft.rarity === card.rarity);
    assert.deepEqual(draft.effect, card.effect, 'Campaign and tower share authored values');
    assert(run('towerSupportValid', draft));
    assert(run('towerDraftLegal', draft, levels));
    run('towerDraftApply', draft, levels);
    assert(!run('towerDraftLegal', draft, levels), 'Same tier cannot be stacked');
    assert(!run('towerDraftLegal', tower.preparation.supports.find(c => c.id === rows[0].id), levels), 'Weaker tier cannot replace stronger');
  }
  const invalid = structuredClone(tower.preparation.supports.find(c => c.id === rows[0].id));
  invalid.effect.stat = 'atk';
  assert(!run('towerSupportValid', invalid), 'Invalid family/stat rejected before issuing run');
}
assert(tower.preparation.supports.every(c => run('towerSupportValid', c)));
const wound = effects.find(e => e.id === 'deep_wound');
assert(wound && wound.is_harmful && wound.stack_mode === 'replace_stronger' && wound.default_props.duration === 4);
assert.equal(wound.ui_icon_id, 'deep_wound');
assert.equal(wound.icon_frame, undefined, 'Wound must not borrow the old bleeding frame');
// Existing ordinary tower supports retain repeatable behavior.
const atk = tower.preparation.supports.find(c => c.id === 'tower_atk');
const levels = {};
run('towerDraftApply', atk, levels);
assert(run('towerDraftLegal', atk, levels));
// Exercise the actual authoritative preparation RPC and immutable retry.
ctx.cpObject = value => value || {};
let writes = 0;
let active;
const nk = {
  storageRead: () => [{value: structuredClone(active), version: 'fixture'}],
  storageWrite: rows => { writes++; active = structuredClone(rows[0].value); }
};
const reset = () => {
  writes = 0;
  active = {run_id: 'tactical-run', stage_id: 'stage_trial_tower', status: 'active',
    phase: 'preparing', skill_unlock_version: 5, expires_at_ms: Date.now() + 60000,
    demon_skill_levels: {}, demon_draft_catalog: tower.preparation.supports, skill_levels: {}, draft_catalog: tower.preparation.supports};
};
const prepare = picks => JSON.parse(ctx.prepareTrialTower({userId: 'u'}, {}, nk, JSON.stringify({run_id: 'tactical-run', picks})));
reset();
let picks = ['effect_accuracy_legendary', 'effect_accuracy_common', ...Array(17).fill('tower_atk')];
assert.equal(prepare(picks).code, 'INVALID_BUILD');
assert.equal(writes, 0, 'Downgrade rejected without mutation');
reset();
picks = ['effect_accuracy_common', 'effect_accuracy_common', ...Array(17).fill('tower_atk')];
assert.equal(prepare(picks).code, 'INVALID_BUILD');
assert.equal(writes, 0, 'Equal tier rejected without mutation');
reset();
picks = ['effect_accuracy_common', 'effect_accuracy_rare', 'effect_accuracy_legendary', ...Array(16).fill('tower_atk')];
assert(prepare(picks).success);
assert.equal(writes, 1);
assert.equal(active.phase, 'countdown');
assert.equal(active.demon_picks.length, 19);
assert(prepare(picks).success);
assert.equal(writes, 1, 'Identical confirmed build is immutable on retry');
console.log('PASS tactical support server: five families/three tiers, campaign/tower parity, authority validation and strongest-tier legality');

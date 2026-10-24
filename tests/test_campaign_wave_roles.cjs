const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ROLES, applyWaveRoleRules} = require('../tools/campaign_wave_roles.cjs');

const clone = value => JSON.parse(JSON.stringify(value));
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', `${name}.json`), 'utf8'));
const expectedRoles = {
  arc_2: {grunt: 'flame_imp', rusher: 'magma_hound', tanker: 'lava_brute'},
  arc_frozen_realm: {grunt: 'snow_skeleton', rusher: 'frost_wolf', tanker: 'horn_cactus'},
  arc_verdant_realm: {grunt: 'spore_crawler', rusher: 'venom_spider', tanker: 'ent_protector'},
  arc_iron_bastion: {grunt: 'steam_automaton', rusher: 'clockwork_spider', tanker: 'shield_sentinel'},
  arc_titan_realm: {grunt: 'amber_spirit', rusher: 'sand_stalker', tanker: 'granite_colossus'},
};
assert.deepEqual(ROLES, expectedRoles, 'authored role mapping for all five arcs');

// C179: tank HP is constrained against its own arc's standard grunt. Account
// for a spawn-time max-HP buff so the player-facing value stays in range too.
const enemyById = new Map(read('enemies').map(enemy => [enemy.id, enemy]));
const amber=enemyById.get('amber_spirit'),wraith=enemyById.get('primordial_wraith');
assert(amber && wraith,'Amber is spawnable while wraith remains available for separate content');
for(const key of ['hp','atk','def','move_speed','attack_speed','crit_rate','crit_damage'])
  assert.equal(amber.attributes[key],wraith.attributes[key],`Amber preserves grunt ${key} budget`);
assert.deepEqual(amber.reward,wraith.reward);
assert.deepEqual(amber.generic_skills.map(s=>s.params),wraith.generic_skills.map(s=>s.params));
assert.equal(amber.attack_skill.type,'earth_orb');
assert.equal(amber.attack_skill.detonation_delay,0.5);
assert.equal(amber.attack_skill.damage_multiplier,1);
assert(!amber.boss_skills?.length && !amber.is_boss,'Amber must never inherit wraith boss skills');
const arc5Roster=new Set(['granite_colossus','sand_stalker','seismic_shaman','amber_spirit']);
const actualArc5Ids=new Set();
for(const stage of read('stages').filter(s=>s.arc_id==='arc_titan_realm'))
  for(const wave of stage.waves)for(const entry of wave.entries){
    assert.notEqual(entry.enemy_id,'primordial_wraith','No wraith in any Arc 5 stage');
    if(!entry.boss){assert(arc5Roster.has(entry.enemy_id));actualArc5Ids.add(entry.enemy_id);}
  }
assert.deepEqual(actualArc5Ids,arc5Roster,'Exactly four authored Arc 5 creeps');
for (const [arcId, roles] of Object.entries(expectedRoles)) {
  const gruntHp = enemyById.get(roles.grunt).attributes.hp;
  const tanker = enemyById.get(roles.tanker);
  const rawRatio = tanker.attributes.hp / gruntHp;
  const maxHpBuff = (tanker.generic_skills || []).find(skill => skill.id === 'max_hp_buff');
  const effectiveRatio = rawRatio * (maxHpBuff ? maxHpBuff.params.max_hp_multiplier : 1);
  assert.equal(rawRatio, 1.5, `${arcId}: tanker base HP is 1.5x its grunt`);
  assert.ok(effectiveRatio >= 1.25 && effectiveRatio <= 1.75, `${arcId}: tanker effective HP stays within 1.25x–1.75x`);
}

// Deliberately scramble wave IDs: campaign unlocks use array ordinal.
const synthetic = Object.entries(expectedRoles).map(([arc_id, roles]) => ({
  id: `test_${arc_id}`, arc_id, exp_weight: 1.25, extra: {preserve: ['stage', 42]},
  waves: Array.from({length: 9}, (_, index) => ({
    id: `wave_${90 - index}`, wave_id: `wave_${90 - index}`, display_name: 'do not parse me',
    extra: {preserve: true},
    entries: [roles.grunt, roles.rusher, roles.tanker, 'permitted_ranged', roles.rusher, roles.tanker].map((enemy_id, position) => ({
      enemy_id, count: position + 2, interval: 0.17, start_delay: index / 7,
      boss: position >= 4, boss_skill_ids: ['retained_skill'],
      modifiers: {atk_mul: 0.5, hp_mul: 2, exp: 37, extra: {untouched: true}},
      extra: ['unknown metadata', index, position],
    })),
  })),
}));
// Admin/noncampaign content must never be rewritten, even if it reuses a role ID.
for (const arc_id of ['arc_0', 'unknown_future_arc']) {
  synthetic.push({id: `excluded_${arc_id}`, arc_id, waves: [{entries: [{enemy_id: 'magma_hound', count: 11}, {enemy_id: 'lava_brute', count: 8}]}]});
}
const before = clone(synthetic);
assert.equal(applyWaveRoleRules(synthetic), 45, 'exactly nine forbidden regular entries replaced per arc');
for (let stageIndex = 0; stageIndex < before.length; stageIndex++) {
  const expected = clone(before[stageIndex]);
  const roles = expectedRoles[expected.arc_id];
  if (roles) {
    for (const [index, wave] of expected.waves.entries()) {
      for (const entry of wave.entries) {
        if (!entry.boss && ((index < 3 && entry.enemy_id === roles.rusher) || (index < 6 && entry.enemy_id === roles.tanker))) entry.enemy_id = roles.grunt;
      }
    }
  }
  assert.deepEqual(synthetic[stageIndex], expected, 'only forbidden enemy IDs change; all metadata, counts, boss, timing, EXP and wave7+ preserved');
}
const once = clone(synthetic);
assert.equal(applyWaveRoleRules(synthetic), 0, 'second application reports no changes');
assert.deepEqual(synthetic, once, 'second application is idempotent');

// Actual seed waves are shared by the three difficulties in the spawn pipeline.
const stages = read('stages');
const arcs = read('arcs').filter(arc => Number(arc.order) >= 1 && Number(arc.order) <= 5);
const levels = read('stage_levels');
const enemies = new Map(read('enemies').map(enemy => [enemy.id, enemy]));
assert.equal(arcs.length, 5);
let stageCount = 0;
let combinations = 0;
let waveChecks = 0;
for (const arc of arcs) {
  const roles = expectedRoles[arc.id];
  assert.ok(roles, `campaign arc ${arc.id} has explicit roles`);
  const campaignStages = stages.filter(stage => stage.arc_id === arc.id);
  assert.equal(campaignStages.length, 10, `${arc.id} ten campaign stages`);
  for (const stage of campaignStages) {
    stageCount++;
    for (const mode of ['normal', 'epic', 'legend']) {
      const level = levels.find(candidate => candidate.stage_id === stage.id && candidate.level_id === mode);
      assert.ok(level, `${stage.id} has ${mode}`);
      assert.ok(level.enemy_modifiers && typeof level.enemy_modifiers === 'object', 'difficulty only modifies shared wave spawn stats');
      combinations++;
      for (const [index, wave] of stage.waves.entries()) {
        waveChecks++;
        for (const entry of wave.entries) {
          assert.ok(enemies.has(entry.enemy_id), `${stage.id} references a spawnable enemy`);
          assert.ok(Number.isInteger(entry.count) && entry.count > 0, 'entry count stays a positive integer');
          if (entry.boss) continue;
          assert.ok(index >= 3 || entry.enemy_id !== roles.rusher, `${stage.id}/${mode}/wave${index + 1}: rusher unlocks at4`);
          assert.ok(index >= 6 || entry.enemy_id !== roles.tanker, `${stage.id}/${mode}/wave${index + 1}: tanker unlocks at7`);
        }
      }
    }
  }
}
assert.equal(stageCount, 50);
assert.equal(combinations, 150);
const actualSnapshot = clone(stages);
assert.equal(applyWaveRoleRules(stages), 0, 'actual seed is already legal');
assert.deepEqual(stages, actualSnapshot, 'valid actual seed is unchanged');
console.log(`PASS C149 campaign role unlocks: ${stageCount} stages, ${combinations} modes, ${waveChecks} wave checks; count/EXP/metadata preservation and idempotence`);

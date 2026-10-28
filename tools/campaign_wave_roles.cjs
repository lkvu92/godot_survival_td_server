const fs = require('node:fs');
const path = require('node:path');

// C149: explicit authored roles, independent of speed buffs or enemy HP.
const ROLES = {
  arc_2: {grunt: 'flame_imp', rusher: 'magma_hound', tanker: 'lava_brute'},
  arc_frozen_realm: {grunt: 'snow_skeleton', rusher: 'frost_wolf', tanker: 'horn_cactus'},
  arc_verdant_realm: {grunt: 'spore_crawler', rusher: 'venom_spider', tanker: 'ent_protector'},
  arc_iron_bastion: {grunt: 'steam_automaton', rusher: 'clockwork_spider', tanker: 'shield_sentinel'},
  arc_titan_realm: {grunt: 'amber_spirit', rusher: 'sand_stalker', tanker: 'granite_colossus'},
};

// Mixed Arc 6 retains the legacy mappings above; its species are authored by
// role AND element. Shared migrations must recognize it without replacing a
// water/metal tank with an unrelated fixed grunt.
const MIXED_ARC_ID = 'arc_ngu_to_quy_khu';
const MIXED_TANK_TO_GRUNT = {
  arc6_shield_sentinel: 'arc6_steam_automaton',
  arc6_frost_knight: 'arc6_frost_lancer',
  arc6_ent_protector: 'arc6_spore_crawler',
  arc6_lava_brute: 'arc6_flame_imp',
  arc6_granite_colossus: 'arc6_snow_skeleton',
};
const isCampaignArc = id => !!ROLES[id] || id === MIXED_ARC_ID || id === 'arc_van_yeu_co_linh';

function applyWaveRoleRules(stages) {
  let changed = 0;
  for (const stage of stages) {
    if (stage.arc_id === MIXED_ARC_ID) {
      for (const wave of stage.waves.slice(0, 6)) for (const entry of wave.entries) {
        if (!entry.boss && MIXED_TANK_TO_GRUNT[entry.enemy_id]) {
          entry.enemy_id = MIXED_TANK_TO_GRUNT[entry.enemy_id];
          changed++;
        }
      }
      continue;
    }
    const roles = ROLES[stage.arc_id];
    if (!roles) continue;
    for (const [index, wave] of stage.waves.entries()) {
      if (index >= 6) continue;
      for (const entry of wave.entries) {
        if (entry.boss) continue;
        if (entry.enemy_id === roles.tanker || (index < 3 && entry.enemy_id === roles.rusher)) {
          entry.enemy_id = roles.grunt;
          changed++;
        }
      }
    }
  }
  return changed;
}

if (require.main === module) {
  const mode = process.argv[2];
  if (!['--check', '--write'].includes(mode)) throw new Error('Use --check or --write');
  const file = path.join(__dirname, '../data/stages.json');
  const stages = JSON.parse(fs.readFileSync(file, 'utf8'));
  const changed = applyWaveRoleRules(stages);
  if (mode === '--write') {
    if (changed) fs.writeFileSync(file, JSON.stringify(stages, null, 2) + '\n');
    console.log(`Updated ${changed} forbidden entries; entry counts and other fields preserved`);
  } else {
    console.log(`${changed ? 'FAIL' : 'PASS'} campaign wave roles: ${changed} forbidden entries`);
    if (changed) process.exitCode = 1;
  }
}

module.exports = {ROLES, MIXED_ARC_ID, MIXED_TANK_TO_GRUNT, isCampaignArc, applyWaveRoleRules};

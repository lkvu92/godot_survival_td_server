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

function applyWaveRoleRules(stages) {
  let changed = 0;
  for (const stage of stages) {
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

module.exports = {ROLES, applyWaveRoleRules};

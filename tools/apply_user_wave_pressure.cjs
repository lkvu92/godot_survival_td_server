const fs = require('fs');
const path = require('path');
const {ROLES, isCampaignArc} = require('./campaign_wave_roles.cjs');
const {rebalanceWaveExp, getWaveExp} = require('./campaign_wave_exp.cjs');

const RANGERS = {
  arc_2: 'pyromancer',
  arc_frozen_realm: 'snow_mage',
  arc_verdant_realm: 'thorn_spitter',
  arc_iron_bastion: 'iron_crossbowman',
  arc_titan_realm: 'seismic_shaman',
};

const WAVE_SPECS = {
  4:  { total: 8,  tankers: 0 },
  5:  { total: 12, tankers: 0 },
  6:  { total: 14, tankers: 0 },
  7:  { total: 16, tankers: 1 },
  8:  { total: 18, tankers: 1 },
  9:  { total: 20, tankers: 2 },
  10: { total: 22, tankers: 2 },
  11: { total: 24, tankers: 3 },
  12: { total: 26, tankers: 3 },
  13: { total: 28, tankers: 4 },
  14: { total: 30, tankers: 4 },
  15: { total: 32, tankers: 5 },
  16: { total: 34, tankers: 5 },
  17: { total: 34, tankers: 5 },
  18: { total: 36, tankers: 6 },
  19: { total: 38, tankers: 6 },
  20: { total: 38, tankers: 6 },
};

function reshapeStageWaves(stage) {
  const roles = ROLES[stage.arc_id];
  if (!roles) return false;
  const ranger = RANGERS[stage.arc_id];

  const getRole = (enemyId) => {
    if (enemyId === roles.tanker) return 'tanker';
    if (enemyId === ranger) return 'ranger';
    if (enemyId === roles.rusher) return 'rusher';
    return 'grunt';
  };

  let changed = false;

  for (let wi = 3; wi < stage.waves.length; wi++) {
    const wave = stage.waves[wi];
    const waveNum = wi + 1;
    const spec = WAVE_SPECS[waveNum];
    if (!spec) continue;

    // Boss encounters preserve their authored boss & escort composition
    if (wave.entries.some(e => e.boss)) continue;

    const targetTotal = spec.total;
    const targetTankers = spec.tankers;
    const targetRangers = Math.round((targetTotal - targetTankers) * 0.25);
    const targetRushers = Math.round((targetTotal - targetTankers) * 0.25);
    const targetGrunts = (targetTotal - targetTankers) - targetRangers - targetRushers;

    const targets = {
      tanker: targetTankers,
      ranger: targetRangers,
      rusher: targetRushers,
      grunt: targetGrunts,
    };

    const byRole = { tanker: [], ranger: [], rusher: [], grunt: [] };
    for (const entry of wave.entries) {
      const r = getRole(entry.enemy_id);
      byRole[r].push(entry);
    }

    if (targets.tanker > 0 && byRole.tanker.length === 0) {
      const template = wave.entries[0];
      const tankerEntry = JSON.parse(JSON.stringify(template));
      tankerEntry.enemy_id = roles.tanker;
      tankerEntry.spawn_role = 'tanker';
      tankerEntry.formation_lead_seconds = 0;
      tankerEntry.start_delay = Math.round((template.start_delay + 2.5) * 100) / 100;
      byRole.tanker.push(tankerEntry);
    }

    const nextEntries = [];
    for (const [r, roleEntries] of Object.entries(byRole)) {
      const roleTarget = targets[r];
      if (roleTarget <= 0 || roleEntries.length === 0) continue;
      const numEntries = Math.min(roleEntries.length, roleTarget);
      const basePerEntry = Math.floor(roleTarget / numEntries);
      let remainder = roleTarget % numEntries;

      for (let i = 0; i < numEntries; i++) {
        const e = roleEntries[i];
        e.count = basePerEntry + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        nextEntries.push(e);
      }
    }

    wave.entries = nextEntries;
    changed = true;
  }

  return changed;
}

function applyUserWavePressure(stages) {
  let changed = 0;
  for (const stage of stages) {
    if (reshapeStageWaves(stage)) changed++;
  }
  if (changed > 0) {
    rebalanceWaveExp(stages);
  }
  return changed;
}

if (require.main === module) {
  const filePath = path.join(__dirname, '../data/stages.json');
  const stages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const changed = applyUserWavePressure(stages);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(filePath, JSON.stringify(stages, null, 2) + '\n');
    console.log(`PASS applyUserWavePressure: written ${changed} stages`);
  } else {
    console.log(`CHECK applyUserWavePressure: ${changed} stages modified`);
  }
}

module.exports = {WAVE_SPECS, reshapeStageWaves, applyUserWavePressure};


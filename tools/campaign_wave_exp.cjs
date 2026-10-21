const fs = require('node:fs');
const path = require('node:path');
const {ROLES} = require('./campaign_wave_roles.cjs');
const REQUIREMENTS = [25, 35, 50, 70, 95, 125, 160, 205, 255, 315, 385, 465, 560, 670, 800, 950, 1120, 1310, 1520];

function getWaveExp(wave) {
  if (!Number.isInteger(wave) || wave < 1 || wave >= 50) throw new Error('Invalid in-run wave');
  if (wave <= REQUIREMENTS.length) return REQUIREMENTS[wave - 1];
  let value = REQUIREMENTS.at(-1);
  for (let level = REQUIREMENTS.length; level < wave; level++) value = Math.round(value * 1.25);
  return value;
}

function allocate(entries, target, parts) {
  const count = entries.reduce((sum, e) => sum + e.count, 0);
  if (!count || target < count) throw new Error('Insufficient EXP for positive per-creep rewards');
  const base = Math.floor(target / count);
  let extra = target % count;
  for (const entry of entries) {
    const high = Math.min(entry.count, extra);
    extra -= high;
    const values = [];
    for (const [amount, exp] of [[high, base + 1], [entry.count - high, base]]) {
      if (!amount) continue;
      const clone = JSON.parse(JSON.stringify(entry));
      clone.count = amount;
      clone.modifiers = {...clone.modifiers, exp};
      values.push(clone);
    }
    parts.set(entry, values);
  }
}

function rebalanceWaveExp(stages) {
  let changed = 0;
  for (const stage of stages) {
    if (!ROLES[stage.arc_id]) continue;
    for (const [index, wave] of stage.waves.entries()) {
      const target = getWaveExp(index + 1);
      const current = wave.entries.reduce((sum, e) => sum + e.count * Number(e.modifiers?.exp || 0), 0);
      if (current === target) continue;
      const parts = new Map();
      const bosses = wave.entries.filter(e => e.boss);
      const minions = wave.entries.filter(e => !e.boss);
      if (bosses.length && minions.length) {
        const bossShare = Math.round(target * 0.75);
        allocate(bosses, bossShare, parts);
        allocate(minions, target - bossShare, parts);
      } else {
        allocate(wave.entries, target, parts);
      }
      // Keep primary entry indexes stable for configured boss skill eligibility.
      wave.entries = wave.entries.map(e => parts.get(e)[0]).concat(wave.entries.flatMap(e => parts.get(e).slice(1)));
      changed++;
    }
  }
  return changed;
}

if (require.main === module) {
  const mode = process.argv[2];
  if (!['--check', '--write'].includes(mode)) throw new Error('Use --check or --write');
  const file = path.join(__dirname, '../data/stages.json');
  const stages = JSON.parse(fs.readFileSync(file, 'utf8'));
  const changed = rebalanceWaveExp(stages);
  if (mode === '--write') {
    if (changed) fs.writeFileSync(file, JSON.stringify(stages, null, 2) + '\n');
    console.log(`Updated EXP allocations in ${changed} waves; creature counts preserved`);
  } else {
    console.log(`${changed ? 'FAIL' : 'PASS'} campaign EXP: ${changed} mismatched waves`);
    if (changed) process.exitCode = 1;
  }
}

module.exports = {getWaveExp, rebalanceWaveExp};

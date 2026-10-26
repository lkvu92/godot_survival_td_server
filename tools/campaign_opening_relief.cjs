/* C218 v2.2: one-time, all-arc opening relief.  This migration only changes
 * the first three regular waves, preserves boss entries and rebalances EXP so
 * the existing one-run-level-per-wave contract remains true. */
const fs = require('node:fs');
const path = require('node:path');
const {isCampaignArc} = require('./campaign_wave_roles.cjs');
const {rebalanceWaveExp} = require('./campaign_wave_exp.cjs');

const VERSION = 1;
const WAVE_RULES = [
  {count_multiplier:.80, timing_multiplier:1.15, start_floors:[0,.70,3.25,4.50]},
  {count_multiplier:.65, timing_multiplier:1.35, start_floors:[0,.90,3.75,5.25]},
  {count_multiplier:.80, timing_multiplier:1.20, start_floors:[0,.75,3.50,4.90]},
];

function reduceRegularEntries(wave, rule) {
  const regular = wave.entries.filter(entry => !entry.boss);
  const boss = wave.entries.filter(entry => entry.boss);
  const total = regular.reduce((sum, entry) => sum + entry.count, 0);
  if (!total) return false;
  const target = Math.max(1, Math.round(total * rule.count_multiplier));
  const shares = regular.map((entry, index) => ({entry,index,exact:entry.count * target / total,count:0}));
  for (const share of shares) share.count = Math.floor(share.exact);
  let remainder = target - shares.reduce((sum, share) => sum + share.count, 0);
  shares.sort((a,b) => (b.exact - b.count) - (a.exact - a.count) || a.index - b.index);
  for (const share of shares) if (remainder-- > 0) share.count++;
  shares.sort((a,b) => a.index - b.index);
  const next = [];
  for (const share of shares) {
    if (!share.count) continue;
    const entry = share.entry;
    entry.count = share.count;
    entry.interval = Math.round(Number(entry.interval || 1) * rule.timing_multiplier * 10000) / 10000;
    const floor = rule.start_floors[Math.min(share.index, rule.start_floors.length - 1)] || 0;
    entry.start_delay = Math.round(Math.max(Number(entry.start_delay || 0) * rule.timing_multiplier, floor) * 10000) / 10000;
    next.push(entry);
  }
  wave.entries = next.concat(boss);
  return true;
}

function applyCampaignOpeningRelief(stages) {
  let changed = 0;
  for (const stage of stages) {
    if (!isCampaignArc(stage.arc_id) || stage.campaign_opening_relief_version === VERSION) continue;
    for (const [index, rule] of WAVE_RULES.entries()) {
      if (stage.waves[index]) reduceRegularEntries(stage.waves[index], rule);
    }
    stage.campaign_opening_relief_version = VERSION;
    changed++;
  }
  if (changed) rebalanceWaveExp(stages);
  return changed;
}

if (require.main === module) {
  const mode = process.argv[2];
  if (!['--check','--write'].includes(mode)) throw Error('Use --check or --write');
  const file = path.join(__dirname, '../data/stages.json');
  const stages = JSON.parse(fs.readFileSync(file, 'utf8'));
  const changed = applyCampaignOpeningRelief(stages);
  if (mode === '--write' && changed) fs.writeFileSync(file, JSON.stringify(stages, null, 2) + '\n');
  console.log(`${mode === '--check' && changed ? 'FAIL' : 'PASS'} C218 opening relief: ${changed} campaign stages ${changed ? 'need migration' : 'already migrated'}`);
  if (mode === '--check' && changed) process.exitCode = 1;
}

module.exports = {VERSION,WAVE_RULES,reduceRegularEntries,applyCampaignOpeningRelief};

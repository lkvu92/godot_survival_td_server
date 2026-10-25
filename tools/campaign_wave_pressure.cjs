const fs = require('node:fs');
const path = require('node:path');
const {rebalanceWaveExp} = require('./campaign_wave_exp.cjs');
const {applyWaveRoleRules} = require('./campaign_wave_roles.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

function reduceOpening(wave, multiplier) {
  const entries = wave.entries.filter(e => !e.boss);
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  if (!total) return;
  const target = Math.max(1, Math.round(total * multiplier));
  const shares = entries.map((entry, index) => ({entry, index, exact: entry.count * target / total}));
  for (const row of shares) row.count = Math.floor(row.exact);
  let extra = target - shares.reduce((sum, r) => sum + r.count, 0);
  shares.sort((a,b) => (b.exact-b.count)-(a.exact-a.count) || a.index-b.index);
  for (const row of shares) if (extra-- > 0) row.count++;
  for (const row of shares) row.entry.count = row.count;
  wave.entries = wave.entries.filter(e => e.boss || e.count > 0);
}

function migrateCampaignWaves(stages, arcs, rules) {
  let changed = 0;
  for (const arc of arcs.filter(a => a.order >= 1)) {
    for (const [index, stageId] of arc.stage_ids.entries()) {
      const stage = stages.find(s => s.id === stageId);
      if (!stage) throw Error('Missing campaign stage '+stageId);
      const target = arc.order === 1 ? Math.min(15 + index, 20) : 20;
      if (stage.campaign_pressure_version === rules.version) {
        if (stage.waves.length !== target) throw Error('Versioned stage length mismatch '+stageId);
        continue;
      }
      if (stage.waves.length > target) throw Error('Refusing to discard authored waves '+stageId);
      // Keep every existing boss encounter, especially the final encounter.
      const last = stage.waves.pop();
      const template = [...stage.waves].reverse().find(w => w.entries.length && w.entries.every(e => !e.boss));
      if (!template) throw Error('Missing regular-wave template '+stageId);
      while (stage.waves.length < target - 1) stage.waves.push(clone(template));
      stage.waves.push(last);
      for (const [waveIndex, wave] of stage.waves.entries()) {
        wave.id = wave.wave_id = 'wave_'+String(waveIndex+1).padStart(2,'0');
        wave.display_name = 'Đợt '+(waveIndex+1);
        if (waveIndex < rules.opening_wave_count) reduceOpening(wave, rules.opening_count_multiplier);
      }
      stage.campaign_pressure_version = rules.version;
      changed++;
    }
  }
  applyWaveRoleRules(stages);
  rebalanceWaveExp(stages);
  return changed;
}

if (require.main === module) {
  const mode = process.argv[2];
  if (!['--check','--write'].includes(mode)) throw Error('Use --check or --write');
  const read = name => JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8'));
  const stages = read('stages');
  const changed = migrateCampaignWaves(stages, read('arcs'), read('campaign_wave_pressure'));
  if (mode === '--write' && changed) fs.writeFileSync(path.join(__dirname,'../data/stages.json'), JSON.stringify(stages,null,2)+'\n');
  console.log(`${mode === '--check' && changed ? 'FAIL' : 'PASS'} campaign pressure migration: ${changed} stages`);
  if (mode === '--check' && changed) process.exitCode = 1;
}
module.exports = {reduceOpening, migrateCampaignWaves};

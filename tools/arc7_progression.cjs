const {CORE} = require('./arc6_catalog.cjs');
const role = enemy => enemy.is_boss ? 'boss' : enemy.id.includes('co_giap_long_te') ? 'tank' : enemy.attack_type === 'ranged' ? 'ranger' : 'normal';
const median = values => { const sorted = [...values].sort((first, second) => first-second); const middle = Math.floor(sorted.length/2); return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2; };
const round = value => Math.round(value*1e6)/1e6;
function normalize(rows, catalog) {
  for (const stat of ['hp','atk','def']) {
    const growth = median(catalog.heroes.map(hero=>Math.pow(hero.level_up_stats[stat],5)));
    for (const group of ['normal','ranger','tank','boss']) {
      const sources = catalog.enemies.filter(enemy=>group==='boss' ? enemy.id==='arc6_wraith_final' : enemy.id.startsWith('arc6_') && enemy.arc6_role===group);
      const targets = rows.filter(enemy=>role(enemy)===group);
      if (!sources.length || !targets.length) throw Error('Missing progression role '+group);
      const source = median(sources.map(enemy=>enemy.attributes[stat])) * (group==='boss' && stat==='atk' ? .45 : 1);
      const authored = median(targets.map(enemy=>enemy.attributes[stat]));
      for (const enemy of targets) enemy.attributes[stat] = round(source*growth*enemy.attributes[stat]/authored);
    }
  }
  return rows;
}
function waves(stages, enemies) {
  for (const [index, stage] of stages.entries()) {
    const start = round(9.25 + index*.25), end = round(11.9 + index*.4);
    stage.stage_rules.stat_curve = {model:'shared_hp_atk_def_linear_v1',wave_1:start,wave_20:end};
    for (const [waveIndex,wave] of stage.waves.entries()) {
      const bosses = wave.entries.filter(entry=>entry.boss);
      const counts = bosses.length ? [3,2,1] : CORE[waveIndex];
      const entries = [...bosses];
      for (const [roleIndex,group] of ['normal','ranger','tank'].entries()) {
        const pool = enemies.filter(enemy=>role(enemy)===group);
        for (let offset=0;offset<counts[roleIndex];offset++) {
          const enemy = pool[(index*101+waveIndex*17+offset*7+roleIndex*3)%pool.length];
          entries.push({enemy_id:enemy.id,count:1,interval:1,start_delay:round(offset*.95),modifiers:{}});
        }
      }
      const factor = round(start+(end-start)*waveIndex/19);
      for (const entry of entries) entry.modifiers = {hp_mul:factor,atk_mul:factor,def_mul:factor,speed_mul:.75};
      wave.entries = entries;
    }
  }
  return stages;
}
module.exports = {normalize,waves,CORE,role};

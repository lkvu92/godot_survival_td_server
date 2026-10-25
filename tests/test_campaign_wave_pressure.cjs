const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {reduceOpening,migrateCampaignWaves} = require('../tools/campaign_wave_pressure.cjs');
const {getWaveExp} = require('../tools/campaign_wave_exp.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8'));
const rules = read('campaign_wave_pressure');
assert.equal(rules.opening_wave_count,4);
assert.equal(rules.growth_interval,4);
for(const counts of [[1,5],[4,3],[1,1,6],[1,1,1],[30,40,30]]) {
  const wave = {entries: counts.map(count=>({enemy_id:'creep',count})).concat({enemy_id:'boss',count:1,boss:true})};
  reduceOpening(wave,0.85);
  assert.equal(wave.entries.filter(e=>!e.boss).reduce((n,e)=>n+e.count,0),Math.round(counts.reduce((a,b)=>a+b)*0.85));
  assert.equal(wave.entries.find(e=>e.boss).count,1);
  assert(wave.entries.every(e=>Number.isInteger(e.count)&&e.count>0));
}
const stages = read('stages'), arcs = read('arcs');
let total = 0;
for(const arc of arcs.filter(a=>a.order>=1)) {
  for(const [index,id] of arc.stage_ids.entries()) {
    const stage = stages.find(s=>s.id===id);
    assert.equal(stage.waves.length,arc.order===1?Math.min(15+index,20):20);
    assert.equal(stage.campaign_pressure_version,1);
    stage.waves.forEach((wave,i)=>{
      assert.equal(wave.entries.reduce((n,e)=>n+e.count*e.modifiers.exp,0),getWaveExp(i+1));
      for(const e of wave.entries) assert(e.count>0&&e.modifiers.exp>0);
    });
    total += stage.waves.length;
  }
}
assert.equal(total,985);
const before = JSON.stringify(stages);
assert.equal(migrateCampaignWaves(stages,arcs,rules),0);
assert.equal(JSON.stringify(stages),before,'count reduction and EXP splits are idempotent');
const synthetic = [{id:'test',arc_id:'arc_2',waves:Array.from({length:10},(_,i)=>({entries:i===9?[{enemy_id:'boss',boss:true,count:1,modifiers:{exp:1}}]:[{enemy_id:'flame_imp',count:10,modifiers:{exp:1}}]}))}];
migrateCampaignWaves(synthetic,[{order:1,stage_ids:['test']}],rules);
assert.equal(synthetic[0].waves.length,15);
assert(synthetic[0].waves.at(-1).entries.every(e=>e.boss),'final boss retained at final wave');
for(let i=0;i<4;i++)assert.equal(synthetic[0].waves[i].entries.reduce((n,e)=>n+e.count,0),9);
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/config_rpc.js'),'utf8'),context);
assert(context.validCampaignWavePressure(rules));
for(const invalid of [null,{}, {...rules,growth_interval:0},{...rules,hp_growth:-1},{...rules,skill_recovery_growth:Infinity}])assert(!context.validCampaignWavePressure(invalid));
console.log('PASS C218: 50 stages/985 waves, opening allocation, final boss, EXP, idempotence and System rule validation');

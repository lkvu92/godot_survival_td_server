const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ARC,SEED,ELEMENTS,POOL,CORE,rng,buildCatalog,mergeCatalog,loadCatalog,loadRecommendations} = require('../tools/arc6_catalog.cjs');
const {getWaveExp,rebalanceWaveExp} = require('../tools/campaign_wave_exp.cjs');
const {applyWaveRoleRules} = require('../tools/campaign_wave_roles.cjs');
const {migrateCampaignWaves} = require('../tools/campaign_wave_pressure.cjs');
const {applyCampaignOpeningRelief} = require('../tools/campaign_opening_relief.cjs');
const root = path.join(__dirname,'..');
const clone = x => JSON.parse(JSON.stringify(x));
const read = name => JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const catalog = loadCatalog(root), raw = buildCatalog(catalog), recommendations=loadRecommendations(root,raw);
const built = buildCatalog(catalog,recommendations), merged = mergeCatalog(catalog,built);
assert.deepEqual(mergeCatalog(merged,buildCatalog(merged,recommendations)),merged,'generation is idempotent');
assert.deepEqual(merged,catalog,'authored seed matches generator');
for (const key of ['arcs','enemies','stages','stage_levels']) {
  assert.equal(new Set(catalog[key].map(row=>row.id)).size,catalog[key].length,`unique ${key} IDs`);
  const ids = new Set(built[key].map(row=>row.id));
  assert.deepEqual(merged[key].filter(row=>!ids.has(row.id)),catalog[key].filter(row=>!ids.has(row.id)),`preserve every preexisting ${key} row`);
}
const sourceMap = new Map(catalog.enemies.map(e=>[e.id,e]));
const supported = new Set(read('enemy_skills').map(skill=>skill.id));
assert.equal(built.enemies.length,17);
for (const enemy of built.enemies.filter(e=>!e.is_boss)) {
  const source = sourceMap.get(enemy.source_enemy_id);
  assert.deepEqual(enemy.attributes,source.attributes,'base stats preserved; tuning belongs to entry modifiers');
  assert.deepEqual(enemy.attack_skill,source.attack_skill,'source attack/VFX kept');
  assert.deepEqual(enemy.skills,source.skills);
  assert.deepEqual(enemy.generic_skills.slice(0,-1),source.generic_skills,'original passives unmodified');
  assert.equal(enemy.generic_skills.length,source.generic_skills.length+1,'exactly one extra passive');
  assert.equal(new Set(enemy.generic_skills.map(s=>s.id)).size,enemy.generic_skills.length,'no duplicate generic IDs');
  for (const skill of enemy.generic_skills) assert(supported.has(skill.id),`engine-supported skill ${skill.id}`);
  assert(ELEMENTS.includes(enemy.element));
  assert.equal(enemy.balance_reference_level,35);
}
assert.equal(sourceMap.get('frost_knight').element,'metal');
assert.equal(sourceMap.get('arc6_frost_knight').element,'water','isolated Water tank variant');
for (const [id,skills] of [['arc6_wraith_mid',2],['arc6_wraith_final',4]]) {
  const boss = sourceMap.get(id);
  assert(boss.is_boss);
  assert.equal(boss.boss_skills.length,skills);
  assert.deepEqual(boss.boss_skills,sourceMap.get('primordial_wraith').boss_skills.slice(0,skills));
}
assert.equal(built.arcs.length,1);
assert.equal(built.arcs[0].order,6);
assert.equal(built.stages.length,10);
assert.equal(built.stage_levels.length,30);
for (const mode of ['normal','epic','legend']) {
  let gold=catalog.stage_levels.find(row=>row.stage_id==='stage_5_10'&&row.level_id===mode).gold_reward;
  for (const row of built.stage_levels.filter(row=>row.level_id===mode)) {
    assert(row.gold_reward>=gold,'gold rewards continue monotonically after Arc5');
    gold=row.gold_reward;
  }
}
const totals = Object.fromEntries(ELEMENTS.map(e=>[e,0]));
let waves=0,units=0;
for (const [si,stage] of built.stages.entries()) {
  assert.equal(stage.arc_id,ARC);
  assert.equal(stage.level,51+si);
  assert.equal(stage.stage_rules.balance_reference_level,35);
  assert.deepEqual(Object.values(stage.stage_rules.element_weights),[20,20,20,20,20]);
  assert.equal(stage.waves.length,20);
  assert.equal(stage.is_boss,si===4||si===9);
  for (const [wi,wave] of stage.waves.entries()) {
    waves++;
    const counts = {normal:0,ranger:0,tank:0};
    const bosses=wave.entries.filter(e=>e.boss);
    assert.equal(bosses.length,stage.is_boss&&wi===19?1:0);
    for (const entry of wave.entries) {
      const enemy=sourceMap.get(entry.enemy_id);
      assert(enemy,'valid enemy reference');
      assert(Number.isInteger(entry.count)&&entry.count>0);
      assert(Number.isInteger(entry.modifiers.exp)&&entry.modifiers.exp>0);
      assert(Number.isFinite(entry.interval)&&entry.interval>0);
      assert(Number.isFinite(entry.start_delay)&&entry.start_delay>=0);
      for (const stat of ['hp_mul','atk_mul','def_mul','speed_mul']) assert(entry.modifiers[stat]>0 && Number.isFinite(entry.modifiers[stat]));
      if (entry.boss) {assert(enemy.is_boss);continue;}
      assert(!enemy.is_boss && enemy.id.startsWith('arc6_'));
      counts[enemy.arc6_role]+=entry.count;
      totals[enemy.element]+=entry.count;
      units+=entry.count;
      if (wi<6) assert.notEqual(enemy.arc6_role,'tank');
      assert(POOL[enemy.element].includes(enemy.source_enemy_id));
    }
    const expected = bosses.length?[3,2,1]:CORE[wi];
    assert.deepEqual(Object.values(counts),expected,`${stage.id} wave${wi+1} exact role core`);
    assert.equal(wave.entries.reduce((sum,e)=>sum+e.count*e.modifiers.exp,0),getWaveExp(wi+1),'exact run EXP budget');
    if (bosses.length) assert.equal(bosses[0].modifiers.exp,Math.round(getWaveExp(wi+1)*.75));
  }
  for (const mode of ['normal','epic','legend']) {
    const row=built.stage_levels.find(l=>l.stage_id===stage.id&&l.level_id===mode);
    assert(row && row.stamina_cost>0 && row.recommended_power>0);
    const tables=[row.loot_table,...(stage.is_boss?[row.boss_loot_table]:[])];
    for (const table of tables) {
      const rune=table.filter(x=>x.group==='rune');
      assert(rune.length>0);
      assert(Math.abs(rune.reduce((sum,r)=>sum+r.weight,0)-100)<1e-7);
      for (const element of ELEMENTS) assert(Math.abs(rune.filter(r=>r.item_id.includes('_'+element+'_')).reduce((sum,r)=>sum+r.weight,0)-20)<1e-7,'20% per rune element');
      for (const r of rune) {
        if (mode==='normal') assert(r.item_id.endsWith('_low'));
        if (mode==='epic') assert(r.item_id.endsWith('_medium'));
      }
    }
  }
}
assert.equal(waves,200);
for (const count of Object.values(totals)) assert(Math.abs(count/units-.2)<.04,'seeded sample is approximately balanced, not forced per wave');
// Independent roll invariant: unlike a shuffled bag, five rolls need not cover five elements.
const random=rng(SEED);let duplicateBatch=false;
for(let i=0;i<100;i++) {const picks=Array.from({length:5},()=>Math.floor(random()*5));if(new Set(picks).size<5)duplicateBatch=true;}
assert(duplicateBatch);
const before=JSON.stringify(catalog.stages);
assert.equal(applyWaveRoleRules(catalog.stages),0);
assert.equal(rebalanceWaveExp(catalog.stages),0);
assert.equal(migrateCampaignWaves(catalog.stages,catalog.arcs,read('campaign_wave_pressure')),0);
assert.equal(applyCampaignOpeningRelief(catalog.stages),0);
assert.equal(JSON.stringify(catalog.stages),before,'all existing migration tools leave generated stages unchanged');
const forbidden=clone(built.stages[0]);forbidden.waves[0].entries[0].enemy_id='arc6_frost_knight';
assert.equal(applyWaveRoleRules([forbidden]),1);
assert.equal(forbidden.waves[0].entries[0].enemy_id,'arc6_frost_lancer','mixed role repair retains element');
assert(catalog.progression.talisman_system.fragment_drop.eligible_stages.includes('stage_6_10'));
console.log(`PASS C221 catalog: 10 stages/${waves} waves/30 modes; 15+2 variants, ${units} seeded slots ${JSON.stringify(totals)}, EXP/roles/loot/idempotence/preservation`);

const assert=require('node:assert/strict');
const path=require('node:path');
const {ARC,ELEMENTS,SPECIES,BOSSES,buildCatalog,loadCatalog,mergeCatalog,catalogDigest}=require('../tools/arc7_catalog.cjs');
const {getWaveExp}=require('../tools/campaign_wave_exp.cjs');
const root=path.join(__dirname,'..'),catalog=loadCatalog(root),built=buildCatalog(catalog);
assert.deepEqual(buildCatalog(catalog),built,'deterministic');
assert.deepEqual(mergeCatalog(catalog,built),catalog,'catalog materialized and idempotent');
assert.equal(built.enemies.length,45);assert.equal(built.stages.length,10);assert.equal(built.stage_levels.length,30);
const ids=new Set(built.enemies.map(e=>e.id)),elementCounts={};
for(const enemy of built.enemies){assert.equal(enemy.balance_reference_level,60);assert(ELEMENTS.includes(enemy.element));for(const stat of ['hp','atk','def','move_speed','attack_speed','attack_range'])assert(Number.isFinite(enemy.attributes[stat])&&enemy.attributes[stat]>0);if(enemy.is_boss){assert.equal(enemy.boss_skills.length,4);assert.equal(enemy.boss_skills.filter(s=>s.basic).length,1);assert.deepEqual(enemy.attack_skill,enemy.boss_skills[0]);}}
for(const [index,stage]of built.stages.entries()){
 assert.equal(stage.arc_id,ARC);assert.equal(stage.stage_rules.balance_reference_level,60);assert.equal(stage.waves.length,20);
 for(const [wi,wave]of stage.waves.entries()){
  assert.equal(wave.entries.reduce((n,e)=>n+e.count*e.modifiers.exp,0),getWaveExp(wi+1));
  const bosses=wave.entries.filter(e=>e.boss);assert.equal(bosses.length,wi===19&&[4,9].includes(index)?1:0);
  const curve=stage.stage_rules.stat_curve;
  const expected=Math.round((curve.wave_1+(curve.wave_20-curve.wave_1)*wi/19)*1e6)/1e6;
  const core=require('../tools/arc7_progression.cjs').CORE[wi];
  assert.equal(wave.entries.reduce((total,entry)=>total+entry.count,0),bosses.length?7:core.reduce((total,value)=>total+value,0));
  const roleCounts=bosses.length?[3,2,1]:core;
  for(const [roleIndex,role] of ['normal','ranger','tank'].entries()) assert.equal(wave.entries.filter(entry=>require('../tools/arc7_progression.cjs').role(built.enemies.find(enemy=>enemy.id===entry.enemy_id))===role).reduce((total,entry)=>total+entry.count,0),roleCounts[roleIndex]);
  for(const entry of wave.entries){assert(ids.has(entry.enemy_id));assert.equal(entry.count,1);const enemy=built.enemies.find(e=>e.id===entry.enemy_id);elementCounts[enemy.element]=(elementCounts[enemy.element]||0)+1;assert.equal(entry.modifiers.atk_mul,expected);assert.equal(entry.modifiers.hp_mul,entry.modifiers.atk_mul);assert.equal(entry.modifiers.def_mul,entry.modifiers.atk_mul);assert.equal(entry.modifiers.speed_mul,.75);if(entry.boss)assert(entry.enemy_id.includes(BOSSES[index===4?0:1]));}
 }
}
const count=Object.values(elementCounts).reduce((a,b)=>a+b,0);for(const e of ELEMENTS)assert(Math.abs(elementCounts[e]/count-.2)<.04,'element distribution');
for(const enemy of built.enemies.filter(row=>row.id.includes('bach_ho_yeu_vuong'))){
 const [punch,claw,trap,frenzy]=enemy.boss_skills;
 assert(enemy.boss_skills.every(skill=>skill.tiger_version===2));
 assert.equal(punch.punch_count,3);assert.equal(punch.damage_multiplier,.35);assert.equal(punch.paralysis_chance,.1);assert.equal(punch.paralysis_duration,.5);
 assert.equal(claw.slash_count,2);assert.equal(claw.slash_interval,.5);assert.equal(claw.damage_multiplier,1);assert.equal(claw.bleed_chance,.5);assert.equal(claw.bleed_duration,4);assert.equal(claw.buff_duration,2);assert.equal(claw.move_speed_multiplier,1.3);assert.equal(claw.attack_speed_multiplier,1.3);
 assert.equal(trap.field_duration,2);assert.equal(trap.field_tick_interval,1);assert.equal(trap.paralysis_chance,.3);assert.equal(trap.tails_duration,1);assert.equal(trap.stun_chance,.5);assert.equal(trap.stun_duration,.5);assert.equal(trap.kick_count,4);assert.equal(trap.kick_damage_multiplier,.3);assert.equal(trap.knockback_distance,50);
 assert.equal(frenzy.activation,'self_hp_below');assert.equal(frenzy.hp_below_pct,.5);assert.equal(frenzy.cooldown,300);assert.equal(frenzy.duration,6);assert.equal(frenzy.pulse_count,6);assert.equal(frenzy.pulse_interval,1);assert.equal(frenzy.damage_multiplier,.05);assert.equal(frenzy.paralysis_chance,.15);assert.equal(frenzy.cleanse_on_activate,true);assert.equal(frenzy.move_speed_multiplier,1.3);assert.equal(frenzy.attack_speed_multiplier,1.25);
}
for(const enemy of built.enemies.filter(row=>row.id.includes('chu_tuoc_nu_vuong'))){const [palm,feathers,phoenix,rebirth]=enemy.boss_skills;assert(enemy.boss_skills.every(skill=>skill.vermilion_version===2));assert.equal(palm.damage_multiplier,1);assert.equal(palm.burn_multiplier,.05);assert.equal(feathers.shot_count,6);assert.equal(feathers.shot_interval,.2);assert.equal(feathers.damage_multiplier,.2);assert.equal(feathers.impact_multiplier,.1);assert.equal(feathers.bleed_duration,4);assert.equal(phoenix.eruption_count,4);assert.equal(phoenix.fall_interval,.5);assert.equal(phoenix.slow_percent,.3);assert.equal(rebirth.activation,'on_death');assert.equal(rebirth.passive,true);assert.equal(rebirth.cooldown,300);assert.equal(rebirth.duration,4);assert.equal(rebirth.wave_count,4);assert.equal(rebirth.revive_hp_ratio,.5);}
for(const mode of built.stage_levels){assert.equal(mode.stage_rules.balance_reference_level,60);assert.equal(mode.stage_id.startsWith('stage_7_'),true);for(const table of [mode.loot_table,mode.boss_loot_table||[]]){const runes=table.filter(r=>r.group==='rune');const groups=new Map();for(const r of runes){const k=r.item_id.replace(/_(metal|water|wood|fire|earth)_/,'_');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}for(const rows of groups.values()){assert.equal(rows.length,5);assert(rows.every(r=>r.weight===rows[0].weight));}}}
console.log('PASS C237 deterministic catalog, Lv60, 45 variants, 200 waves, exact EXP, formation, element/loot distribution, boss skill count; '+catalogDigest(built));

const fs=require('fs'),path=require('path'),assert=require('assert');
const {curves,poison,presentationTuning,maskedHash}=require('../tools/hero_skill_damage_curves.cjs');
const skills=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8'));
const index=Object.fromEntries(skills.map(s=>[s.id,s]));
// C010 v1.4.3 / C012 v1.5.0 baseline: Hero 3 sheets/burst and Hero 4 looping vortex/needle timing.
assert.equal(maskedHash(skills),'6d48d0710483e3fe5d1af81413e22598d07b95c6622c1c4077bec3b06b150891','Unrelated skills/stats/mechanics must be byte-value equivalent');
let components=0;
for(const [id,fields] of Object.entries(curves)){
  const skill=index[id];assert(skill&&skill.levels.length===5);
  for(const [key,old] of Object.entries(fields)){
    components++;
    for(let i=0;i<5;i++){
      const actual=skill.levels[i].stats[key];
      const expected=Math.round((old[0]+0.3*old[i])*10000)/10000;
      assert.equal(actual,expected,`${id} ${key} Lv${i+1}`);
      if(i>0)assert(actual>=skill.levels[i-1].stats[key]);
    }
    if(old[0]>0){
      assert(Math.abs(skill.levels[0].stats[key]/old[0]-1.3)<1e-9);
      assert(skill.levels[4].stats[key]<old[4],id+' end coefficient must decrease');
      assert(Math.abs((skill.levels[4].stats[key]-skill.levels[0].stats[key])/(old[4]-old[0])-0.3)<1e-9);
    }
  }
  for(const level of skill.levels){
    const text=level.description_rows.join('\n');
    const key=id==='hero_2_skill_3'?'burn_total_damage_pct':'damage_pct';
    assert(text.includes(String(level.stats[key])),id+' description must expose the new damage');
  }
}
for(const [id,old] of Object.entries(poison)){
  for(let i=0;i<5;i++){
    const level=index[id].levels[i],effect=level.effects.find(e=>e.id==='poison');
    assert.equal(effect.dps_pct,Math.round((old[0]+old[i]*0.3)*10000)/10000);
    assert(level.description_rows.join('\n').includes('Poison '+effect.dps_pct+'% ATK/s'));
  }
}
assert.deepEqual(index.hero_1_skill_1.levels.map(l=>l.stats.damage_pct),[97.5,103.5,111,120,130.5]);
assert.deepEqual(index.hero_5_skill_1.levels.map(l=>l.stats.damage_pct),[84.5,89.6,94.4,99.2,104]);
const phoenix=index.hero_2_skill_2;
assert.deepEqual(phoenix.levels.map(l=>l.stats.speed_pct),[240,250,260,270,280],'Phoenix flight speed is raised at every level');
assert.deepEqual(phoenix.levels.map(l=>l.stats.knockback_distance),[24,27,30,33,36],'Phoenix applies only a light pushback');
for(const level of phoenix.levels){
  assert.equal(level.stats.knockback_duration,0.15,'Phoenix light pushback duration');
  assert.ok(!Object.hasOwn(level.stats,'vfx_alpha'),'Phoenix is opaque and avoids alpha blending');
}
const triangle=index.hero_2_skill_4;
assert.equal(triangle.telegraph_vfx_frames.length,9,'Triangle volley has a nine-frame snapshot telegraph');
for(const level of triangle.levels){
  const stats=level.stats;
  assert.equal(stats.charge_time,2,'Triangle volley snapshots for two seconds');
  assert.equal(stats.telegraph_radius,96,'Snapshot rune damage radius');
  assert.equal(stats.telegraph_max_hp_pct,0.005,'Each rune tick deals 0.5% max HP');
  assert.equal(stats.telegraph_tick_interval,0.5,'Rune ticks every 0.5 seconds');
  assert.equal(stats.telegraph_tick_count,4,'Rune has exactly four damage ticks');
}
assert.equal(index.hero_1_skill_2.flank_bolt_config.speed,540,'Hero 1 Skill 2 flank bolts fly at 540');
const iceDomain=index.hero_1_skill_4;
assert.deepEqual(iceDomain.vfx_frames,['hero_1_skill4_beam','hero_1_skill4_trail','hero_1_skill4_seal','hero_1_skill4_domain'],'Hero 1 Skill 4 declares its four visual layers');
for(const level of iceDomain.levels){
  const stats=level.stats;
  assert.equal(stats.cooldown,15,'Ice domain cooldown is 15 seconds');
  assert.equal(stats.domain_duration,10,'Ice domain remains for 10 seconds');
  assert.equal(stats.domain_radius,260,'Ice domain radius is fixed');
  assert.equal(stats.domain_slow_edge,0.1,'Ice domain slow at edge');
  assert.equal(stats.domain_slow_center,0.5,'Ice domain slow at seal');
}
const seal=index.hero_3_skill_2;
const vortex=index.hero_4_skill_4;
assert.deepEqual(vortex.levels.map(level=>level.stats.needle_count),[3,4,5,6,8]);
for(const level of vortex.levels){
  const s=level.stats;
  assert.equal(s.vortex_duration,2); assert.equal(s.vortex_animation_duration,1);
  assert.equal(s.needle_delay,0.5); assert.equal(s.needle_interval,0.1);
  assert.equal(s.stack_hp_percent,0.002); assert.equal(s.stack_hp_percent_cap,0.012);
  assert.equal(s.stack_refresh,3);
  assert(level.description_rows.some(row=>row.startsWith('Stack 0.2%')));
}
for(const [key,prefix] of [['vfx_frames','hero_3_skill_2a'],['phase_b_vfx_frames','hero_3_skill_2b'],['wave_vfx_frames','hero_3_skill_2c']]) {
  assert.deepEqual(seal[key],Array.from({length:9},(_,i)=>`${prefix}_frame_${i}`));
}
for(const level of seal.levels) {
  const s=level.stats;
  assert.equal(s.wave_count,3); assert.equal(s.wave_interval,0.3);
  assert.equal(s.wave_stun_chance,0.3); assert.equal(s.wave_stun_duration,0.2);
  assert.equal(s.wave_damage_pct,s.second_damage_pct/3);
  assert.deepEqual(level.effects,[],'No guaranteed stun on heavy strike or sword AOE');
  assert.equal(s.wave_radius_progress.length,9);
  assert.equal(s.wave_radius_progress.at(-1),1);
}
console.log(`PASS hero damage balance: ${Object.keys(curves).length} skills, ${components} ATK curves, two DOT curves; retained direct/secondary curves; C010 three sound waves, 30%/0.2s stun and nine-frame sheets`);

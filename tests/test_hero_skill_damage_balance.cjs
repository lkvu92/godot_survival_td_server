const fs=require('fs'),path=require('path'),assert=require('assert');
const {curves,poison,presentationTuning,maskedHash}=require('../tools/hero_skill_damage_curves.cjs');
const skills=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8'));
const index=Object.fromEntries(skills.map(s=>[s.id,s]));
// C197 baseline includes explicit Hero 3/4/5 non-damage changes asserted below.
const baselineSkills=JSON.parse(JSON.stringify(skills));
baselineSkills.find(s=>s.id==='hero_4_skill_4').needle_vfx_frames=['hero_4_skill_4b_frame_0'];
baselineSkills.find(s=>s.id==='hero_5_skill_2').levels.forEach(l=>delete l.stats.rune_hp_percent);
baselineSkills.find(s=>s.id==='hero_5_skill_3').levels.forEach(l=>{
  for(const k of ["vfx_scale", "crack_vfx_scale", "wave_vfx_scale"]) l.stats[k]=Number((l.stats[k]/0.8).toFixed(8));
  for(const k of ["range", "radius", "wave_radius", "wave_ring_width", "wave_collision_padding", "vfx_scale", "crack_vfx_scale", "wave_vfx_scale"]) l.stats[k]=Number((l.stats[k]/2).toFixed(8));
  l.description_rows=l.description_rows.map(r=>r.replace(/radius (\d+)px/g,(_,n)=>'radius '+Number(n)/2+'px'));
});
baselineSkills.find(s=>s.id==='hero_3_skill_1').levels.forEach(l=>{l.stats.projectile_speed=320;l.description_rows=l.description_rows.map(r=>r.replace(/416/g,'320'));});
baselineSkills.find(s=>s.id==='hero_3_skill_3').levels.forEach(l=>delete l.stats.arc_speed_pct);
baselineSkills.find(s=>s.id==='hero_4_skill_3').levels.forEach(l=>{for(const k of ['vfx_scale','explosion_vfx_scale'])l.stats[k]=Number((l.stats[k]/0.6).toFixed(8));});
const baselineIce=baselineSkills.find(s=>s.id==='hero_1_skill_2');
baselineSkills.find(s=>s.id==='hero_1_skill_4').levels.forEach((l,i)=>{
  l.stats.speed_pct=[10,20,30,40,50][i];l.stats.freeze_duration=0.3;
  delete l.stats.freeze_chance;delete l.stats.freeze_damage_multiplier;
});
baselineSkills.find(s=>s.id==='hero_1_skill_3').levels.forEach(l=>{
  l.stats.damage_pct=20;l.stats.attack_speed_slow=0.3;l.stats.def_reduction=0.2;
});
baselineIce.flank_bolt_config.damage_multiplier=0.6;
baselineIce.levels.forEach((l,i)=>{
  l.stats.radius=[80,104,135.2,175.8,228.5][i];
  if(i<2)delete l.stats.flank_bolts;else l.stats.flank_bolts=[0,0,2,2,3][i];
});
assert.equal(maskedHash(baselineSkills),'3e2e2fe7a20b0a3a34d65cc0c0dd33d714f7b0f5166b60e1c63ffe79bf34b836','Unrelated skills/stats/mechanics must be byte-value equivalent to C197 baseline');
let components=0;
const damageOverrides={
  hero_5_skill_1:{damage_pct:[60,75,85,100,120]},
  hero_5_skill_2:{damage_pct:[70,85,100,115,130]},
  hero_5_skill_3:{damage_pct:[100,110,120,130,140]},
  hero_5_skill_4:{damage_pct:[40,40,50,55,60]},
  hero_4_skill_1:{damage_pct:[40,45,50,55,60]},
  hero_4_skill_2:{damage_pct:[85,95,105,115,125]},
  hero_4_skill_4:{damage_pct:[120,130,140,150,160],needle_damage_pct:[25,27.5,30,35,40]},
};
for(const [id,fields] of Object.entries(curves)){
  const skill=index[id];assert(skill&&skill.levels.length===5);
  for(const [key,old] of Object.entries(fields)){
    components++;
    for(let i=0;i<5;i++){
      const actual=skill.levels[i].stats[key];
      const expected=damageOverrides[id]?.[key]?.[i]??(id==='hero_3_skill_3'?(key==='damage_pct'?[12.5,15,17.5,20,25][i]:[100,130,140,150,160][i]):id==='hero_1_skill_4'&&key==='damage_pct'?[12.5,15,17.5,20,22.5][i]:id==='hero_1_skill_2'&&key==='damage_pct'?[65,75,85,95,105][i]:Math.round((old[0]+0.3*old[i])*10000)/10000);
      assert.equal(actual,expected,`${id} ${key} Lv${i+1}`);
      if(i>0)assert(actual>=skill.levels[i-1].stats[key]);
    }
    if(old[0]>0 && !damageOverrides[id]?.[key] && id!=='hero_3_skill_3' && !(['hero_1_skill_2','hero_1_skill_4'].includes(id)&&key==='damage_pct')){
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
    assert.equal(effect.dps_pct,id==='hero_4_skill_1'?[25,30,35,40,45][i]:[45,55,65,75,85][i]);
    assert(level.description_rows.join('\n').includes('Poison '+effect.dps_pct+'% ATK/s'));
  }
}
assert.deepEqual(index.hero_1_skill_1.levels.map(l=>l.stats.damage_pct),[97.5,103.5,111,120,130.5]);
assert.deepEqual(index.hero_5_skill_1.levels.map(l=>l.stats.damage_pct),[60,75,85,100,120]);
const phoenix=index.hero_2_skill_2;
const h5Curves={
 hero_5_skill_1:{explosion_damage_pct:[25,30,35,40,45],aoe_radius:[45,50,60,70,80],knockback_distance:[30,35,40,45,50],range:[700,720,740,760,780]},
 hero_5_skill_2:{cooldown:[6.5,6,5.5,5,4.5],radius:[80,90,100,120,140],range:[720,740,760,780,800],rune_damage_pct:[25,30,35,40,45],rune_hp_percent:[0.002,0.003,0.006,0.008,0.01],stun_duration:[0.1,0.125,0.15,0.175,0.2]},
 hero_5_skill_3:{cooldown:[11,10,9,8,7],radius:[140,150,160,170,180],wave_radius:[200,220,240,260,280],wave_damage_pct:[30,40,50,60,70],wave_count:[1,2,2,3,3],stun_duration:[0.1,0.15,0.2,0.25,0.3],crack_burn_hp_percent:[0.005,0.006,0.007,0.008,0.01]}
};
for(const [id,fields] of Object.entries(h5Curves))for(const [field,values] of Object.entries(fields))
 assert.deepEqual(index[id].levels.map(l=>l.stats[field]),values,`${id} ${field}`);
index.hero_5_skill_1.levels.forEach(l=>assert.equal(l.stats.fan_angle,10));
index.hero_5_skill_2.levels.forEach(l=>{
 assert.equal(l.stats.formation_duration,2);assert.equal(l.stats.rune_delay,1);
 assert.equal(l.stats.rune_duration,1.5);assert.equal(l.stats.rune_tick_interval,0.5);
 assert.equal(l.stats.stun_chance,0.35);assert(!Object.hasOwn(l.stats,'burn_hp_percent'));
});
index.hero_5_skill_3.levels.forEach(l=>{
 assert.equal(l.stats.impact_delay,0.35);assert.equal(l.stats.crack_duration,1);
 assert.equal(l.stats.wave_interval,0.2);assert.equal(l.stats.wave_stun_chance,0.2);
 assert.deepEqual(l.effects,[]);assert(!Object.hasOwn(l.stats,'wave_hp_percent'));
});
const golden=index.hero_5_skill_4;
assert.deepEqual(golden.punch_vfx_frames,Array.from({length:9},(_,i)=>`hero_5_skill1_effect1_${i}`));
assert.deepEqual(golden.levels.map(l=>l.stats.target_radius),[700,730,760,790,820]);
assert.deepEqual(golden.levels.map(l=>l.stats.punch_count),[12,14,16,18,20]);
golden.levels.forEach(l=>{
 assert.equal(l.stats.protection_duration,0.5);assert.equal(l.stats.golden_duration,2);
 assert.equal(l.stats.punch_interval,0.2);assert.equal(l.stats.same_target_damage_multiplier,0.5);
 assert.equal(l.stats.mark_pair_window,0.5);assert.equal(l.stats.mark_stun_window,1);
 assert.equal(l.stats.mark_reset_gap,1);assert.equal(l.stats.mark_stun_hits,3);
 assert.equal(l.stats.stun_duration,0.5);assert.equal(l.stats.stack_size_bonus,0.05);
 assert.deepEqual(l.effects,[]);assert(!Object.hasOwn(l.stats,'map_coverage'));
});
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
const ice=index.hero_1_skill_2;
const mastery=index.hero_1_skill_4;
assert.deepEqual(mastery.levels.map(l=>l.stats.speed_pct),[15,20,25,30,35]);
mastery.levels.forEach(l=>{
  assert.equal(l.stats.freeze_chance,0.3);
  assert.equal(l.stats.freeze_duration,0.2);
  assert.equal(l.stats.freeze_damage_multiplier,0.25);
});
assert.equal(ice.flank_bolt_config.damage_multiplier,0.4);
assert.deepEqual(ice.levels.map(l=>l.stats.radius),[100,120,140,160,180]);
assert.deepEqual(ice.levels.map(l=>l.stats.flank_bolts),[0,1,2,3,4]);
ice.levels.forEach(l=>assert(l.description_rows.some(row=>row.includes(l.stats.radius+'px'))));
const iceDomain=index.hero_1_skill_3;
assert.deepEqual(iceDomain.vfx_frames,['hero_1_skill4_beam','hero_1_skill4_trail','hero_1_skill4_seal','hero_1_skill4_domain'],'Hero 1 Skill 4 declares its four visual layers');
for(const [i,level] of iceDomain.levels.entries()){
  const stats=level.stats;
  assert.equal(stats.cooldown,[15,14.5,14,13.5,13][i]);
  assert.equal(stats.domain_duration,[6,7,8,9,10][i]);
  assert.equal(stats.domain_radius,[240,250,260,270,280][i]);
  assert.equal(stats.attack_speed_slow,[0.2,0.225,0.25,0.275,0.3][i]);
  assert.equal(stats.def_reduction,[0.15,0.175,0.2,0.225,0.25][i]);
  assert.equal(stats.damage_pct,0,'Support domain does not deal direct damage');
  assert.equal(stats.domain_slow_edge,0.1,'Ice domain slow at edge');
  assert.equal(stats.domain_slow_center,0.5,'Ice domain slow at seal');
}
const seal=index.hero_3_skill_2;
const fan=index.hero_3_skill_1,sequence=index.hero_3_skill_3,formation=index.hero_3_skill_4;
fan.levels.forEach(l=>{
  assert.equal(l.stats.projectile_speed,416);
  assert(!Object.hasOwn(l.stats,'speed_pct'));
  assert.equal(l.stats.angle_step,10);
  assert.equal(l.effects[0].distance,35);
});
assert.deepEqual(seal.levels.map(l=>l.stats.cooldown),[8,7.5,7,6.5,6]);
assert.deepEqual(sequence.levels.map(l=>l.stats.sequence_count),[6,8,10,12,14]);
assert.deepEqual(sequence.levels.map(l=>l.stats.cooldown),[12,11,10,9,8]);
assert.deepEqual(sequence.levels.map(l=>l.effects[0].distance),[40,45,50,55,60]);
sequence.levels.forEach(l=>assert.equal(l.stats.sequence_interval,0.1));
assert.deepEqual(formation.levels.map(l=>l.stats.skill_2_cooldown_reduction),[0.15,0.2,0.25,0.3,0.35]);
assert.deepEqual(formation.levels.map(l=>l.stats.skill_3_crit_damage_bonus),[0.1,0.15,0.2,0.25,0.3]);
formation.levels.forEach((l,i)=>{
  assert.equal(l.stats.move_speed_pct,i*5);
  const effect=l.passive_effects.find(e=>e.stat==='move_speed');
  assert.equal(effect.type,'stat_percent');
  assert(Math.abs(effect.value-i*0.05)<1e-9);
});
const vortex=index.hero_4_skill_4;
assert.deepEqual(vortex.needle_vfx_frames,Array.from({length:9},(_,i)=>`hero_4_skill_4b_frame_${i}`));
const h4Curves={
 hero_4_skill_1:{cooldown:[2.4,2.2,2,1.8,1.6],range:[680,700,720,740,760],projectile_count:[1,2,2,3,3]},
 hero_4_skill_2:{cooldown:[6.5,6,5.5,5,4.5],range:[700,720,740,760,780]},
 hero_4_skill_3:{radius:[85,95,105,115,125],trigger_radius:[125,145,165,185,205],range:[725,750,775,800,825],trap_lifetime:[12.5,15,17.5,20,25],max_traps:[3,4,5,6,9],explosion_vfx_scale:[0.897,1.014,1.131,1.248,1.404]},
 hero_4_skill_4:{radius:[80,85,90,95,100],needle_range:[250,275,300,325,350]}
};
for(const [id,fields] of Object.entries(h4Curves))for(const [field,values] of Object.entries(fields))
 assert.deepEqual(index[id].levels.map(l=>l.stats[field]),values,`${id} ${field}`);
index.hero_4_skill_1.levels.forEach(l=>assert.equal(l.effects[0].duration,2));
assert.deepEqual(index.hero_4_skill_2.levels.map(l=>l.effects[0].slow_percent),[0.15,0.175,0.2,0.225,0.25]);
assert.deepEqual(index.hero_4_skill_3.levels.map(l=>l.effects[0].duration),[3,3.5,4,4.5,5]);
assert.deepEqual(index.hero_4_skill_3.levels.map(l=>l.effects[1].slow_percent),[0.1,0.15,0.2,0.25,0.3]);
index.hero_4_skill_3.levels.forEach(l=>{assert.equal(l.stats.explosion_duration,1.5);assert.equal(l.stats.explosion_loop,true);});
assert.deepEqual(vortex.levels.map(level=>level.stats.needle_count),[4,5,6,7,8]);
for(const level of vortex.levels){
  const s=level.stats;
  assert.equal(s.vortex_duration,2.5); assert.equal(s.vortex_animation_duration,1);
  assert.equal(s.needle_delay,0.5); assert.equal(s.needle_interval,0.1);
  assert.equal(s.vortex_spin_speed,400);assert.equal(s.vortex_tick_count,5);
  assert.equal(s.needle_poison_atk_pct,5);assert.equal(s.needle_poison_dps_cap,5000);
  assert.equal(s.needle_poison_duration_extension,0.5);
  assert.equal(level.effects[0].chance,0.2);
  assert(!Object.hasOwn(s,'stack_hp_percent'));
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

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.range),[1920, 1920, 1920, 1920, 1920]);

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.radius),[140, 150, 160, 170, 180]);

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.wave_radius),[200, 220, 240, 260, 280]);

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.wave_ring_width),[48, 48, 48, 48, 48]);

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.wave_collision_padding),[32, 32, 32, 32, 32]);

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.vfx_scale),[0.4312, 0.462, 0.4928, 0.5236, 0.5544]);

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.crack_vfx_scale),[0.728, 0.8064, 0.896, 0.9856, 1.0976]);

assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.wave_vfx_scale),[0.896, 0.9856, 1.0752, 1.176, 1.288]);

assert.deepEqual(index.hero_3_skill_3.levels.map(l=>l.stats.arc_speed_pct),[182,192.5,203,217,234.5]);
assert.deepEqual(index.hero_3_skill_3.levels.map(l=>l.stats.speed_pct),[260,275,290,310,335]);

assert.deepEqual(index.hero_4_skill_3.levels.map(l=>l.stats.vfx_scale),[0.051,0.054,0.057,0.06,0.063]);

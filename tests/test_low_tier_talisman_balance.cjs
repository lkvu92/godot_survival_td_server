const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const read = name => JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const skills = read('skills');
const talismans = read('talismans');
const items = read('items');
const atlas = JSON.parse(fs.readFileSync(path.join(root,'../client/data/atlas_registry.json'),'utf8'));
for (let id=2; id<=15; id++) {
  const skill = skills.find(x=>x.id===`skill_talisman_${id}`);
  const item = items.find(x=>x.id===`talisman_${id}`);
  const talisman = talismans.find(x=>x.id===id);
  assert.equal(talisman.skill_id,skill.id);
  assert.equal(item.attributes.skill_id,skill.id);
  assert.equal(talisman.quality,'low');
  assert.equal(skill.element,talisman.element);
  assert.equal(talisman.skill,skill.description);
  assert.equal(skill.levels.length,5);
  assert.equal(skill.vfx_frames.length,9);
  const sheetId = skill.vfx_frames[0].replace(/_0$/,'');
  assert.deepEqual(skill.vfx_frames,Array.from({length:9},(_,i)=>`${sheetId}_${i}`));
  const sheet = atlas.spritesheet_vfx[sheetId];
  if (id===14) {
    assert.ok(sheet.path.includes('/skill_talisman_14/layer-01-thorn-impact.draft.png'),'Hap Huyet Thu must use normalized thorn art, not the old red vortex');
    assert.equal(skill.cast_config.impact_delay,.21);
    assert.equal(skill.cast_config.vfx_duration,.63);
  }
  assert.equal(sheet.columns,3); assert.equal(sheet.rows,3); assert.equal(sheet.frame_count,9);
  const bytes = fs.readFileSync(path.join(root,'../client',sheet.path.replace('res://','')));
  assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16)%3,0); assert.equal(bytes.readUInt32BE(20)%3,0);
  assert.ok(skill.sfx_events.some(x=>x.timing==='cast'));
  for (let index=0; index<5; index++) {
    const level = skill.levels[index];
    const c = {...skill.cast_config,...level.cast_config};
    assert.equal(level.level,index+1);
    assert.equal(level.stats.cooldown,id===15?0:30-index);
    assert.ok(!level.cast_config,'fixed low-tier coefficients cannot be shadowed by old level overrides');
    assert.deepEqual(level.description_rows.slice(0,skill.description_rows.length),skill.description_rows);
    if (c.status_id==='freeze' || c.status_id==='stun') {
      assert.ok(c.status_chance<=.25 && c.status_duration<=.5,'low-tier hard control budget');
    }
    if (c.defense_ignore_pct) assert.ok(c.defense_ignore_pct<=.15);
    assert.ok(!c.execute_threshold && !c.true_damage,'higher-tier privileges excluded');
    if (id===2) assert.ok(c.center_damage_pct<=150 && c.damage_per_slash_pct*2<=c.center_damage_pct);
    if (id===3) assert.ok(c.damage_min_pct>=100 && c.damage_max_pct<=180);
    if (id===5) assert.ok(c.effects[0].hp_percent_per_sec*c.duration<=.06);
    if (id===6) assert.ok(c.heal_atk_pct<=150);
    if (id===7) assert.ok(c.damage_pct<=180 && c.radius<=120 && c.minimum_hp===1 && c.self_max_hp_cost_pct===.1);
    if (id===8) assert.ok(c.projectile_count*c.damage_pct<=135 && c.pierce===0);
    if (id===9 || id===10) assert.ok(c.damage_pct<=90);
    if (id===11) assert.ok(c.damage_pct_by_shot.reduce((a,b)=>a+b,0)<=140);
    if (id===12) assert.ok(c.effects[0].defense_flat===0 && c.duration<=3 && c.effects[0].defense_percent<=.3);
    if (id===13) assert.ok(c.strike_count*c.damage_pct<=105);
    if (id===14) assert.ok(c.damage_pct<=100 && c.lifesteal_pct<=.2);
    if (id===15) {
      assert.equal(skill.activation,'passive'); assert.equal(skill.skill_class,'passive');
      assert.ok(c.damage_pct/c.target_contact_cooldown<=16,'single-target passive raw DPS ceiling');
      assert.ok(c.contact_cooldown>=1.5 && c.orb_count===3);
    }
    if ([4,12].includes(id)) assert.ok(c.duration<=3);
  }
}
// These rows must survive the rebalance byte-for-byte semantically. Ignore
// unrelated hero edits already present in the working tree.
if (process.argv.includes('--compare-head')) {
  const previous = JSON.parse(execFileSync('git',['show','HEAD:data/skills.json'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}));
  for (const old of previous.filter(x=>/^skill_talisman_/.test(x.id) && (x.id==='skill_talisman_1' || Number(x.id.split('_').pop())>=26))) {
    assert.deepEqual(skills.find(x=>x.id===old.id),old,`preserve ${old.id}`);
  }
  console.log('PASS unchanged talismans 1/26–30 compared with HEAD (mid-tier 16–25 covered by C230)');
}
console.log('PASS C015: 14 mappings, five levels, low-tier budgets and atlas/SFX');

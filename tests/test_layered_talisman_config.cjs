const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
const skills = read('skills');
const talismans = read('talismans');
const items = read('items');
const specs = {16:['water','ice'],26:['metal','slash'],27:['earth','stasis'],28:['water','reversal'],29:['wood','painting'],30:['fire','axe']};
for (const [id,[element,behavior]] of Object.entries(specs)) {
  const skill = skills.find(s => s.id === 'skill_talisman_' + id);
  assert.equal(skill.skill_type,'layered_talisman');
  assert.equal(skill.element,element);
  assert.equal(skill.cast_config.behavior,behavior);
  assert.equal(talismans.find(t=>t.id===Number(id)).element,element);
  assert.equal(items.find(t=>t.id==='talisman_'+id).attributes.element,element);
  assert.equal(skill.levels.length,5);
  for(const level of skill.levels) {
    const config = {...skill.cast_config,...level.cast_config};
    assert.equal(level.stats.projectile_count,1);
    assert.ok(config.range>0 && config.duration>0);
    assert.equal(config.damage_pct,behavior==='reversal'?0:level.stats.damage_pct);
    assert.equal(Object.keys(config.layers).length,4);
    for(const layer of Object.values(config.layers)) {
      assert.ok(layer.duration>0 && layer.duration<=86400);
      assert.ok(layer.frames.length===1 || layer.frames.length===9);
      assert.ok(layer.frames.every(f=>f.startsWith('talisman_'+id+'_')));
      assert.equal(layer.scale.length,2);
      assert.ok(layer.scale.every(x=>Number.isFinite(x)&&x>0));
    }
    if(behavior==='ice') {
      assert.equal(config.sword_ratio+config.spikes_ratio,1);
      assert.equal(config.radius,90+level.level*10);
      assert.ok(config.sword_at<config.spikes_at && config.spikes_at<config.freeze_at);
    }
    if(behavior==='slash') {
      assert.equal(config.slash_count,4);
      assert.equal(config.slash_interval,.2);
      assert.equal(config.final_slash_scale,1.5);
    }
    if(behavior==='axe') {
      assert.equal(config.axe_ratio+config.pillar_ratio,1);
      assert.equal(config.pillar_positions.length,3);
      assert.deepEqual(config.pillar_positions,[[72,72],[0,0],[-72,-72]]);
      assert.equal(config.pillar_interval,.25);
      assert.equal(config.axe_foot_offset,26);
      assert.equal(config.impact_shake_intensity,7);
      assert.deepEqual([config.pillar_1_scale,config.pillar_2_scale,config.pillar_3_scale],[1,1.5,3]);
      assert.equal(config.pillar_push_distance,110);
    }
    if(behavior==='stasis') {
      assert.equal(config.ring_count,3);
      assert.equal(config.stasis_duration,2.5);
      assert.equal(config.bell_ratio + config.ring_count * config.ring_ratio,1);
      assert.equal(config.ring_interval,.35);
      assert.deepEqual(config.layers.bell.scale,[1.155,1.155]);
    }
    if(behavior==='reversal') {assert.equal(config.absorb_ratio,.7); assert.equal(config.reflect_ratio,.3); assert.equal(config.counter_directions,8); assert.equal(config.aura_height,0); assert.deepEqual(config.layers.aura.scale,[1.2,1.2]); assert.deepEqual(config.layers.counter.scale,[2.4,2.4]);}
    if(behavior==='painting') {
      assert.equal(config.vortex_tick_count,3);
      assert.equal(config.vortex_tick_interval,.5);
      assert.equal(config.mountain_ratio + config.vortex_tick_count * config.vortex_ratio,1);
      assert.equal(config.layers.vortex.loop,true);
      assert.ok(config.layers.vines.duration < 1);
    }
  }
}
console.log('PASS C137 six layered seed skills, five levels, elements, layer references and damage budgets');

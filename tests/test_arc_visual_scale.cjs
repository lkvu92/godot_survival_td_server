const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.json`), 'utf8'));
const arcs = read('arcs');
const stages = read('stages');
const enemies = new Map(read('enemies').map(enemy => [enemy.id, enemy]));
const arc2 = arcs.find(arc => arc.order === 2);
const iceGolem = enemies.get('ice_golem');
assert.ok(arc2 && iceGolem?.is_boss, 'Arc 2 Ice Golem is required as the boss size reference');
const renderedSize = (enemy, arc) => Number(enemy.boss_visual_scale ?? 0.442) * Number(enemy.boss_scale ?? 1.65) * Number(arc.enemy_visual_scale_multiplier ?? 1);
const maxBossSize = renderedSize(iceGolem, arc2) * 1.3;
for (const order of [1, 3, 4, 5]) {
  const arc = arcs.find(candidate => candidate.order === order);
  assert.ok(arc, `Missing Arc order ${order}`);
  assert.equal(arc.enemy_visual_scale_multiplier, 1.6, `Arc ${order} creeps must render 20% smaller`);
  const enemyIds = new Set();
  for (const stage of stages.filter(stage => stage.arc_id === arc.id)) for (const wave of stage.waves) for (const entry of wave.entries) enemyIds.add(entry.enemy_id);
  for (const enemyId of enemyIds) {
    const enemy = enemies.get(enemyId);
    assert.ok(enemy, `Arc ${order} references ${enemyId}`);
    if (enemy.is_boss) assert.ok(renderedSize(enemy, arc) <= maxBossSize + 1e-9, `${enemyId} exceeds the 1.3x Arc 2 Golem cap`);
  }
}
console.log('PASS arc 1/3/4/5 creep scale reduction and boss size cap');

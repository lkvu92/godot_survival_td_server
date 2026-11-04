// Read-only local verification of the applied migration and authenticated config.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {database, runtime} = require('../tools/enemy_catalog_db.cjs');
const root = path.resolve(__dirname, '../..'), nk = database(), ctx = runtime();
const dir = path.join(root, 'server/temp/enemy-catalog');
const backup = fs.readdirSync(dir).filter(x => /^before-c261-\d+\.json$/.test(x)).sort().at(-1);
assert(backup, 'Missing C261 backup');
const before = JSON.parse(fs.readFileSync(path.join(dir, backup))), current = ctx.ecRead(nk);
assert(current.metadata.c261_boss_speed_reduction);
const projected = ctx.ecProject(current); assert.deepEqual(JSON.parse(JSON.stringify(projected.errors)), []);
const close = (x, y) => assert(Math.abs(x-y) < 1e-8, `${x} != ${y}`);
const elements = ['metal','water','wood','fire','earth'];
let bossCount = 0, rows = 0, legacyCount = 0;
for (const element of elements) {
  const old = before.draft.metadata.framework.boss_element_baselines[element];
  const fresh = current.metadata.framework.boss_element_baselines[element];
  close(fresh.attack_speed, old.attack_speed * 0.7);
  close(fresh.move_speed, old.move_speed * 0.6);
}
for (const old of before.draft.catalog) {
  const fresh = current.catalog.find(x => x.id === old.id); assert(fresh);
  if (old.data.kind !== 'boss' && old.data.balance_profile !== 'element_boss') {
    assert.equal(ctx.ecCanonical(fresh.data), ctx.ecCanonical(old.data), `Non-boss changed: ${old.id}`); continue;
  }
  bossCount++;
  for (const key of ['base_attributes','growth_per_level']) for (const [stat, factor] of [['attack_speed',0.7],['move_speed',0.6]]) {
    if (Object.hasOwn(old.data[key], stat)) close(fresh.data[key][stat], old.data[key][stat] * factor);
  }
  if (old.data.balance_profile === 'element_boss') for (const e of elements) {
    close(fresh.data.element_baselines[e].attack_speed, old.data.element_baselines[e].attack_speed * 0.7);
    close(fresh.data.element_baselines[e].move_speed, old.data.element_baselines[e].move_speed * 0.6); rows++;
  }
}
for (const [id, enemy] of Object.entries(before.draft.metadata.legacy_enemies)) if (enemy.is_boss) {
  const fresh = current.metadata.legacy_enemies[id];
  close(fresh.attributes.attack_speed, enemy.attributes.attack_speed * 0.7);
  close(fresh.attributes.move_speed, enemy.attributes.move_speed * 0.6);
  const live = nk.sqlQuery('SELECT catalog_projection FROM game_enemies WHERE id=$1', [id])[0];
  assert(live, `Missing legacy boss ${id}`);
  close(Number(live.catalog_projection.attributes.attack_speed), fresh.attributes.attack_speed);
  close(Number(live.catalog_projection.attributes.move_speed), fresh.attributes.move_speed);
  legacyCount++;
}
async function main() {
  const project = fs.readFileSync(path.join(root,'client/project.godot'),'utf8');
  const key = project.match(/develop_server_key="([^"]+)"/)?.[1] || 'defaultkey';
  const app = fs.readFileSync(path.join(root,'client/src/services/ConfigService.gd'),'utf8').match(/APP_VERSION := "([^"]+)"/)[1];
  const auth = await fetch('http://127.0.0.1:7350/v2/account/authenticate/device?create=false', {method:'POST', headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({id:'c239-arc1-local-acceptance-device'})});
  assert(auth.ok, `Local fixture authentication failed: ${auth.status}`);
  const session = await auth.json();
  async function call(id, payload) {
    const response = await fetch('http://127.0.0.1:7350/v2/rpc/'+id, {method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({app_version:app,...payload}))});
    assert(response.ok, `RPC transport ${response.status}`); return JSON.parse((await response.json()).payload);
  }
  const servers = await call('list_servers', {}), server = servers.servers.find(s => s.status === 'open' && s.allow_new_characters); assert(server);
  const config = await call('get_game_config', {table:'all',server_id:server.server_id,generation:Number(server.generation)});
  for (const old of before.draft.catalog.filter(x => x.active && x.data.balance_profile === 'element_boss')) for (const e of elements) {
    const got = config.progression.enemy_framework.species[old.id].element_baselines[e];
    close(got.attack_speed, old.data.element_baselines[e].attack_speed * 0.7);
    close(got.move_speed, old.data.element_baselines[e].move_speed * 0.6);
  }
  console.log(JSON.stringify({status:'PASS',boss_species:bossCount,boss_element_rows:rows,legacy_bosses:legacyCount,revision:current.revision,runtime_version:current.metadata.runtime_version,authenticated_config:true,non_boss_unchanged:true}));
}
main().catch(e => { console.error(e.stack || String(e)); process.exitCode = 1; });

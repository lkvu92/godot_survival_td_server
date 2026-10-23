// C158: update only wood_swamp thorn placement/presentation in local development.
const fs = require('fs'), path = require('path'), assert = require('assert');
const {execFileSync} = require('child_process');
const docker = args => execFileSync('docker', args, {encoding:'utf8', stdio:['pipe','pipe','pipe']}).trim();
const environment = meta => Object.fromEntries(meta.Config.Env.map(entry => {
  const i = entry.indexOf('='); return [entry.slice(0,i), entry.slice(i+1)];
}));
const keepAlive = setInterval(() => {}, 1000);
(async () => {
  const nkName = 'survival_td_local-nakama-1', pgName = 'survival_td_local-postgres-1';
  const nk = JSON.parse(docker(['inspect', nkName]))[0];
  const pg = JSON.parse(docker(['inspect', pgName]))[0];
  for (const meta of [nk, pg]) assert.equal(meta.Config.Labels['com.docker.compose.project'], 'survival_td_local');
  const binding = nk.NetworkSettings.Ports['7350/tcp'][0];
  assert.equal(binding.HostIp, '127.0.0.1');
  const env = environment(nk), pgEnv = environment(pg);
  assert(env.NAKAMA_HTTP_KEY && pgEnv.POSTGRES_USER && pgEnv.POSTGRES_DB);
  const sql = query => docker(['exec', pgName, 'psql', '-U', pgEnv.POSTGRES_USER, '-d', pgEnv.POSTGRES_DB, '-t', '-A', '-c', query]);
  const ids = ['ancient_treant', 'poison_hydra'];
  const query = "SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM game_enemies e WHERE id IN ('ancient_treant','poison_hydra')";
  const before = JSON.parse(sql(query));
  assert.equal(before.length, 2);
  const restQuery = "SELECT md5(COALESCE(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'')) FROM game_enemies e WHERE id NOT IN ('ancient_treant','poison_hydra')";
  const otherHash = sql(restQuery);
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/enemies.json'), 'utf8'));
  const rows = before.map(row => {
    const desired = seed.find(e => e.id === row.id).boss_skills.find(s => s.type === 'wood_swamp');
    assert(desired && desired.thorn_diameter > 0 && desired.thorn_vertical_ratio === 0.55);
    const boss_skills = structuredClone(row.boss_skills);
    const swamp = boss_skills.find(s => s.type === 'wood_swamp');
    assert(swamp, 'Existing local wood_swamp required');
    // Preserve every other field in these arrays and every other enemy column.
    for (const key of ['thorn_offset','thorn_diameter','thorn_vertical_ratio']) swamp[key] = desired[key];
    return {...row, boss_skills};
  });
  const response = await fetch('http://127.0.0.1:' + binding.HostPort + '/v2/rpc/seed_game_data?http_key=' + encodeURIComponent(env.NAKAMA_HTTP_KEY), {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(JSON.stringify({table:'enemies', rows})), signal:AbortSignal.timeout(20000)
  });
  assert(response.ok, 'Local enemy seed HTTP ' + response.status);
  const result = JSON.parse((await response.json()).payload);
  assert(result.success === true && result.inserted === 2, 'Expected exactly two enemy upserts');
  const after = JSON.parse(sql(query));
  for (const [index, row] of after.entries()) {
    assert(ids.includes(row.id));
    assert.deepStrictEqual(row.boss_skills, rows[index].boss_skills);
    const prior = {...before[index]}, next = {...row};
    for (const key of ['boss_skills','updated_at']) {delete prior[key]; delete next[key];}
    assert.deepStrictEqual(next, prior, 'Other enemy columns must not change');
  }
  assert.equal(sql(restQuery), otherHash, 'Other enemies must not change');
  console.log('PASS local wood thorn sync: two skill arrays read back; balance, other enemies and profiles unchanged');
})().catch(() => {
  console.error('Local wood thorn sync failed; inspect local container state. Credentials were not logged.');
  process.exitCode = 1;
}).finally(() => clearInterval(keepAlive));

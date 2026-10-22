// C172: update only the four skills of the named local development enemy.
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
  const query = "SELECT to_jsonb(e) FROM game_enemies e WHERE id='primordial_wraith'";
  const before = JSON.parse(sql(query));
  const restQuery = "SELECT md5(COALESCE(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'')) FROM game_enemies e WHERE id<>'primordial_wraith'";
  const otherHash = sql(restQuery);
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/enemies.json'), 'utf8')).find(e => e.id === 'primordial_wraith');
  assert(seed && seed.boss_skills.length === 4);
  // Preserve the local database's existing balance and all other columns.
  const row = {...before, boss_skills: seed.boss_skills};
  const response = await fetch('http://127.0.0.1:' + binding.HostPort + '/v2/rpc/seed_game_data?http_key=' + encodeURIComponent(env.NAKAMA_HTTP_KEY), {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(JSON.stringify({table:'enemies', rows:[row]})), signal:AbortSignal.timeout(20000)
  });
  assert(response.ok, 'Local enemy seed HTTP ' + response.status);
  const wire = await response.json(), result = JSON.parse(wire.payload);
  assert(result.success === true && result.inserted === 1, 'Expected exactly one enemy upsert');
  const after = JSON.parse(sql(query));
  assert.deepStrictEqual(after.boss_skills, seed.boss_skills);
  delete before.boss_skills; delete after.boss_skills;
  delete before.updated_at; delete after.updated_at;
  assert.deepStrictEqual(after, before, 'Other Wraith columns must not change');
  assert.equal(sql(restQuery), otherHash, 'Other enemies must not change');
  console.log('PASS local Wraith sync: four skills read back, balance and other enemies unchanged; no production/profile writes');
})().catch(() => {
  console.error('Local Wraith sync failed; inspect local container state. Credentials were not logged.');
  process.exitCode = 1;
}).finally(() => clearInterval(keepAlive));

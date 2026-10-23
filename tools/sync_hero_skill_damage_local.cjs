// Explicit local-only, hero-skill-only seed. Never print container credentials.
const fs=require('fs'),path=require('path'),assert=require('assert');
const {execFileSync}=require('child_process');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const environment=meta=>Object.fromEntries(meta.Config.Env.map(e=>{const i=e.indexOf('=');return[e.slice(0,i),e.slice(i+1)];}));
const keepAlive=setInterval(()=>{},1000);
(async()=>{
  const nakama='survival_td_local-nakama-1',postgres='survival_td_local-postgres-1';
  const meta=JSON.parse(docker(['inspect',nakama]))[0],pg=JSON.parse(docker(['inspect',postgres]))[0];
  for(const m of [meta,pg])assert.equal(m.Config.Labels['com.docker.compose.project'],'survival_td_local');
  const binding=meta.NetworkSettings.Ports['7350/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
  const env=environment(meta),pgEnv=environment(pg);assert(env.NAKAMA_HTTP_KEY&&pgEnv.POSTGRES_USER&&pgEnv.POSTGRES_DB);
  const sql=q=>docker(['exec',postgres,'psql','-U',pgEnv.POSTGRES_USER,'-d',pgEnv.POSTGRES_DB,'-t','-A','-c',q]);
  const unchanged="SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'')) FROM game_skills s WHERE id !~ '^hero_[1-5]_skill_[1-4]$'";
  const before=sql(unchanged);
  const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8')).filter(s=>/^hero_[1-5]_skill_[1-4]$/.test(s.id));
  assert.equal(rows.length,20);
  const response=await fetch('http://127.0.0.1:'+binding.HostPort+'/v2/rpc/seed_game_data?http_key='+encodeURIComponent(env.NAKAMA_HTTP_KEY),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({table:'skills',rows})),signal:AbortSignal.timeout(20000)});
  assert(response.ok,'Local skill seed HTTP '+response.status);
  const wire=await response.json(),result=JSON.parse(wire.payload);
  assert(result.success===true&&result.inserted===20,'Hero-only skill seed failed');
  const stored=JSON.parse(sql("SELECT json_agg(s ORDER BY id) FROM (SELECT id,levels FROM game_skills WHERE id ~ '^hero_[1-5]_skill_[1-4]$') s"));
  assert.equal(stored.length,20);
  for(const row of stored)assert.deepStrictEqual(row.levels,rows.find(s=>s.id===row.id).levels,'Readback mismatch '+row.id);
  assert.equal(sql(unchanged),before,'Non-hero skills must remain unchanged');
  console.log('PASS local hero damage sync: exactly 20 hero rows seeded/read back; non-hero skills unchanged; no production or profile writes');
})().catch(()=>{console.error('Local hero damage sync failed. Check local container/DB status; credentials were not logged.');process.exitCode=1;}).finally(()=>clearInterval(keepAlive));

// Scoped to the loopback-only survival_td_local stack. Never print credentials.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
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
  const sql=q=>docker(['exec',postgres,'psql','-X','-U',pgEnv.POSTGRES_USER,'-d',pgEnv.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-t','-A','-c',q]);
  const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8')).filter(s=>/^hero_3_skill_[1-4]$/.test(s.id));
  assert.equal(rows.length,4);
  const unchanged="SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'')) FROM game_skills s WHERE id !~ '^hero_3_skill_[1-4]$'";
  const before=sql(unchanged);
  const previous=JSON.parse(sql("SELECT json_agg(s ORDER BY id) FROM game_skills s WHERE id ~ '^hero_3_skill_[1-4]$'"));
  fs.mkdirSync(path.join(__dirname,'../../tmp'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'../../tmp/hero3_skill_config_before.json'),JSON.stringify(previous,null,2));
  const response=await fetch('http://127.0.0.1:'+binding.HostPort+'/v2/rpc/seed_game_data?http_key='+encodeURIComponent(env.NAKAMA_HTTP_KEY),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({table:'skills',rows})),signal:AbortSignal.timeout(20000)});
  assert(response.ok,'Local skill seed HTTP '+response.status);
  const result=JSON.parse((await response.json()).payload);
  assert(result.success===true&&result.inserted===4,'Hero 3 seed failed');
  const stored=JSON.parse(sql("SELECT json_agg(s ORDER BY id) FROM (SELECT id,levels,vfx_frames,metadata FROM game_skills WHERE id ~ '^hero_3_skill_[1-4]$') s"));
  for(const row of stored){
    const expected=rows.find(s=>s.id===row.id);
    assert.deepEqual(row.levels,expected.levels);
    assert.deepEqual(row.vfx_frames,expected.vfx_frames);
    if(row.id==='hero_3_skill_2'){
      assert.deepEqual(row.metadata.phase_b_vfx_frames,expected.phase_b_vfx_frames);
      assert.deepEqual(row.metadata.wave_vfx_frames,expected.wave_vfx_frames);
      assert(!Object.hasOwn(row.metadata,'phase_b_aoe_type'));
    }
  }
  assert.equal(sql(unchanged),before,'Other skills must remain unchanged');
  // The catalog is read live, but bump the bootstrap version so cached clients refresh.
  sql("BEGIN; LOCK TABLE remote_config_releases IN EXCLUSIVE MODE; INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by) SELECT config_version+1,snapshot,min_app_version,latest_app_version,store_url,'local:C183:hero3-falling-seal' FROM remote_config_releases ORDER BY config_version DESC LIMIT 1; COMMIT;");
  console.log('PASS local Hero 3 sync: four skill rows and all frame metadata verified; config version advanced; other skills unchanged.');
})().catch(()=>{console.error('Local Hero 3 sync failed; inspect local stack status. Credentials were not logged.');process.exitCode=1;}).finally(()=>clearInterval(keepAlive));

// Local-only publication of the three C196 v1.3 skill rows.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {execFileSync}=require('child_process');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const envOf=m=>Object.fromEntries(m.Config.Env.map(e=>{const i=e.indexOf('=');return[e.slice(0,i),e.slice(i+1)];}));
(async()=>{
 const nk='survival_td_local-nakama-1',pg='survival_td_local-postgres-1';
 const nm=JSON.parse(docker(['inspect',nk]))[0],pm=JSON.parse(docker(['inspect',pg]))[0];
 for(const m of [nm,pm])assert.equal(m.Config.Labels['com.docker.compose.project'],'survival_td_local');
 const binding=nm.NetworkSettings.Ports['7350/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
 const ne=envOf(nm),pe=envOf(pm);
 const sql=q=>docker(['exec',pg,'psql','-X','-U',pe.POSTGRES_USER,'-d',pe.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-t','-A','-c',q]);
 const ids=['hero_4_skill_1','hero_4_skill_2','hero_4_skill_4'];
 const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8')).filter(s=>ids.includes(s.id));assert.equal(rows.length,3);
 const filter="('hero_4_skill_1','hero_4_skill_2','hero_4_skill_4')";
 const untouched=`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'')) FROM game_skills s WHERE id NOT IN ${filter}`;
 const before=sql(untouched);
 fs.writeFileSync(path.join(__dirname,'../tmp/hero4_revision13_before.json'),sql(`SELECT jsonb_agg(to_jsonb(s)) FROM game_skills s WHERE id IN ${filter}`));
 const response=await fetch('http://127.0.0.1:'+binding.HostPort+'/v2/rpc/seed_game_data?http_key='+encodeURIComponent(ne.NAKAMA_HTTP_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({table:'skills',rows})),signal:AbortSignal.timeout(20000)});
 assert(response.ok);const result=JSON.parse((await response.json()).payload);assert(result.success&&result.inserted===3);
 for(const row of rows){const saved=JSON.parse(sql(`SELECT row_to_json(s) FROM game_skills s WHERE id='${row.id}'`));assert.deepEqual(saved.levels,row.levels);assert.deepEqual(saved.criteria_unlock,row.createria_unlock);}
 assert.equal(sql(untouched),before);
 sql("BEGIN; LOCK TABLE remote_config_releases IN EXCLUSIVE MODE; INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by) SELECT config_version+1,snapshot,min_app_version,latest_app_version,store_url,'local:C196:1.3.0' FROM remote_config_releases ORDER BY config_version DESC LIMIT 1; COMMIT;");
 console.log('PASS local C196 v1.3: three skill rows verified, other skills unchanged, config version advanced');
})().catch(e=>{console.error('Local C196 sync failed:',e.message.replace(/http_key=[^\s]+/g,'http_key=REDACTED'));process.exitCode=1;});

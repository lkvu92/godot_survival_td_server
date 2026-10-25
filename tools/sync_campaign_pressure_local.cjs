// C218: local-only wave/settings update. Never writes profiles or logs credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024}).trim();
const environment=m=>Object.fromEntries(m.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8'));
(async()=>{
  const nkName='survival_td_local-nakama-1',pgName='survival_td_local-postgres-1';
  const nk=JSON.parse(docker(['inspect',nkName]))[0],pg=JSON.parse(docker(['inspect',pgName]))[0];
  for(const m of [nk,pg])assert.equal(m.Config.Labels['com.docker.compose.project'],'survival_td_local');
  const binding=nk.NetworkSettings.Ports['7350/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
  const env=environment(nk),pe=environment(pg);
  const sql=q=>docker(['exec','-i',pgName,'psql','-U',pe.POSTGRES_USER,'-d',pe.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-t','-A'],q);
  const active=JSON.parse(sql('SELECT row_to_json(r) FROM remote_config_releases r ORDER BY config_version DESC LIMIT 1;'));
  const rows=JSON.parse(sql("SELECT json_agg(r) FROM remote_config_settings r WHERE is_active=TRUE;"));
  const draft={system:{},game_play:{}};
  for(const r of rows)draft[r.module][r.key]=r.value_type==='string'?r.value:JSON.parse(r.value);
  // Do not accidentally publish anyone else's pending settings.
  const expected=structuredClone(active.snapshot);
  delete expected.system.campaign_wave_pressure;
  delete draft.system.campaign_wave_pressure;
  assert.deepEqual(canonical(draft),canonical(expected),'Unrelated unpublished local settings; refusing to publish');
  const rules=read('campaign_wave_pressure');
  const arcs=read('arcs').filter(a=>a.order>=1);
  const ids=arcs.flatMap(a=>a.stage_ids);
  const stages=read('stages').filter(s=>ids.includes(s.id));assert.equal(stages.length,50);
  for(const arc of arcs)arc.stage_ids.forEach((id,i)=>assert.equal(stages.find(s=>s.id===id).waves.length,arc.order===1?Math.min(15+i,20):20));
  const where='stage_id IN ('+ids.map(quote).join(',')+')';
  const backup={release:active,waves:JSON.parse(sql('SELECT json_agg(w ORDER BY stage_id,wave_index) FROM game_stage_waves w WHERE '+where+';')),
    setting:JSON.parse(sql("SELECT COALESCE(json_agg(r),'[]') FROM remote_config_settings r WHERE module='system' AND key='campaign_wave_pressure';"))};
  const verifyWaves=()=>{
    const stored=JSON.parse(sql('SELECT json_agg(w ORDER BY stage_id,wave_index) FROM game_stage_waves w WHERE '+where+';'));
    assert.equal(stored.length,985);
    for(const stage of stages)stage.waves.forEach((wave,index)=>{
      const row=stored.find(w=>w.stage_id===stage.id&&w.wave_index===index);
      assert(row,'Missing local wave');
      assert.deepEqual(row.entries,wave.entries,'Local wave entries mismatch');
    });
  };
  if(process.argv.includes('--verify')){
    verifyWaves();assert.deepEqual(active.snapshot.system.campaign_wave_pressure,rules);
    console.log('PASS local C218 readback: exact 985 wave entries and published System rules match seed');return;
  }
  if(process.argv.includes('--check')){console.log('PASS local C218 preflight: loopback-only containers, 50 stages, no unrelated draft changes');return;}
  assert(process.argv.includes('--apply'),'Use --check or --apply');
  const token=fs.readFileSync(path.join(__dirname,'../nakama/runtime.local.secret.yml.publish-token'),'utf8').trim();
  assert(token.length>=64 && env.NAKAMA_HTTP_KEY,'Local operator credentials unavailable');
  const backupDir=path.join(__dirname,'../nakama/backups');fs.mkdirSync(backupDir,{recursive:true});
  fs.writeFileSync(path.join(backupDir,'C218-'+Date.now()+'.json'),JSON.stringify(backup),{flag:'wx'});
  const untouchedQuery='SELECT md5(COALESCE(jsonb_agg(to_jsonb(w) ORDER BY stage_id,wave_index)::text,\'\')) FROM game_stage_waves w WHERE NOT ('+where+');';
  const untouched=sql(untouchedQuery);
  sql(`BEGIN;
    SELECT pg_advisory_xact_lock(143,2);
    DELETE FROM game_stage_waves WHERE ${where};
    INSERT INTO game_stage_waves(stage_id,wave_index,wave_id,display_name,entries)
    SELECT s->>'id',(w.ordinality-1)::int,w.value->>'wave_id',w.value->>'display_name',w.value->'entries'
    FROM jsonb_array_elements(${quote(JSON.stringify(stages))}::jsonb) s
    CROSS JOIN LATERAL jsonb_array_elements(s->'waves') WITH ORDINALITY w(value,ordinality);
    INSERT INTO remote_config_settings(module,key,value_type,value,description,is_active,updated_by)
    VALUES('system','campaign_wave_pressure','json',${quote(JSON.stringify(rules))},'C218 campaign wave pressure',TRUE,'local:C218')
    ON CONFLICT(module,key) DO UPDATE SET value_type='json',value=EXCLUDED.value,is_active=TRUE,updated_at=NOW(),updated_by='local:C218';
    COMMIT;`);
  const response=await fetch('http://127.0.0.1:'+binding.HostPort+'/v2/rpc/operator_config_release?http_key='+encodeURIComponent(env.NAKAMA_HTTP_KEY),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({publish_token:token,store_url:active.store_url})),signal:AbortSignal.timeout(20000)});
  assert(response.ok,'Local publish HTTP failure');
  const result=JSON.parse((await response.json()).payload);assert.equal(result.status,'ok','Local publish rejected');
  const current=JSON.parse(sql('SELECT snapshot FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;'));
  assert.deepEqual(current.system.campaign_wave_pressure,rules);
  assert.equal(Number(sql('SELECT count(*) FROM game_stage_waves WHERE '+where+';')),985);
  verifyWaves();
  assert.equal(sql(untouchedQuery),untouched,'Training/admin waves must remain unchanged');
  console.log('PASS local C218 sync: 50 campaign stages/985 waves, System rules published at config v'+result.config_version+'; training/admin waves preserved; backup saved; no profile writes');
})().catch(error=>{console.error('Local C218 sync failed: '+(error.code==='ERR_ASSERTION'?error.message.split('\n')[0]:'local preflight/transport failure; credentials not logged'));process.exitCode=1;});

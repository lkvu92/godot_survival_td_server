// C238: local-only, growth-only update. Never publish draft remote settings.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),project='survival_td_local',pg=project+'-postgres-1',nk=project+'-nakama-1';
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
try{
 const mode=process.argv[2];assert(['--apply','--verify'].includes(mode));
 const metas=[nk,pg].map(name=>JSON.parse(docker(['inspect',name]))[0]);
 for(const meta of metas){assert.equal(meta.Config.Labels['com.docker.compose.project'],project);assert(meta.State.Running);}
 assert.equal(metas[0].NetworkSettings.Ports['7350/tcp'][0].HostIp,'127.0.0.1');
 const env=Object.fromEntries(metas[1].Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
 const sql=q=>docker(['exec','-i',pg,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],q);
 const read=()=>JSON.parse(sql('SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM game_heroes h;'));
 const source=JSON.parse(fs.readFileSync(path.join(root,'data/heroes.json'),'utf8'));
 const before=read();assert.equal(source.length,5);for(const h of source)assert(before.some(b=>b.id===h.id));
 const changed=source.some(h=>JSON.stringify(before.find(b=>b.id===h.id).level_up_stats,Object.keys(h.level_up_stats).sort())!==JSON.stringify(h.level_up_stats,Object.keys(h.level_up_stats).sort()));
 const quote=v=>"'"+v.replace(/'/g,"''")+"'";
 if(mode==='--apply'&&changed){
  const dir=path.join(root,'tmp');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'c238-hero-growth-before-'+Date.now()+'.json'),JSON.stringify(before,null,2));
  let q='BEGIN; LOCK TABLE game_heroes,remote_config_releases IN SHARE ROW EXCLUSIVE MODE;\n';
  // Concurrent hero edits abort the transaction rather than being overwritten.
  q+=`DO $$ BEGIN IF (SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM game_heroes h) IS DISTINCT FROM ${quote(JSON.stringify(before))}::jsonb THEN RAISE EXCEPTION 'C238_HERO_CHANGED'; END IF; END $$;\n`;
  for(const h of source)q+=`UPDATE game_heroes SET level_up_stats=${quote(JSON.stringify(h.level_up_stats))}::jsonb WHERE id=${quote(h.id)};\n`;
  q+="INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by) SELECT config_version+1,snapshot,min_app_version,latest_app_version,store_url,'C238-local-hero-growth' FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;\nCOMMIT;";
  sql(q);
 }
 const after=read();
 for(const h of source)assert.deepEqual(after.find(b=>b.id===h.id).level_up_stats,h.level_up_stats);
 for(const b of before){const a=after.find(h=>h.id===b.id);assert(a);const {level_up_stats:old,...rest}=b;const {level_up_stats:next,...actual}=a;assert.deepEqual(actual,rest);}
 console.log('PASS C238 local: five hero growth objects match source; all other hero fields preserved; no player writes or draft-settings publication; '+(mode==='--apply'&&changed?'updated':'verified'));
}catch(e){console.error('C238 local sync failed; inspect local container/config state. Credentials are not logged.');process.exitCode=1;}

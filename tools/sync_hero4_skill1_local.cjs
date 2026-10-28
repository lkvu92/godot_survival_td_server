// C196-v1.5: local-only, Skill1-only update. Never publish draft remote settings.
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
 const read=()=>JSON.parse(sql('SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM game_skills h;'));
 const source=JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'),'utf8')).filter(s=>s.id==='hero_4_skill_1');
 const before=read();assert.equal(source.length,1);for(const h of source)assert(before.some(b=>b.id===h.id));
 let changed=false;for(const h of source){try{assert.deepEqual(before.find(b=>b.id===h.id).levels,h.levels);}catch{changed=true;}}
 const quote=v=>"'"+v.replace(/'/g,"''")+"'";
 if(mode==='--apply'&&changed){
  const dir=path.join(root,'tmp');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'c196-skill1-before-'+Date.now()+'.json'),JSON.stringify(before,null,2));
  let q='BEGIN; LOCK TABLE game_skills,remote_config_releases IN SHARE ROW EXCLUSIVE MODE;\n';
  // Concurrent hero edits abort the transaction rather than being overwritten.
  q+=`DO $$ BEGIN IF (SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM game_skills h) IS DISTINCT FROM ${quote(JSON.stringify(before))}::jsonb THEN RAISE EXCEPTION 'C196-v1.5_HERO_CHANGED'; END IF; END $$;\n`;
  for(const h of source)q+=`UPDATE game_skills SET levels=${quote(JSON.stringify(h.levels))}::jsonb WHERE id=${quote(h.id)};\n`;
  q+="INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by) SELECT config_version+1,snapshot,min_app_version,latest_app_version,store_url,'C196-v1.5-local-hero-skill1' FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;\nCOMMIT;";
  sql(q);
 }
 const after=read();
 for(const h of source)assert.deepEqual(after.find(b=>b.id===h.id).levels,h.levels);
 for(const b of before){const a=after.find(h=>h.id===b.id);assert(a);const {levels:old,...rest}=b;const {levels:next,...actual}=a;assert.deepEqual(actual,rest);if(b.id!=='hero_4_skill_1')assert.deepEqual(next,old);}
 console.log('PASS C196-v1.5 local: H4 Skill1 levels match source; all other skill fields preserved; no player writes or draft-settings publication; '+(mode==='--apply'&&changed?'updated':'verified'));
}catch(e){console.error('C196-v1.5 local sync failed; inspect local container/config state. Credentials are not logged.');process.exitCode=1;}

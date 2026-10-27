// C196 v1.4: selective develop-only data update, with rollback source backup.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {isDeepStrictEqual}=require('node:util');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),PROJECT='survival_td_local',PG=PROJECT+'-postgres-1',NK=PROJECT+'-nakama-1';
const quote=value=>"'"+String(value).replace(/'/g,"''")+"'";
function requireValue(ok,code){if(!ok){const error=new Error(code);error.safeCode=code;throw error;}}
function docker(args,input){return execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024}).trim();}
function main(){
 const mode=process.argv[2];requireValue(process.argv.length===3&&['--check','--apply','--verify'].includes(mode),'USE_CHECK_APPLY_OR_VERIFY');
 const ids=['hero_4_skill_1','hero_4_skill_2','hero_4_skill_3'];
 const rows=JSON.parse(fs.readFileSync(path.join(ROOT,'data/skills.json'),'utf8')).filter(s=>ids.includes(s.id));
 requireValue(rows.length===3&&rows.every(s=>s.levels.length===5),'THREE_FIVE_LEVEL_SKILLS_REQUIRED');
 const pg=JSON.parse(docker(['inspect',PG]))[0],nk=JSON.parse(docker(['inspect',NK]))[0];
 for(const meta of [pg,nk])requireValue(meta.State.Running&&meta.Config.Labels['com.docker.compose.project']===PROJECT,'LOCAL_PROJECT_REQUIRED');
 requireValue(nk.NetworkSettings.Ports['7350/tcp']?.[0]?.HostIp==='127.0.0.1','LOOPBACK_REQUIRED');
 const env=Object.fromEntries(pg.Config.Env.map(e=>{const index=e.indexOf('=');return [e.slice(0,index),e.slice(index+1)];}));
 requireValue(env.POSTGRES_USER&&env.POSTGRES_DB,'LOCAL_DB_IDENTITY_REQUIRED');
 const sql=query=>docker(['exec','-i',PG,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],query);
 const filter='id IN ('+ids.map(quote).join(',')+')';
 const selectedQuery=`SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id),'[]'::jsonb) FROM game_skills s WHERE ${filter}`;
 const selectedHash=`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'')) FROM game_skills s WHERE ${filter}`;
 const otherHash=`SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY id)::text,'')) FROM game_skills s WHERE NOT (${filter})`;
 const before=JSON.parse(sql(selectedQuery));requireValue(before.length===3,'DB_SKILLS_MISSING');
 const beforeDigest=sql(selectedHash),others=sql(otherHash);
 const release=JSON.parse(sql('SELECT row_to_json(r) FROM remote_config_releases r ORDER BY config_version DESC LIMIT 1'));
 requireValue(Number.isSafeInteger(release.config_version)&&release.snapshot,'ACTIVE_RELEASE_REQUIRED');
 const changed=rows.filter(row=>{const stored=before.find(s=>s.id===row.id);return !isDeepStrictEqual(stored.levels,row.levels)||stored.description!==row.description;}).length;
 const payload=rows.map(({id,levels,description})=>({id,levels,description}));
 const incoming=`jsonb_to_recordset(${quote(JSON.stringify(payload))}::jsonb) AS r(id text,levels jsonb,description text)`;
 const update=`UPDATE game_skills s SET levels=r.levels,description=r.description,updated_at=NOW() FROM ${incoming} WHERE s.id=r.id AND (s.levels IS DISTINCT FROM r.levels OR s.description IS DISTINCT FROM r.description)`;
 sql('EXPLAIN '+update);
 const summary={project:PROJECT,selected:ids,changed,config_version:release.config_version};
 if(mode==='--verify'){requireValue(changed===0,'READBACK_MISMATCH');console.log(JSON.stringify({...summary,status:'PASS',writes_executed:0}));return;}
 if(mode==='--check'||changed===0){console.log(JSON.stringify({...summary,status:'PASS',writes_executed:0}));return;}
 const directory=path.join(ROOT,'../.tmp/hero4-poison-redistribution',String(Date.now()));fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify({before,desired:payload,release_before:release},null,2)+'\n',{flag:'wx',mode:0o600});
 sql(`BEGIN; SELECT pg_advisory_xact_lock(143,2); LOCK TABLE game_skills,remote_config_releases IN SHARE ROW EXCLUSIVE MODE;
 DO $guard$ BEGIN
 IF (${selectedHash}) IS DISTINCT FROM ${quote(beforeDigest)} OR (SELECT MAX(config_version) FROM remote_config_releases) <> ${release.config_version} THEN RAISE EXCEPTION 'C196_STATE_CHANGED'; END IF;
 END $guard$;
 ${update};
 INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
 SELECT config_version+1,snapshot,min_app_version,latest_app_version,store_url,'local:C196:1.4.0' FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
 COMMIT;`);
 const after=JSON.parse(sql(selectedQuery));
 for(const row of after){
  const expected=rows.find(s=>s.id===row.id);assert.deepEqual(row.levels,expected.levels);assert.equal(row.description,expected.description);
  const original={...before.find(s=>s.id===row.id)},actual={...row};
  for(const key of ['levels','description','updated_at']){delete original[key];delete actual[key];}assert.deepEqual(actual,original);
 }
 requireValue(sql(otherHash)===others,'OTHER_SKILLS_CHANGED');
 const current=JSON.parse(sql('SELECT row_to_json(r) FROM remote_config_releases r ORDER BY config_version DESC LIMIT 1'));
 requireValue(current.config_version===release.config_version+1,'VERSION_MISMATCH');assert.deepEqual(current.snapshot,release.snapshot);
 fs.writeFileSync(path.join(directory,'after.json'),JSON.stringify({after,config_version:current.config_version,status:'PASS'},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...summary,status:'PASS',config_version:current.config_version,backup:path.relative(path.dirname(ROOT),directory).replaceAll('\\','/'),other_skills_unchanged:true,active_settings_unchanged:true}));
}
try{main();}catch(error){console.error('FAIL C196 local data sync: '+(error.safeCode||'LOCAL_VALIDATION_OR_TRANSPORT_FAILURE')+'; no credentials or SQL logged.');process.exitCode=1;}

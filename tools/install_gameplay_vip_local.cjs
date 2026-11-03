// Explicitly local/test only; clone current release, never republish unrelated drafts.
const fs=require('fs'),path=require('path'),assert=require('assert'),{execFileSync}=require('child_process');
const isolated=process.argv.includes('--isolated'),project=isolated?'c232-test':'survival_td_local',container=project+'-postgres-1';
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
const meta=JSON.parse(run(['inspect',container]))[0];assert.equal(meta.Config.Labels['com.docker.compose.project'],project);assert(meta.State.Running);
const sql=q=>run(['exec','-i',container,'psql','-X','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-Atq'],q),read=q=>JSON.parse(sql(q)),quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const policy=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/gameplay_vip.json'),'utf8'));
const old=read('SELECT row_to_json(r) FROM remote_config_releases r ORDER BY config_version DESC LIMIT 1');assert(old?.config_version&&old.snapshot?.system);
if(JSON.stringify(old.snapshot.system.gameplay_vip)===JSON.stringify(policy)){console.log(JSON.stringify({project,config_version:old.config_version,status:'ALREADY_INSTALLED'}));process.exit(0);}
const out=path.resolve(__dirname,'../../tmp/gameplay-vip-install',project+'-'+Date.now());fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'before-config.json'),JSON.stringify(old,null,2));
const desired=structuredClone(old.snapshot);desired.system.gameplay_vip=policy;
const next=Number(old.config_version)+1;
sql(`BEGIN; LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
DO $$ BEGIN IF (SELECT max(config_version) FROM remote_config_releases)<>${old.config_version} THEN RAISE EXCEPTION 'Concurrent release'; END IF; END $$;
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by) VALUES(${next},${quote(JSON.stringify(desired))}::jsonb,${quote(old.min_app_version)},${quote(old.latest_app_version)},${old.store_url==null?'NULL':quote(old.store_url)},'gameplay-vip-local-scoped');
INSERT INTO remote_config_settings(module,key,value_type,value,description,is_active,updated_by) VALUES('system','gameplay_vip','json',${quote(JSON.stringify(policy))},'Gameplay VIP requirements',TRUE,'gameplay-vip-local-scoped') ON CONFLICT(module,key) DO UPDATE SET value=EXCLUDED.value,value_type='json',is_active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by;
COMMIT;`);
const actual=read(`SELECT snapshot FROM remote_config_releases WHERE config_version=${next}`);assert.deepEqual(actual,desired);
console.log(JSON.stringify({project,config_version:next,status:'PASS',backup:out}));

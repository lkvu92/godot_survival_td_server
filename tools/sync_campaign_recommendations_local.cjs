// User-selected historical C218 recommendations. Local DB only; no seeding,
// recalibration, profile changes, historical hash rewriting or production access.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const ROOT = path.resolve(__dirname, '..'), WORKSPACE = path.dirname(ROOT);
const PROJECT = 'survival_td_local', PG = PROJECT + '-postgres-1', NK = PROJECT + '-nakama-1';
const quote = text => "'" + String(text).replace(/'/g, "''") + "'";
function ensure(ok, code) { if (!ok) { const error = new Error(code); error.safeCode = code; throw error; } }
function docker(args, input) { return execFileSync('docker', args, {input, encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024}).trim(); }
function main() {
 const mode = process.argv[2];
 ensure(process.argv.length === 3 && ['--check','--apply','--verify'].includes(mode), 'USE_CHECK_APPLY_OR_VERIFY');
 const source = path.join(WORKSPACE,'.tmp/c218-recommendations-export/arc1-5.json');
 const exported = JSON.parse(fs.readFileSync(source,'utf8'));
 const arcs = JSON.parse(fs.readFileSync(path.join(ROOT,'data/arcs.json'),'utf8')).filter(a=>a.order>=1&&a.order<=5);
 ensure(arcs.length === 5 && exported.arcs.length === 5, 'FIVE_ARCS_REQUIRED');
 const desired = [], seen = new Set();
 for (const arc of arcs) {
  const analysis = exported.arcs.find(a=>a.arc_id===arc.id&&a.arc_order===arc.order);
  ensure(analysis?.status === 'COMPLETE' && analysis.rows.length === 30, 'INCOMPLETE_ANALYSIS');
  // Prove extraction still equals the original selected analysis artifacts.
  const original = JSON.parse(fs.readFileSync(path.resolve(WORKSPACE,analysis.source),'utf8'));
  ensure(original.fingerprint === analysis.fingerprint, 'SOURCE_FINGERPRINT_CHANGED');
  for (const stage of arc.stage_ids) for (const difficulty of ['normal','epic','legend']) {
   const row = analysis.rows.find(r=>r.stage_id===stage&&r.level_id===difficulty);
   const prior = original.rows.find(r=>r.stage_id===stage&&r.level_id===difficulty);
   ensure(row?.status === 'PASS' && prior?.status === 'PASS' && row.recommended_power===prior.recommended_power, 'ANALYSIS_PAIR_MISSING_OR_CHANGED');
   ensure(Number.isSafeInteger(row.recommended_power)&&row.recommended_power>0&&row.recommended_power<=2147483647, 'INVALID_POWER');
   const key = stage+'|'+difficulty;ensure(!seen.has(key),'DUPLICATE_PAIR');seen.add(key);
   desired.push({stage_id:stage,level_id:difficulty,recommended_power:row.recommended_power,arc_id:arc.id});
  }
 }
 ensure(desired.length === 150 && seen.size === 150, 'EXACTLY_150_PAIRS_REQUIRED');
 const pg = JSON.parse(docker(['inspect',PG]))[0], nk = JSON.parse(docker(['inspect',NK]))[0];
 for (const meta of [pg,nk]) ensure(meta.State.Running&&meta.Config.Labels['com.docker.compose.project']===PROJECT,'LOCAL_IDENTITY_REQUIRED');
 for (const [meta,port] of [[pg,'5432/tcp'],[nk,'7350/tcp']]) {
  const bindings=meta.NetworkSettings.Ports[port];
  ensure(bindings?.length===1&&bindings[0].HostIp==='127.0.0.1','LOOPBACK_REQUIRED');
 }
 const env = Object.fromEntries(pg.Config.Env.map(row=>{const index=row.indexOf('=');return [row.slice(0,index),row.slice(index+1)];}));
 ensure(env.POSTGRES_USER&&env.POSTGRES_DB,'LOCAL_DB_IDENTITY_MISSING');
 const sql = query => docker(['exec','-i',PG,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],query);
 const data = quote(JSON.stringify(desired))+'::jsonb';
 const incoming = `jsonb_to_recordset(${data}) AS r(stage_id text,level_id text,recommended_power integer,arc_id text)`;
 const filter = `EXISTS (SELECT 1 FROM ${incoming} WHERE r.stage_id=t.stage_id AND r.level_id=t.level_id)`;
 const selectedQuery = `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM game_stage_levels t WHERE ${filter}`;
 const outsideHashQuery = `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM game_stage_levels t WHERE NOT (${filter})`;
 const selectedHashQuery = `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM game_stage_levels t WHERE ${filter}`;
 const selected = JSON.parse(sql(selectedQuery)), beforeHash = sql(selectedHashQuery), outsideHash = sql(outsideHashQuery);
 ensure(selected.length===150,'DB_STAGE_LEVEL_PAIRS_MISSING');
 ensure(Number(sql(`SELECT COUNT(*) FROM ${incoming} JOIN game_stages s ON s.id=r.stage_id WHERE s.arc_id=r.arc_id`))===150,'DB_ARC_MEMBERSHIP_MISMATCH');
 const release = JSON.parse(sql('SELECT row_to_json(r) FROM remote_config_releases r ORDER BY config_version DESC LIMIT 1'));
 ensure(Number.isSafeInteger(release.config_version)&&release.snapshot,'ACTIVE_RELEASE_REQUIRED');
 const changed = desired.filter(r=>selected.find(s=>s.stage_id===r.stage_id&&s.level_id===r.level_id)?.recommended_power!==r.recommended_power).length;
 const update = `UPDATE game_stage_levels t SET recommended_power=r.recommended_power,updated_at=NOW() FROM ${incoming} WHERE t.stage_id=r.stage_id AND t.level_id=r.level_id AND t.recommended_power IS DISTINCT FROM r.recommended_power`;
 // Parse and plan the exact selective statement without running it.
 sql('EXPLAIN '+update);
 const summary = {project:PROJECT,endpoint:'http://127.0.0.1:7350',rows:150,changed,config_version:release.config_version,historical_analysis:true,source:path.relative(WORKSPACE,source).replaceAll('\\','/')};
 if (mode==='--verify') {ensure(changed===0,'READBACK_MISMATCH');console.log(JSON.stringify({...summary,status:'PASS',writes_executed:0}));return;}
 if (mode==='--check'||changed===0) {console.log(JSON.stringify({...summary,status:'PASS',writes_executed:0}));return;}
 const backupDir = path.join(WORKSPACE,'.tmp/c218-db-recommendations',String(Date.now()));
 fs.mkdirSync(backupDir,{recursive:true});
 const backup = {project:PROJECT,source,desired,before:selected,release_before:release,outside_levels_hash:outsideHash};
 fs.writeFileSync(path.join(backupDir,'before.json'),JSON.stringify(backup,null,2)+'\n',{flag:'wx',mode:0o600});
 const guard = `DO $c218_guard$ BEGIN
 IF (${selectedHashQuery}) IS DISTINCT FROM ${quote(beforeHash)} OR (${outsideHashQuery}) IS DISTINCT FROM ${quote(outsideHash)} THEN RAISE EXCEPTION 'C218_LEVELS_CHANGED'; END IF;
 IF (SELECT MAX(config_version) FROM remote_config_releases) <> ${release.config_version} THEN RAISE EXCEPTION 'C218_RELEASE_CHANGED'; END IF;
 END $c218_guard$;`;
 // A new version makes clients reload the DB catalog; copy only active settings,
 // so unrelated unpublished settings are never accidentally published.
 sql(`BEGIN; SELECT pg_advisory_xact_lock(143,2); LOCK TABLE game_stage_levels,remote_config_releases IN SHARE ROW EXCLUSIVE MODE;
 ${guard}
 ${update};
 INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
 SELECT config_version+1,snapshot,min_app_version,latest_app_version,store_url,'local:C218:historical-recommendations' FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
 COMMIT;`);
 const after = JSON.parse(sql(selectedQuery));
 for (const row of after) {
  const expected = desired.find(r=>r.stage_id===row.stage_id&&r.level_id===row.level_id);
  ensure(row.recommended_power===expected.recommended_power,'POST_WRITE_POWER_MISMATCH');
  const before = selected.find(r=>r.id===row.id), other = {...row};
  delete other.recommended_power;delete other.updated_at;
  const beforeOther = {...before};delete beforeOther.recommended_power;delete beforeOther.updated_at;
  assert.deepEqual(other,beforeOther,'Non-recommendation fields changed');
 }
 ensure(sql(outsideHashQuery)===outsideHash,'OUTSIDE_ROWS_CHANGED');
 const current = JSON.parse(sql('SELECT row_to_json(r) FROM remote_config_releases r ORDER BY config_version DESC LIMIT 1'));
 ensure(current.config_version===release.config_version+1,'VERSION_NOT_ADVANCED');
 assert.deepEqual(current.snapshot,release.snapshot,'Active settings changed');
 fs.writeFileSync(path.join(backupDir,'after.json'),JSON.stringify({rows:after,config_version:current.config_version,status:'PASS'},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...summary,status:'PASS',changed,config_version:current.config_version,backup:path.relative(WORKSPACE,backupDir).replaceAll('\\','/'),outside_rows_unchanged:true,active_settings_unchanged:true,player_writes:false}));
}
try {main();} catch(error) {console.error('FAIL C218 local recommendations: '+(error.safeCode||'LOCAL_QUERY_OR_VALIDATION_FAILURE')+'; credentials and SQL were not logged.');process.exitCode=1;}

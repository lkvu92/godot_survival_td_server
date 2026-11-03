/* C239 local playtest only: guarded single-stage update with full rollback snapshot. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),{buildPilot,buildFramework}=require('./enemy_framework_catalog.cjs');
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const pg='survival_td_local-postgres-1',nk='survival_td_local-nakama-1';
for(const name of [pg,nk]){const c=JSON.parse(docker(['inspect',name]))[0];assert.equal(c.Config.Labels['com.docker.compose.project'],'survival_td_local');assert(c.State.Running);if(name===nk)assert.equal(c.NetworkSettings.Ports['7350/tcp'][0].HostIp,'127.0.0.1');}
const cfg=JSON.parse(docker(['inspect',pg]))[0].Config.Env,env=Object.fromEntries(cfg.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
const sql=q=>docker(['exec','-i',pg,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],q);
const get=q=>JSON.parse(sql(q));
const before={stage:get("SELECT to_jsonb(s) FROM game_stages s WHERE id='stage_7_05'"),waves:get("SELECT jsonb_agg(to_jsonb(w) ORDER BY wave_index) FROM game_stage_waves w WHERE stage_id='stage_7_05'"),progression:get("SELECT value FROM game_config WHERE key='progression'")};
assert(before.stage&&before.progression&&before.waves?.length===20,'Missing local pilot prerequisites');
const stages=JSON.parse(fs.readFileSync(path.join(root,'data/stages.json'),'utf8')),source=stages.find(s=>s.id==='stage_7_05');assert(source);
const pilot=buildPilot(source),progression=structuredClone(before.progression);progression.enemy_framework=buildFramework();
const backup=path.resolve(root,'../tmp/c239-local-pilot',String(Date.now()));fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(before,null,2)+'\n');
const quote=x=>"'"+String(x).replace(/'/g,"''")+"'",json=x=>quote(JSON.stringify(x))+'::jsonb';
let q="BEGIN; SET LOCAL lock_timeout='5s'; LOCK TABLE game_stages,game_stage_waves,game_config IN SHARE ROW EXCLUSIVE MODE;\n";
q+=`DO $$ BEGIN IF (SELECT to_jsonb(s) FROM game_stages s WHERE id='stage_7_05') IS DISTINCT FROM ${json(before.stage)} OR (SELECT jsonb_agg(to_jsonb(w) ORDER BY wave_index) FROM game_stage_waves w WHERE stage_id='stage_7_05') IS DISTINCT FROM ${json(before.waves)} OR (SELECT value FROM game_config WHERE key='progression') IS DISTINCT FROM ${json(before.progression)} THEN RAISE EXCEPTION 'LOCAL_PILOT_CONCURRENT_CHANGE'; END IF; END $$;\n`;
q+=`UPDATE game_config SET value=${json(progression)} WHERE key='progression';\nUPDATE game_stages SET stage_rules=${json(pilot.stage_rules)},boss_skill_ids='[]'::jsonb,boss_skill_entry_indexes='[]'::jsonb WHERE id='stage_7_05';\n`;
for(let i=0;i<pilot.waves.length;i++)q+=`UPDATE game_stage_waves SET entries=${json(pilot.waves[i].entries)} WHERE stage_id='stage_7_05' AND wave_index=${Number(before.waves[i].wave_index)};\n`;
q+='COMMIT;';sql(q);
const after={stage:get("SELECT to_jsonb(s) FROM game_stages s WHERE id='stage_7_05'"),waves:get("SELECT jsonb_agg(to_jsonb(w) ORDER BY wave_index) FROM game_stage_waves w WHERE stage_id='stage_7_05'"),progression:get("SELECT value FROM game_config WHERE key='progression'")};
assert.equal(after.stage.stage_rules.enemy_framework_version,2);assert.deepEqual(after.waves.map(w=>w.entries),pilot.waves.map(w=>w.entries));assert.deepEqual(after.progression.enemy_framework,progression.enemy_framework);
fs.writeFileSync(path.join(backup,'after.json'),JSON.stringify(after,null,2)+'\n');console.log(JSON.stringify({status:'PASS',target:'local',stage:'stage_7_05',waves:after.waves.length,backup}));

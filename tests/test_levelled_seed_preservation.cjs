// PostgreSQL regression in a disposable schema; never seed the live game tables.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),schema='c239_seed_guard_'+Date.now(),pg='survival_td_local-postgres-1';
const meta=JSON.parse(execFileSync('docker',['inspect',pg],{encoding:'utf8'}))[0];assert(meta.State.Running&&meta.Config.Labels['com.docker.compose.project']==='survival_td_local');
const env=Object.fromEntries(meta.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
const sql=q=>execFileSync('docker',['exec','-i',pg,'psql','-XAtq','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1'],{input:'SET client_min_messages TO warning; SET search_path TO '+schema+',public;\n'+q,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
const box=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/build/index.js'),'utf8'),box);
let lastError='';
const api=vm.runInContext('({seedGameData,seedBindSql,createGameConfigTables})',box),log={info(){},warn(){},error(_format,message){lastError=String(message).slice(-1400);}};
let race=false,planned=false;
const nk={sqlExec(q,a=[]){if(race&&!planned){planned=true;sql(`UPDATE game_stages SET stage_rules='{"enemy_framework_version":2}' WHERE id='guard_legacy'`);}return sql(api.seedBindSql(q,a));},sqlQuery(q,a=[]){return JSON.parse(sql("SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM ("+api.seedBindSql(q,a)+')r'));}};
const seed=data=>JSON.parse(api.seedGameData({env:{CONFIG_ADMIN_USER_ID:'test'}},log,nk,JSON.stringify(data)));
const snapshot=id=>sql(`SELECT json_build_object('stage',(SELECT row_to_json(s) FROM game_stages s WHERE id='${id}'),'waves',(SELECT json_agg(w ORDER BY wave_index) FROM game_stage_waves w WHERE stage_id='${id}'))`);
sql('CREATE SCHEMA '+schema);
try{
 api.createGameConfigTables(nk,log);
 const row={id:'guard_v2',display_name:'Guard fixture',arc_id:'guard_arc',stage_rules:{enemy_framework_version:2},boss_skill_ids:[],waves:[{id:'w1',entries:[{species_id:'fixture_species',level:1,count:1,interval:1,start_delay:0,elements:['fire'],skills:[]}]}]};
 assert(seed({table:'stages',rows:[row]}).success);
 const before=snapshot(row.id),legacy={...row,display_name:'Must not overwrite v2',stage_rules:{},boss_skill_ids:['legacy'],waves:[{id:'legacy',entries:[{enemy_id:'legacy',modifiers:{hp:999}}]}]};
 for(let n=0;n<2;n++){const r=seed({table:'bundle',requests:[{table:'stages',rows:[legacy]}]});assert(r.success&&r.atomic,JSON.stringify(r)+' '+lastError);assert.equal(r.results[0].preserved_levelled,1);assert.equal(snapshot(row.id),before,'whole stage/wave/extensions preserved');}
 const explicit=structuredClone(row);explicit.waves[0].entries[0].level=2;assert(seed({table:'stages',rows:[explicit]}).success);assert.notEqual(snapshot(row.id),before,'explicit v2 update still works');
 for(const branch of ['entry','difficulty']){const bad=structuredClone(row);if(branch==='entry')bad.waves[0].entries[0].modifiers={};else bad.waves[0].entries[0].difficulty_overrides={epic:{attributes:{hp:99}}};const snap=snapshot(row.id);assert(seed({table:'stages',rows:[bad]}).error);assert.equal(snapshot(row.id),snap);}
 const old={...legacy,id:'guard_legacy'};assert(seed({table:'stages',rows:[old]}).success);const legacyBefore=snapshot(old.id);race=true;
 assert(seed({table:'stages',rows:[{...old,display_name:'race overwrite'}]}).error,'in-transaction guard rejects downgrade after planner preflight');
 assert.equal(JSON.parse(snapshot(old.id)).stage.display_name,JSON.parse(legacyBefore).stage.display_name,'racing migration is not overwritten');
 console.log('PASS C239 seed preservation: repeat atomic legacy bundles preserve whole v2 stage/waves/extensions; explicit v2 allowed; mixed entry/difficulty rejected; concurrent migration downgrade blocked');
}finally{race=false;sql('DROP SCHEMA '+schema+' CASCADE');}

// Real PostgreSQL seed roundtrip in a disposable schema; no player rows or live catalog mutations.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {ARC,buildCatalog,loadCatalog}=require('../tools/arc7_catalog.cjs');
const root=path.join(__dirname,'..'),schema='arc7_test_'+Date.now(),pg='survival_td_local-postgres-1';
const meta=JSON.parse(execFileSync('docker',['inspect',pg],{encoding:'utf8'}))[0];
assert(meta.State.Running&&meta.Config.Labels['com.docker.compose.project']==='survival_td_local');
const env=Object.fromEntries(meta.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
const sql=query=>execFileSync('docker',['exec','-i',pg,'psql','-X','-q','-A','-t','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1'],{input:'SET client_min_messages TO warning; SET search_path TO '+schema+',public;\n'+query,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const box=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/build/index.js'),'utf8'),box);
const api=vm.runInContext('({seedGameData,seedBindSql,createGameConfigTables,processEnemy,processArc,processStage,processStageLevel})',box);
const nk={sqlExec(q,a=[]){return sql(api.seedBindSql(q,a));},sqlQuery(q,a=[]){return JSON.parse(sql("SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]') FROM ("+api.seedBindSql(q,a)+') r'));}};
sql('CREATE SCHEMA '+schema);
try{
 api.createGameConfigTables(nk,{info(){},warn(){},error(){}});
 const built=buildCatalog(loadCatalog(root));
 const requests=Object.entries(built).map(([table,rows])=>({table,rows}));
 const seed=()=>JSON.parse(api.seedGameData({env:{CONFIG_ADMIN_USER_ID:'admin'}},{info(){},warn(){},error(){}},nk,JSON.stringify({table:'bundle',requests})));
 let r=seed();assert(r.success&&r.atomic);r=seed();assert(r.success&&r.atomic,'idempotent seed');
 assert.equal(nk.sqlQuery('SELECT * FROM game_enemies',[]).length,45);
 for(const source of built.enemies){const actual=JSON.parse(JSON.stringify(api.processEnemy(nk.sqlQuery('SELECT * FROM game_enemies WHERE id=$1',[source.id])[0])));for(const k of ['element','attributes','generic_skills','attack_skill','boss_skills','collision_radius','balance_reference_level'])if(source[k]!==undefined)assert.deepEqual(actual[k],source[k],source.id+'.'+k);}
 for(const source of built.stages){const actual=JSON.parse(JSON.stringify(api.processStage(nk.sqlQuery('SELECT * FROM game_stages WHERE id=$1',[source.id])[0],nk)));assert.equal(actual.arc_id,ARC);assert.deepEqual(actual.stage_rules,source.stage_rules);assert.equal(actual.waves.length,20);actual.waves.forEach((w,i)=>assert.deepEqual(w.entries,source.waves[i].entries));}
 assert.equal(nk.sqlQuery('SELECT * FROM game_stage_levels',[]).length,30);
 console.log('PASS C237 real PostgreSQL: atomic/idempotent compiled seed, 45 enemies, 200 wave roundtrips, 30 modes; isolated schema');
}finally{sql('DROP SCHEMA '+schema+' CASCADE');}

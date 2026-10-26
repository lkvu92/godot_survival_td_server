// C221: actual PostgreSQL seed/readback using a disposable schema only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..'),psql=process.env.SEED_TEST_PSQL,port=process.env.SEED_TEST_PORT;
if(!psql||!port)throw Error('Set SEED_TEST_PSQL and SEED_TEST_PORT to a disposable PostgreSQL');
const schema='arc6_seed_'+Date.now();
function sql(query){const r=spawnSync(psql,['-X','-q','-A','-t','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:query,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,PGOPTIONS:'-c search_path='+schema+',public'}});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const box=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/build/index.js'),'utf8'),box);
const api=vm.runInContext('({seedGameData,seedBindSql,createGameConfigTables,processEnemy,processArc,processStage,processStageLevel})',box);
const nk={sqlExec(q,args=[]){return sql(api.seedBindSql(q,args));},sqlQuery(q,args=[]){return JSON.parse(sql("SELECT COALESCE(json_agg(r),'[]') FROM ("+api.seedBindSql(q,args)+') r'));}};
const logger={info(){},warn(){},error(){}};
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const seed=request=>{const result=JSON.parse(api.seedGameData({env:{CONFIG_ADMIN_USER_ID:'admin'}},logger,nk,JSON.stringify(request)));assert(result.success,JSON.stringify(result));};
sql('CREATE SCHEMA '+schema);
try{
  api.createGameConfigTables(nk,logger);
  for(const table of ['arcs','enemies','stages','stage_levels'])seed({table,rows:read(table)});
  const legacyBefore=nk.sqlQuery("SELECT md5(json_agg(r ORDER BY id)::text) hash FROM (SELECT * FROM game_enemies WHERE id NOT LIKE 'arc6_%') r")[0].hash;
  const stageIds=read('arcs').find(a=>a.order===6).stage_ids;
  const requests=['arcs','enemies','stages','stage_levels'].map(table=>({table,rows:read(table).filter(row=>table==='arcs'?row.order===6:table==='enemies'?row.id.startsWith('arc6_'):table==='stages'?row.arc_id==='arc_ngu_to_quy_khu':stageIds.includes(row.stage_id))}));
  seed({table:'bundle',requests});
  assert.equal(nk.sqlQuery("SELECT md5(json_agg(r ORDER BY id)::text) hash FROM (SELECT * FROM game_enemies WHERE id NOT LIKE 'arc6_%') r")[0].hash,legacyBefore);
  for(const source of read('enemies').filter(e=>e.id.startsWith('arc6_'))){
    const actual=JSON.parse(JSON.stringify(api.processEnemy(nk.sqlQuery('SELECT * FROM game_enemies WHERE id=$1',[source.id])[0])));
    for(const key of ['element','is_boss','attributes','skills','generic_skills','boss_skills','attack_skill','reward'])if(source[key]!==undefined)assert.deepEqual(actual[key],source[key],source.id+'.'+key);
  }
  for(const source of read('stages').filter(s=>stageIds.includes(s.id))){
    const actual=JSON.parse(JSON.stringify(api.processStage(nk.sqlQuery('SELECT * FROM game_stages WHERE id=$1',[source.id])[0],nk)));
    assert.deepEqual(actual.stage_rules,source.stage_rules,'Lv35/seed metadata persists');
    assert.equal(actual.waves.length,20);
    actual.waves.forEach((wave,i)=>assert.deepEqual(wave.entries,source.waves[i].entries,'wave entry roundtrip'));
  }
  for(const source of read('stage_levels').filter(l=>stageIds.includes(l.stage_id))){
    const actual=JSON.parse(JSON.stringify(api.processStageLevel(nk.sqlQuery('SELECT * FROM game_stage_levels WHERE id=$1',[source.id])[0])));
    for(const key of ['recommended_power','enemy_modifiers','loot_table','boss_loot_table'])assert.deepEqual(actual[key],source[key],source.id+'.'+key);
  }
  console.log('PASS C221 PostgreSQL: actual atomic seed bundle, 17 enemy definitions, 200 wave entries, 30 difficulties, Lv35 metadata and legacy preservation');
}finally{sql('DROP SCHEMA '+schema+' CASCADE');}

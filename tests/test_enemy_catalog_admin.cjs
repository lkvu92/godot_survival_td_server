// Real PostgreSQL transactions against a disposable database; never mutates player data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {database,runtime}=require('../tools/enemy_catalog_db.cjs');
const container='survival_td_local-postgres-1',name='c259_test_'+process.pid;
const live=database(),ctx=runtime(),nk=database(container,name);
const sources=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../client/temp/enemy-asset-sources.json'),'utf8'));
const imported=ctx.ecMigration(live,sources),projection=ctx.ecProject(imported);
assert.deepEqual(Array.from(projection.errors),[]);
const oldFramework=live.sqlQuery("SELECT value->'enemy_framework' AS framework FROM game_config WHERE key='progression'")[0].framework;
const comparable=JSON.parse(JSON.stringify(projection.snapshot.framework));delete comparable.catalog_version;
for(const species of Object.values(comparable.species))delete species.element_baselines;
const previous=JSON.parse(JSON.stringify(oldFramework));delete previous.catalog_version;
for(const species of Object.values(previous.species))delete species.element_baselines;
assert.deepEqual(comparable,previous,'Migration must preserve every existing framework parameter');
const oldWaves=live.sqlQuery('SELECT stage_id,wave_index,entries FROM game_stage_waves');
for(const wave of projection.snapshot.waves)assert.deepEqual(JSON.parse(JSON.stringify(wave.entries)),oldWaves.find(w=>w.stage_id===wave.stage_id&&w.wave_index===wave.wave_index).entries,'Exact spawn/EXP/timing/difficulty parity');
// Visual normalization must not decide species lifecycle, even for an unused pilot.
if(!imported.catalog.some(r=>r.id==='tiger_king')){
 const canonical=imported.catalog.find(r=>r.id==='a7_arc7_bach_ho_yeu_vuong');
 imported.catalog.push({id:'tiger_king',data:JSON.parse(JSON.stringify(canonical.data)),active:true,revision:'1'});
}
const admin={userId:'test-admin',env:{CONFIG_ADMIN_USER_ID:'test-admin'}},logger={error(){}};
const rpc=(kind,action,input={},identity=admin)=>JSON.parse(ctx.ecRpc(identity,logger,nk,JSON.stringify(input),kind,action));
const ok=result=>{assert.equal(result.success,true,JSON.stringify(result));return result;};
let checks=0;
try{
 cp.execFileSync('docker',['exec',container,'createdb','-U','postgres',name]);
 nk.run(`CREATE TABLE game_enemies(id TEXT PRIMARY KEY,display_name TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE game_config(key TEXT PRIMARY KEY,value JSONB,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE game_stage_waves(stage_id TEXT,wave_index INT,entries JSONB,PRIMARY KEY(stage_id,wave_index));
 CREATE TABLE remote_config_releases(config_version BIGINT PRIMARY KEY,snapshot JSONB,min_app_version TEXT,latest_app_version TEXT,store_url TEXT,published_by TEXT);`);
 ctx.createEnemyCatalogTables(nk);
 nk.sqlExec("INSERT INTO game_config(key,value) VALUES('progression',$1::JSONB)",[JSON.stringify({enemy_framework:projection.snapshot.framework})]);
 nk.sqlExec("INSERT INTO remote_config_releases VALUES(1,$1::JSONB,'1','1','','fixture')",[JSON.stringify({system:{}})]);
 nk.sqlExec("INSERT INTO game_stage_waves SELECT stage_id,wave_index,'[]'::JSONB FROM jsonb_to_recordset($1::JSONB) AS t(stage_id TEXT,wave_index INT)",[JSON.stringify(imported.metadata.waves)]);
 const bundle={metadata:imported.metadata};for(const [kind,table] of Object.entries({catalog:'enemy_catalog',visual_set:'enemy_visual_sets',visual_asset:'enemy_visual_assets',skill:'enemy_skill_catalog',stage_entry:'enemy_stage_entries'}))bundle[table]=imported[kind];
 nk.sqlQuery('SELECT enemy_catalog_import($1::JSONB,0,$2) AS result',[JSON.stringify(bundle),'fixture']);
 for(const kind of ['catalog','visual_set','visual_asset','skill','stage_entry']){
  for(const action of ['list','get','save','delete']){assert.equal(rpc(kind,action,{},{}).code,403);checks++;}
  const list=ok(rpc(kind,'list',{limit:2})).data;assert.equal(list.rows.length,2);assert.ok(list.next_cursor);checks++;
  const first=imported[kind][0],got=ok(rpc(kind,'get',{id:first.id})).data;assert.equal(got.id,first.id);checks++;
  // Duplicate each entity in inactive form: full create/update/delete lifecycle without disturbing references.
  const id='fixture_'+kind,data=JSON.parse(JSON.stringify(first.data));if(kind==='skill')data.id=id;
  const saved=ok(rpc(kind,'save',{id,data,active:false,expected_revision:'0'})).data;
  assert.equal(saved.revision,'1');checks++;
  assert.equal(rpc(kind,'save',{id,data,active:false,expected_revision:'0'}).code,409);checks++;
  const updated=ok(rpc(kind,'save',{id,data,active:false,expected_revision:'1'})).data;assert.equal(updated.revision,'2');checks++;
  ok(rpc(kind,'delete',{id,expected_revision:'2'}));assert.equal(rpc(kind,'get',{id}).code,404);checks++;
 }
 const enemy=imported.catalog.find(r=>r.id===imported.stage_entry[0].data.enemy_id),changed=JSON.parse(JSON.stringify(enemy.data));changed.base_attributes.hp+=17;
 ok(rpc('catalog','save',{id:enemy.id,data:changed,active:true,expected_revision:'1'}));
 assert.equal(nk.sqlQuery("SELECT value->'enemy_framework'->'species'->$1->'base_attributes'->>'hp' AS hp FROM game_config WHERE key='progression'",[enemy.id])[0].hp,String(enemy.data.base_attributes.hp));checks++;
 assert.equal(rpc('catalog','delete',{id:enemy.id,expected_revision:'2'}).code,422);checks++;
 const bad={...changed,visual_set_id:'missing_visual'};assert.equal(rpc('catalog','save',{id:enemy.id,data:bad,active:true,expected_revision:'2'}).code,422);checks++;
 let revision=ctx.ecRead(nk).revision;
 assert.equal(rpc('catalog','publish',{expected_revision:'0',note:'stale'}).code,409);checks++;
 const release=ok(rpc('catalog','publish',{expected_revision:revision,note:'Integration baseline'})).data;
 assert.equal(release.version,'1');assert.equal(ctx.enemyCatalogVersion(nk),'1');assert.equal(release.config_version,2);checks++;
 const frozen=nk.sqlQuery('SELECT snapshot FROM enemy_catalog_releases WHERE version=1')[0].snapshot;
 changed.base_attributes.hp+=31;ok(rpc('catalog','save',{id:enemy.id,data:changed,active:true,expected_revision:'2'}));
 revision=ctx.ecRead(nk).revision;ok(rpc('catalog','publish',{expected_revision:revision,note:'Second release'}));
 assert.deepEqual(nk.sqlQuery('SELECT snapshot FROM enemy_catalog_releases WHERE version=1')[0].snapshot,frozen);checks++;
 revision=ctx.ecRead(nk).revision;ok(rpc('catalog','rollback',{version:'1',expected_revision:revision,note:'Restore baseline'}));
 assert.equal(ctx.enemyCatalogVersion(nk),'3');assert.equal(ctx.ecRead(nk).catalog.find(r=>r.id===enemy.id).data.base_attributes.hp,changed.base_attributes.hp);checks++;
 const restored=nk.sqlQuery("SELECT value->'enemy_framework'->'species'->$1->'base_attributes'->>'hp' AS hp FROM game_config WHERE key='progression'",[enemy.id])[0].hp;
 assert.equal(restored,String(enemy.data.base_attributes.hp+17));checks++;
 const bosses=ok(rpc('catalog','list',{kind:'boss',active:true,limit:100})).data.rows;
 assert(bosses.length>0&&bosses.every(r=>r.data.kind==='boss'));checks++;
 const scoped=ok(rpc('stage_entry','list',{enemy_id:enemy.id,limit:100})).data.rows;
 assert(scoped.length>0&&scoped.every(r=>r.data.enemy_id===enemy.id));checks++;
 assert.equal(rpc('catalog','list',{stage_id:'not_supported'}).code,400);checks++;
 const beforeNormalize=ctx.ecRead(nk),dry=ok(rpc('catalog','normalize',{dry_run:true,expected_revision:beforeNormalize.revision})).data;
 const variant=JSON.parse(JSON.stringify(beforeNormalize)),asset=variant.visual_asset.find(r=>r.data.visual_set_id==='arc7_bach_ho_yeu_vuong_fire'&&r.data.slot==='idle');
 asset.data.fps=37;const retained=ctx.ecNormalize(variant).draft;assert(retained.visual_set.some(r=>r.id==='arc7_bach_ho_yeu_vuong_fire'));checks++;
 assert(dry.changes.length>0);assert.equal(ctx.ecRead(nk).revision,beforeNormalize.revision);checks++;
 assert.equal(rpc('catalog','normalize',{dry_run:false,expected_revision:'0'}).code,409);checks++;
 const normalized=ok(rpc('catalog','normalize',{dry_run:false,expected_revision:beforeNormalize.revision})).data;
 const normalizedDraft=ctx.ecRead(nk);assert.equal(ctx.ecProject(normalizedDraft).errors.length,0);assert.equal(ctx.ecNormalize(normalizedDraft).changes.length,0);checks++;
 assert(normalizedDraft.visual_set.some(r=>r.id==='arc7_bach_ho_yeu_vuong'));assert(!normalizedDraft.visual_set.some(r=>r.id==='arc7_bach_ho_yeu_vuong_fire'));checks++;
 assert.equal(normalizedDraft.catalog.find(r=>r.id==='tiger_king').active,true);assert.equal(ctx.enemyCatalogVersion(nk),'3');checks++;
 const failedBatch=[{table:'enemy_visual_sets',id:'batch_rollback_fixture',operation:'save',data:{display_name:'fixture'},active:false,expected_revision:'0'},{table:'enemy_visual_sets',id:'batch_rollback_fixture',operation:'save',data:{display_name:'fixture'},active:false,expected_revision:'0'}];
 assert.throws(()=>nk.sqlQuery('SELECT enemy_catalog_batch($1::JSONB,$2::BIGINT,$3) AS result',[JSON.stringify(failedBatch),normalized.draft_revision,'fixture']));
 assert.equal(nk.sqlQuery("SELECT id FROM enemy_visual_sets WHERE id='batch_rollback_fixture'").length,0);assert.equal(ctx.ecRead(nk).revision,normalized.draft_revision);checks++;
 const normalizedRelease=ok(rpc('catalog','publish',{expected_revision:normalized.draft_revision,note:'Normalized presentation'})).data;
 const neutral=nk.sqlQuery("SELECT catalog_projection FROM game_enemies WHERE id='arc7_bach_ho_yeu_vuong'")[0];assert(neutral);checks++;
 const binding=nk.sqlQuery("SELECT value->'enemy_framework'->'enemy_skill_bindings'->'arc7_bach_ho_yeu_vuong' AS binding FROM game_config WHERE key='progression'")[0].binding;
 assert.deepEqual(binding,{attack_skill:null,boss_skills:[],generic_skills:[]});checks++;
 nk.sqlExec("INSERT INTO game_enemies(id,display_name,catalog_projection) VALUES('rollback_orphan_fixture','Orphan fixture','{}'::JSONB)");
 ok(rpc('catalog','rollback',{version:'3',expected_revision:normalizedRelease.draft_revision,note:'Restore compatibility aliases'}));
 assert.equal(nk.sqlQuery("SELECT id FROM game_enemies WHERE id='rollback_orphan_fixture'").length,0,'Rollback must remove managed projection orphans');checks++;
 assert.equal(nk.sqlQuery("SELECT id FROM game_enemies WHERE id='arc7_bach_ho_yeu_vuong'").length,projection.snapshot.enemies.some(r=>r.id==='arc7_bach_ho_yeu_vuong')?1:0,'Rollback preserves exactly the selected snapshot visuals');checks++;
 // A failure late in materialization must roll back release, runtime changes and revision together.
 nk.run('DELETE FROM remote_config_releases');const state=ctx.ecRead(nk),count=nk.sqlQuery('SELECT COUNT(*)::INT AS n FROM enemy_catalog_releases')[0].n;
 assert.equal(rpc('catalog','publish',{expected_revision:state.revision,note:'Must fail atomically'}).code,500);
 assert.equal(ctx.ecRead(nk).revision,state.revision);assert.equal(ctx.enemyCatalogVersion(nk),state.active_release);
 assert.equal(nk.sqlQuery('SELECT COUNT(*)::INT AS n FROM enemy_catalog_releases')[0].n,count);checks++;
 assert.equal(JSON.parse(ctx.ecHistoryRpc({},logger,nk,'{}','audit','list')).code,403);checks++;
 const audit=JSON.parse(ctx.ecHistoryRpc(admin,logger,nk,'{}','audit','list'));assert.equal(audit.success,true);assert.ok(audit.data.rows.every(r=>r.actor==='test-admin'));checks++;
 console.log(`PASS C259 PostgreSQL integration: ${checks} checks; ${projection.counts.stage_entries} entries / ${projection.counts.waves} waves validated`);
}finally{
 if(!/^c259_test_\d+$/.test(name))throw Error('Unsafe disposable database name');
 cp.execFileSync('docker',['exec',container,'dropdb','-U','postgres','--if-exists',name]);
}

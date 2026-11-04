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
 { // Live local saves materialize atomically without release creation.
 const localAdmin={...admin,env:{...admin.env,APP_ENVIRONMENT:'develop',CONFIG_DRAFT_LIVE_ENABLED:'true'}};
 const liveRecord=ctx.ecRead(nk).catalog.find(r=>r.active),liveId=liveRecord.id;
 const releaseCounts=()=>nk.sqlQuery('SELECT (SELECT COUNT(*) FROM enemy_catalog_releases)::INT AS enemies,(SELECT COUNT(*) FROM remote_config_releases)::INT AS configs')[0];
 const beforeLive=releaseCounts();
 const localSave=(record,identity=localAdmin)=>rpc('catalog','save',{id:liveId,data:record.data,active:true,expected_revision:record.revision},identity);
 const changed=JSON.parse(JSON.stringify(liveRecord));changed.data.base_attributes.hp+=17;
 const liveSaved=ok(localSave(changed));
 assert.deepEqual(releaseCounts(),beforeLive,'Live save must create no releases');
 assert.equal(nk.sqlQuery("SELECT value->'enemy_framework'->'species'->$1->'base_attributes'->>'hp' AS hp FROM game_config WHERE key='progression'",[liveId])[0].hp,String(changed.data.base_attributes.hp));
 assert.equal(ctx.enemyCatalogVersion(nk),'draft:'+liveSaved.draft_revision);
 assert.equal(nk.sqlQuery("SELECT value->'enemy_framework'->>'catalog_version' AS version FROM game_config WHERE key='progression'")[0].version,ctx.enemyCatalogVersion(nk));checks++;
 const afterLive=ctx.ecRead(nk).revision;
 assert.equal(localSave(changed).code,409);assert.equal(ctx.ecRead(nk).revision,afterLive);checks++;
 const invalid=JSON.parse(JSON.stringify(liveSaved.data));invalid.data.visual_set_id='missing_fixture';
 assert.equal(localSave(invalid).code,422);assert.equal(ctx.ecRead(nk).revision,afterLive);checks++;
 // Even a forged enable flag cannot make production materialize a draft.
 const prod=JSON.parse(JSON.stringify(liveSaved.data));prod.data.base_attributes.hp+=23;
 const prodSaved=ok(localSave(prod,{...admin,env:{...admin.env,APP_ENVIRONMENT:'production',CONFIG_DRAFT_LIVE_ENABLED:'true'}}));
 assert.equal(nk.sqlQuery("SELECT value->'enemy_framework'->'species'->$1->'base_attributes'->>'hp' AS hp FROM game_config WHERE key='progression'",[liveId])[0].hp,String(changed.data.base_attributes.hp));
 assert.deepEqual(releaseCounts(),beforeLive);checks++;
 // Failure in projection rolls the authoring write back as well.
 nk.run("UPDATE game_config SET key='fixture_progression' WHERE key='progression'");
 assert.equal(localSave(prodSaved.data).code,500);
 assert.equal(ctx.ecRead(nk).revision,prodSaved.draft_revision);
 assert.equal(ctx.ecRead(nk).catalog.find(r=>r.id===liveId).revision,prodSaved.data.revision);
 nk.run("UPDATE game_config SET key='progression' WHERE key='fixture_progression'");checks++;
 // Explicit publication remains available as a checkpoint and resets runtime identity.
 const checkpoint=ok(rpc('catalog','publish',{expected_revision:ctx.ecRead(nk).revision,note:'Explicit live checkpoint'},localAdmin)).data;
 assert.equal(ctx.enemyCatalogVersion(nk),checkpoint.version);
 assert.equal(releaseCounts().enemies,beforeLive.enemies+1);assert.equal(releaseCounts().configs,beforeLive.configs+1);checks++;
 }
 console.log('PASS C260 local live drafts: atomic projection, validation, CAS, production isolation, rollback and explicit checkpoint');
}finally{
 if(!/^c259_test_\d+$/.test(name))throw Error('Unsafe disposable database name');
 cp.execFileSync('docker',['exec',container,'dropdb','-U','postgres','--if-exists',name]);
}

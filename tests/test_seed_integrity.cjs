// Integration tests use only the explicitly configured disposable database.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const {spawnSync} = require('child_process');
const root = path.resolve(__dirname, '..');
const pg = process.env.SEED_TEST_PSQL;
if (!pg || !process.env.SEED_TEST_PORT) throw new Error('Set SEED_TEST_PSQL and SEED_TEST_PORT for a disposable PostgreSQL instance');
const testSchema = 'seed_test_' + Date.now();
function sql(query) {
  const result = spawnSync(pg, ['-X','-q','-A','-t','-h','127.0.0.1','-p',process.env.SEED_TEST_PORT,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'], {input:query, encoding:'utf8', maxBuffer:32*1024*1024, env:{...process.env,PGOPTIONS:'-c search_path='+testSchema+',public'}});
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
const sandbox = vm.createContext({console});
for (const file of ['sweep_rpc','config_tables','monetization_tables','seed','event_service_rpc','config_rpc','monetization_rpc','weekly_leaderboard']) {
  vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',file+'.js'),'utf8'), sandbox);
}
const api = vm.runInContext('({seedGameData,createGameConfigTables,createMonetizationTables,seedBindSql,processHero,processArc,processCard,processTalisman,processSkill,processStage,processEffect,publishConfigRelease,getGameConfig})',sandbox);
let mutations = 0;
const nk = {
 sqlExec(query, params) { mutations++; return sql(params.length ? api.seedBindSql(query, params) : query); },
 sqlQuery(query, params) {return JSON.parse(sql(`SELECT COALESCE(json_agg(t),'[]'::json) FROM (${api.seedBindSql(query,params)}) t`));}
};
let lastError = '';
const logger = {info(){},warn(){},error(...args){lastError=args.join(' ');}};
const ctx = {env:{CONFIG_ADMIN_USER_ID:'admin'}};
const read = name => JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const seed = (table,rows,extra={}) => JSON.parse(api.seedGameData(ctx,logger,nk,JSON.stringify({table,rows,...extra})));
const good = (table,rows,extra={}) => {const result=seed(table,rows,extra); assert.equal(result.success,true,JSON.stringify(result)+' '+lastError); return result;};
sql('CREATE SCHEMA '+testSchema);
api.createGameConfigTables(nk,logger);
api.createMonetizationTables(nk,logger);
api.createGameConfigTables(nk,logger); // Additive migration is idempotent.
for (const table of ['heroes','enemies','items','skills','arcs','stages','stage_levels','cards','effects','talismans']) {console.log('Seeding',table); good(table,read(table));}
for (const [table,process] of [['heroes','processHero'],['arcs','processArc'],['cards','processCard'],['talismans','processTalisman'],['skills','processSkill'],['stages','processStage'],['effects','processEffect']]) {
  const columns = vm.runInContext('seedExtensionColumns()',sandbox)[table] || {};
  for (const source of read(table)) {
    const row=nk.sqlQuery(`SELECT * FROM game_${table} WHERE id=$1`,[source.id])[0];
    const result=JSON.parse(JSON.stringify(api[process](row,nk)));
    for (const key of Object.keys(source)) {
      if (key in columns || (table==='skills' && !['createria_unlock'].includes(key))) assert.deepEqual(result[key],source[key],`${table}.${source.id}.${key}`);
    }
  }
}
const before=mutations;
for (const payload of ['{','null',JSON.stringify({table:'heroes',rows:{}}),JSON.stringify({table:'heroes',rows:[{}]}),JSON.stringify({table:'cards',rows:[{id:'bad',display_name:'Bad',selection_weight:'oops'}]})]) assert.ok(JSON.parse(api.seedGameData(ctx,logger,nk,payload)).error);
assert.equal(mutations,before);
assert.equal(JSON.parse(api.seedGameData({userId:'player',env:{}},logger,nk,'{}')).code,403);
good('heroes',[{...read('heroes')[0],visual_scale:0,basic_attack_range:0}]);
assert.equal(Number(nk.sqlQuery('SELECT visual_scale FROM game_heroes WHERE id=$1',[read('heroes')[0].id])[0].visual_scale),0);
assert.equal(nk.sqlQuery('SELECT COUNT(*)::int AS n FROM game_heroes',[])[0].n,read('heroes').length);
const malicious="test'); DELETE FROM game_heroes; -- $seed$ \\ quote";
good('heroes',[{id:malicious,display_name:'Injection probe'}]);
assert.ok(nk.sqlQuery('SELECT id FROM game_heroes WHERE id=$1',[malicious]).length);
good('heroes',read('heroes'),{replace_all:true});
assert.equal(nk.sqlQuery('SELECT COUNT(*)::int AS n FROM game_heroes',[])[0].n,read('heroes').length);
const stage=read('stages')[0];
assert.ok(seed('stages',[{...stage,display_name:'should rollback',waves:[{entries:[]},{entries:null}],arc_id:null}]).error);
assert.equal(nk.sqlQuery('SELECT display_name FROM game_stages WHERE id=$1',[stage.id])[0].display_name,stage.display_name);
// Force a database failure after deletion and insertion of the first child.
sql("CREATE OR REPLACE FUNCTION reject_seed_wave() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.wave_index=1 THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_seed_wave BEFORE INSERT ON game_stage_waves FOR EACH ROW EXECUTE FUNCTION reject_seed_wave()");
const wavesBefore=nk.sqlQuery('SELECT * FROM game_stage_waves WHERE stage_id=$1 ORDER BY wave_index',[stage.id]);
assert.ok(seed('stages',[{...stage,display_name:'should rollback',waves:[{entries:[]},{entries:[]}]}]).error);
assert.deepEqual(nk.sqlQuery('SELECT * FROM game_stage_waves WHERE stage_id=$1 ORDER BY wave_index',[stage.id]),wavesBefore);
assert.equal(nk.sqlQuery('SELECT display_name FROM game_stages WHERE id=$1',[stage.id])[0].display_name,stage.display_name);
sql('DROP TRIGGER reject_seed_wave ON game_stage_waves; DROP FUNCTION reject_seed_wave()');
const versions=nk.sqlQuery('SELECT COUNT(*)::int AS n FROM remote_config_releases',[])[0].n;
good('remote_settings',[{module:'system',key:'ads_enabled',value_type:'bool',value:'true'}]);
assert.equal(nk.sqlQuery('SELECT COUNT(*)::int AS n FROM remote_config_releases',[])[0].n,versions);
assert.equal(nk.sqlQuery("SELECT snapshot->'system'->>'ads_enabled' AS value FROM remote_config_releases ORDER BY config_version DESC LIMIT 1",[])[0].value,'false');
assert.ok(seed('remote_settings',[{module:'system',key:'payment_enabled',value_type:'string',value:'true'}]).error);
const products = Object.entries(read('packs').packs_by_tab).flatMap(([tab,rows])=>rows.map(row=>({...row,tab_id:tab})));
const first=read('first_topup');
products.push({...first,id:'first_topup_pack',tab_id:'first_topup',rewards:first.grant_lines});
good('store_catalog',products,{replace_all:true});
const selected=products.find(row=>row.active===true);
const activeBefore=nk.sqlQuery('SELECT product_id,active FROM game_store_products ORDER BY product_id',[]);
const rewardsBefore=nk.sqlQuery('SELECT * FROM game_store_product_rewards WHERE product_id=$1 ORDER BY line_no',[selected.product_id]);
assert.ok(seed('store_catalog',[{...selected,rewards:[{reward_type:'item',reward_id:'missing-item',quantity:1}]}],{replace_all:true}).error);
assert.deepEqual(nk.sqlQuery('SELECT product_id,active FROM game_store_products ORDER BY product_id',[]),activeBefore);
sql("CREATE OR REPLACE FUNCTION reject_seed_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected reward failure'; END $$; CREATE TRIGGER reject_seed_reward BEFORE INSERT ON game_store_product_rewards FOR EACH ROW EXECUTE FUNCTION reject_seed_reward()");
assert.ok(seed('store_catalog',[selected],{replace_all:true}).error);
assert.deepEqual(nk.sqlQuery('SELECT product_id,active FROM game_store_products ORDER BY product_id',[]),activeBefore);
assert.deepEqual(nk.sqlQuery('SELECT * FROM game_store_product_rewards WHERE product_id=$1 ORDER BY line_no',[selected.product_id]),rewardsBefore);
sql('DROP TRIGGER reject_seed_reward ON game_store_product_rewards; DROP FUNCTION reject_seed_reward()');
good('store_catalog',[selected]);
assert.deepEqual(nk.sqlQuery('SELECT product_id,active FROM game_store_products ORDER BY product_id',[]),activeBefore);
good('store_catalog',[selected],{replace_all:true});
assert.equal(nk.sqlQuery('SELECT COUNT(*)::int AS n FROM game_store_products WHERE active=TRUE',[])[0].n,1);
assert.ok(seed('store_catalog',[selected, {...selected,id:'other-pack'}]).error);
for (const [id,file] of [['daily_checkin','daily_checkin'],['events','events'],['stamina','stamina_config'],['vip','vip_config'],['rewarded_ads','rewarded_ads'],['enemy_skills','enemy_skills'],['boss_skills','boss_skills'],['tribulation','tribulation_config']]) good('content_configs',[{id,payload:read(file)}]);
assert.equal(JSON.parse(api.seedGameData(ctx,logger,nk,JSON.stringify({table:'config',config_key:'progression',config_value:read('progression')}))).success,true);
assert.equal(JSON.parse(api.publishConfigRelease(ctx,logger,nk,'{}')).code,403);
good('remote_settings',[{module:'system',key:'payment_enabled',value_type:'bool',value:'true'}]);
const published=JSON.parse(api.publishConfigRelease({...ctx,userId:'admin'},logger,nk,'{}'));
assert.equal(published.status,'ok');
assert.equal(published.config_version,versions+1);
assert.equal(nk.sqlQuery("SELECT snapshot->'system'->>'payment_enabled' AS value FROM remote_config_releases ORDER BY config_version DESC LIMIT 1",[])[0].value,'true');
const content=JSON.parse(api.getGameConfig({...ctx,userId:'admin'},logger,nk,JSON.stringify({table:'all'})));
assert.equal(content.schema_version,2);
assert.deepEqual(content.enemy_skills,read('enemy_skills'));
assert.deepEqual(content.boss_skills,read('boss_skills'));
assert.deepEqual(content.tribulation,read('tribulation_config'));
assert.deepEqual(content.vip,read('vip_config'));
assert.deepEqual(content.rewarded_ads,read('rewarded_ads'));
if (process.env.SEED_TEST_CONFIG_OUT) fs.writeFileSync(process.env.SEED_TEST_CONFIG_OUT,JSON.stringify(content));
console.log('PASS PostgreSQL schema, config roundtrips, permissions, validation, zero values, injection, explicit replacement, wave/catalog rollback, draft isolation and admin publication');
sql('DROP SCHEMA '+testSchema+' CASCADE');

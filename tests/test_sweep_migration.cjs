// Startup migration uses an isolated schema on the disposable test PostgreSQL.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{spawnSync}=require('child_process');
const pg=process.env.SEED_TEST_PSQL,port=process.env.SEED_TEST_PORT;
if(!pg||!port)throw Error('Set SEED_TEST_PSQL and SEED_TEST_PORT to the disposable test database');
const schema='sweep_migration_test_'+Date.now();assert(/^sweep_migration_test_\d+$/.test(schema));
function sql(query,args=[],scalar=false){
 const bound=query.replace(/\$(\d+)\b/g,(_,n)=>"'"+String(args[Number(n)-1]).replace(/'/g,"''")+"'");
 const r=spawnSync(pg,['-X','-q','-t','-A','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:bound,encoding:'utf8',env:{...process.env,PGOPTIONS:'-c search_path='+schema+',public'}});
 if(r.status!==0)throw Error(r.stderr||r.error?.message||'psql failed');return scalar?r.stdout.trim():r.stdout;
}
const c=vm.createContext({}),get=n=>vm.runInContext(n,c);
for(const name of ['sweep_rpc','sweep_migration'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',name+'.js'),'utf8'),c);
const rules=JSON.stringify(get('SWEEP_DEFAULTS')),ticket=JSON.stringify(get('SWEEP_TICKET_DEFINITION'));
const migrate=()=>Number(sql('SELECT c144_migrate_stage_sweep($1::JSONB,$2::JSONB)',[rules,ticket],true));
const json=query=>JSON.parse(sql(query,[],true));
try{
 sql(`CREATE SCHEMA ${schema};
 CREATE TABLE remote_config_releases(config_version INT PRIMARY KEY,snapshot JSONB NOT NULL,min_app_version TEXT NOT NULL,latest_app_version TEXT NOT NULL,store_url TEXT NOT NULL DEFAULT '',published_by TEXT NOT NULL DEFAULT 'system');
 CREATE TABLE remote_config_settings(module TEXT,key TEXT,value TEXT);
 CREATE TABLE game_items(id TEXT PRIMARY KEY,display_name TEXT,description TEXT,category TEXT,rarity TEXT,icon_id TEXT,stackable BOOLEAN,max_stack INT,sort_order INT,expires_after_hours INT,tags JSONB,attributes JSONB);
 CREATE TABLE untouched_player_data(value JSONB);
 INSERT INTO untouched_player_data VALUES(' {"gold":123,"items":[1,2,3]}');
 INSERT INTO remote_config_settings VALUES('system','ads_enabled','true');`);
 sql(get('sweepMigrationSql')());
 const original={system:{ads_enabled:false,min_app_version:'1.0.0',latest_app_version:'1.0.0',custom:'preserve'},game_play:{balance:731}};
 sql("INSERT INTO remote_config_releases VALUES(7,$1::JSONB,'1.0.0','1.0.0','https://store.example','operator')",[JSON.stringify(original)]);
 assert.equal(migrate(),8);assert.equal(migrate(),8,'restart must not append another release');
 assert.equal(Number(sql('SELECT COUNT(*) FROM remote_config_releases',[],true)),2);
 assert.deepEqual(json('SELECT snapshot FROM remote_config_releases WHERE config_version=7'),original,'published history is immutable');
 const upgraded=json('SELECT snapshot FROM remote_config_releases WHERE config_version=8');
 assert.equal(upgraded.system.stage_sweep.round_duration_ms,90000);assert.equal(upgraded.system.ads_enabled,false,'pending draft must not publish');assert.equal(upgraded.system.custom,'preserve');assert.deepEqual(upgraded.game_play,original.game_play);
 assert.equal(upgraded.system.min_app_version,'1.1.0');assert.equal(upgraded.system.latest_app_version,'1.1.0');
 assert.equal(Number(sql("SELECT COUNT(*) FROM game_items WHERE id='campaign_sweep_ticket'",[],true)),1);
 const custom=JSON.parse(rules);custom.enabled=false;custom.round_duration_ms=120000;upgraded.system.stage_sweep=custom;
 sql("INSERT INTO remote_config_releases VALUES(9,$1::JSONB,'2.0.0','2.1.0','custom-store','operator');UPDATE game_items SET max_stack=400 WHERE id='campaign_sweep_ticket'",[JSON.stringify(upgraded)]);
 assert.equal(migrate(),9);assert.deepEqual(json('SELECT snapshot FROM remote_config_releases WHERE config_version=9'),upgraded,'custom published rules preserved');
 assert.equal(Number(sql("SELECT max_stack FROM game_items WHERE id='campaign_sweep_ticket'",[],true)),400,'existing item definition preserved');
 assert.deepEqual(json('SELECT value FROM untouched_player_data'),{gold:123,items:[1,2,3]});
 assert.equal(sql("SELECT value FROM remote_config_settings WHERE key='ads_enabled'",[],true),'true','draft unchanged');
 console.log('PASS C144 startup migration PostgreSQL: restart exactly once, immutable history, custom rules/items preserved, drafts not published, player data untouched');
}finally{sql(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}

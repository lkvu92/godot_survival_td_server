// Disposable PostgreSQL only: native System migration and daily quota constraints.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{spawnSync}=require('child_process');
const pg=process.env.SEED_TEST_PSQL,port=process.env.SEED_TEST_PORT;
if(!pg||!port)throw Error('Set SEED_TEST_PSQL and SEED_TEST_PORT for a disposable database');
const schema='rewarded_test_'+Date.now(),root=path.join(__dirname,'..');
function sql(query){const r=spawnSync(pg,['-X','-q','-A','-t','-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:query,encoding:'utf8',env:{...process.env,PGOPTIONS:'-c search_path='+schema+',public'}});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
const q=x=>"'"+String(x).replace(/'/g,"''")+"'";
const patch=require('../nakama/build_rewarded_system_patch.cjs');
const legacy=JSON.parse(JSON.stringify(patch.defaults));legacy.schema_version=1;delete legacy.placements.stage_reward_x2_ad;delete legacy.placements.card_reroll_ad.run_limit;delete legacy.placements.combat_revive_ad.run_limit;
legacy.placements.stamina_dialog_ad.amount=7;legacy.placements.stamina_dialog_ad.daily_limit=4;
const context=vm.createContext({});
for(const file of ['seed','monetization_rpc'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',file+'.js'),'utf8'),context);
const bind=vm.runInContext('seedBindSql',context),reserve=vm.runInContext('reserveDailyRewardClaim',context);
try{
 sql(`CREATE SCHEMA ${schema};`);
 sql(`CREATE TABLE remote_config_settings(module TEXT,key TEXT,value_type TEXT,value TEXT,description TEXT,is_active BOOL,updated_at TIMESTAMPTZ,PRIMARY KEY(module,key));CREATE TABLE game_content_configs(id TEXT PRIMARY KEY,payload JSONB,active BOOL);INSERT INTO game_content_configs VALUES('rewarded_ads',${q(JSON.stringify(legacy))}::JSONB,TRUE);CREATE TABLE monetization_daily_reward_claims(user_id TEXT,placement_id TEXT,reward_date DATE,claim_slot INT,ad_session_id TEXT UNIQUE,PRIMARY KEY(user_id,placement_id,reward_date,claim_slot));`);
 sql(patch.sql);
 let cfg=JSON.parse(sql("SELECT value FROM remote_config_settings WHERE module='system' AND key='rewarded_ads'"));
 assert.equal(cfg.schema_version,2);assert.equal(cfg.placements.stamina_dialog_ad.amount,7);assert.equal(cfg.placements.stamina_dialog_ad.daily_limit,4);
 assert.equal(cfg.placements.stage_reward_x2_ad.daily_limit,5);assert.equal(cfg.placements.card_reroll_ad.run_limit,3);
 cfg.placements.stamina_dialog_ad.amount=11;
 sql(`UPDATE remote_config_settings SET value=${q(JSON.stringify(cfg))};`);sql(patch.sql);
 assert.deepEqual(JSON.parse(sql("SELECT value FROM remote_config_settings WHERE module='system' AND key='rewarded_ads'")),cfg,'Reapplying migration preserves operator edits');
 const nk={sqlQuery(query,args){const bound=bind(query,args);const wrapped=query.trim().startsWith('INSERT')?`WITH result AS (${bound}) SELECT COALESCE(json_agg(result),'[]'::JSON) FROM result`:`SELECT COALESCE(json_agg(result),'[]'::JSON) FROM (${bound}) result`;return JSON.parse(sql(wrapped));}};
 for(let i=0;i<5;i++)assert.equal(reserve(nk,'u','stage_reward_x2_ad','s'+i,5).claim_slot,i+1);
 assert.equal(reserve(nk,'u','stage_reward_x2_ad','sixth',5),null);
 assert.equal(reserve(nk,'u','stage_reward_x2_ad','s0',5).claim_slot,1,'Native same-session replay keeps one slot');
 assert.equal(reserve(nk,'other-user','stage_reward_x2_ad','other-session',5).claim_slot,1);
 console.log('PASS native PostgreSQL: legacy-to-System config migration, operator-value preservation/idempotency, five daily slots, sixth rejected, replay and user isolation');
}finally{sql(`DROP SCHEMA IF EXISTS ${schema} CASCADE;`);}

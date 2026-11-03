const fs=require('fs'),path=require('path'),assert=require('assert'),{execFileSync}=require('child_process');
const container='survival_td_local-postgres-1';
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
assert.equal(JSON.parse(run(['inspect',container]))[0].Config.Labels['com.docker.compose.project'],'survival_td_local');
const sql=q=>run(['exec','-i',container,'psql','-X','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-Atq'],q);
const quote=s=>"'"+String(s).replaceAll("'","''")+"'",json=x=>quote(JSON.stringify(x))+'::jsonb';
const progression=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/progression.json'),'utf8'));
const enemies=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/enemies.json'),'utf8'));
const before={progression:JSON.parse(sql("SELECT value FROM game_config WHERE key='progression'")),enemies:JSON.parse(sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM game_enemies e'))};
const desired=structuredClone(before);desired.progression.enemy_framework=progression.enemy_framework;
for(const enemy of desired.enemies){const source=enemies.find(e=>e.id===enemy.id);assert(source,'Unknown local enemy '+enemy.id);assert(Number.isFinite(source.attributes.attack_speed));enemy.attributes.attack_speed=source.attributes.attack_speed;}
if(require("node:util").isDeepStrictEqual(before,desired)){console.log('ALREADY_INSTALLED');process.exit(0);}
const version=Number(sql('SELECT max(config_version) FROM remote_config_releases'));
const backup=path.resolve(__dirname,'../../tmp/enemy-speed-local-'+Date.now());fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(before,null,2));
let q=`BEGIN; SET LOCAL lock_timeout='5s'; LOCK TABLE game_enemies,game_config,remote_config_releases IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN IF (SELECT max(config_version) FROM remote_config_releases)<>${version} OR (SELECT value FROM game_config WHERE key='progression') IS DISTINCT FROM ${json(before.progression)} OR (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM game_enemies e) IS DISTINCT FROM ${json(before.enemies)} THEN RAISE EXCEPTION 'Concurrent catalog edit'; END IF; END $$;
UPDATE game_config SET value=${json(desired.progression)} WHERE key='progression';`;
for(const e of desired.enemies)q+=`UPDATE game_enemies SET attributes=${json(e.attributes)} WHERE id=${quote(e.id)};\n`;
q+=`INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by) SELECT ${version+1},snapshot,min_app_version,latest_app_version,store_url,'enemy-speed-local' FROM remote_config_releases WHERE config_version=${version}; COMMIT;`;
sql(q);
assert.deepEqual(JSON.parse(sql("SELECT value FROM game_config WHERE key='progression'")),desired.progression);
assert.deepEqual(JSON.parse(sql('SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM game_enemies e')),desired.enemies);
console.log(JSON.stringify({status:'PASS',config_version:version+1,enemies:desired.enemies.length,species:Object.keys(desired.progression.enemy_framework.species).length,backup}));

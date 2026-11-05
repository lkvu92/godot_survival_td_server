/* C268: explicitly local, atomic unit migration. Default verifies, --apply writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pg='survival_td_local-postgres-1',nk='survival_td_local-nakama-1';
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
for(const name of [pg,nk]) { const c=JSON.parse(docker(['inspect',name]))[0];assert.equal(c.Config.Labels['com.docker.compose.project'],'survival_td_local');assert(c.State.Running);if(name===nk)assert.equal(c.NetworkSettings.Ports['7350/tcp'][0].HostIp,'127.0.0.1'); }
const info=JSON.parse(docker(['inspect',pg]))[0],env=Object.fromEntries(info.Config.Env.map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
const sql=q=>docker(['exec','-i',pg,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],q);
const read=()=>JSON.parse(sql("SELECT json_build_object('heroes',(SELECT json_agg(json_build_object('id',id,'attributes',attributes) ORDER BY id) FROM game_heroes),'progression',(SELECT value FROM game_config WHERE key='progression'))"));
const before=read(),desired=JSON.parse(JSON.stringify(before)),units=require('../data/progression.json').combat_speed;
const migrated=before.progression.combat_speed!==undefined;
if(migrated) assert.deepEqual(before.progression.combat_speed,units,'Unexpected deployed unit schema; refuse automatic conversion');
else for(const hero of desired.heroes) { assert(Number.isFinite(hero.attributes.attack_speed)&&hero.attributes.attack_speed>0,'Invalid explicitly legacy hero APS');hero.attributes.attack_speed=Number((hero.attributes.attack_speed*100).toFixed(6)); }
desired.progression.combat_speed=units;delete desired.progression.hero_skill_travel_speed;
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'",json=v=>quote(JSON.stringify(v))+'::jsonb';
if(process.argv.includes('--apply')&&!migrated) {
 const backup=path.resolve(root,'../tmp/c268-local',String(Date.now()));fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(before,null,2)+'\n');
 let q="BEGIN; SET LOCAL lock_timeout='5s'; LOCK TABLE game_config,game_heroes IN SHARE ROW EXCLUSIVE MODE;\n";
 q+=`DO $$ BEGIN IF (SELECT value FROM game_config WHERE key='progression') IS DISTINCT FROM ${json(before.progression)} OR (SELECT jsonb_agg(jsonb_build_object('id',id,'attributes',attributes) ORDER BY id) FROM game_heroes) IS DISTINCT FROM ${json(before.heroes)} THEN RAISE EXCEPTION 'C268_CONCURRENT_CHANGE'; END IF; END $$;\n`;
 for(const hero of desired.heroes) q+=`UPDATE game_heroes SET attributes=${json(hero.attributes)} WHERE id=${quote(hero.id)};\n`;
 q+=`UPDATE game_config SET value=${json(desired.progression)} WHERE key='progression'; COMMIT;`;
 sql(q);fs.writeFileSync(path.join(backup,'after.json'),JSON.stringify(read(),null,2)+'\n');console.log('C268 local migration backup: '+backup);
}
assert.deepEqual(read(),desired);
console.log('PASS C268 local readback: declared legacy hero APS -> SPD x100 once; other attributes/progression preserved, flight disabled');

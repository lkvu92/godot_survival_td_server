/* Explicit local C268 v1.1: normalize base SPD only, never growth or player storage. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{isDeepStrictEqual}=require('node:util'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pg='survival_td_local-postgres-1',nk='survival_td_local-nakama-1';
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
for(const name of [pg,nk]){const c=JSON.parse(docker(['inspect',name]))[0];assert.equal(c.Config.Labels['com.docker.compose.project'],'survival_td_local');assert(c.State.Running);if(name===nk)assert.equal(c.NetworkSettings.Ports['7350/tcp'][0].HostIp,'127.0.0.1');}
const info=JSON.parse(docker(['inspect',pg]))[0],env=Object.fromEntries(info.Config.Env.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
const sql=q=>docker(['exec','-i',pg,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],q);
const ids=require('../data/heroes.json').map(h=>h.id).sort(),quote=x=>"'"+String(x).replace(/'/g,"''")+"'",list=ids.map(quote).join(','),json=x=>quote(JSON.stringify(x))+'::jsonb';
const query=`SELECT json_build_object('heroes',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM game_heroes h WHERE id IN(${list})),'speed_units',(SELECT value->'combat_speed' FROM game_config WHERE key='progression'))`;
const read=()=>JSON.parse(sql(query)),before=read(),desired=JSON.parse(JSON.stringify(before));
assert.deepEqual(before.speed_units,require('../data/progression.json').combat_speed,'Canonical SPD units required first');assert.deepEqual(before.heroes.map(h=>h.id),ids);
for(const hero of desired.heroes)hero.attributes.attack_speed=100;
if(process.argv.includes('--apply')&&!isDeepStrictEqual(before,desired)){
 const backup=path.resolve(root,'../tmp/c268-base100-local',String(Date.now()));fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(before,null,2)+'\n');
 sql(`BEGIN;SET LOCAL lock_timeout='5s';LOCK TABLE game_heroes,game_config IN SHARE ROW EXCLUSIVE MODE;
 DO $$ BEGIN IF (SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM game_heroes h WHERE id IN(${list})) IS DISTINCT FROM ${json(before.heroes)} OR (SELECT value->'combat_speed' FROM game_config WHERE key='progression') IS DISTINCT FROM ${json(before.speed_units)} THEN RAISE EXCEPTION 'C268_BASE100_CONCURRENT_CHANGE'; END IF;END $$;
 UPDATE game_heroes SET attributes=jsonb_set(attributes,'{attack_speed}','100'::jsonb,true) WHERE id IN(${list});COMMIT;`);
 fs.writeFileSync(path.join(backup,'after.json'),JSON.stringify(read(),null,2)+'\n');console.log('C268 base100 local backup: '+backup);
}
assert.deepEqual(read(),desired);console.log('PASS C268 base100 local readback: five hero bases=100; growth and all other hero columns preserved');

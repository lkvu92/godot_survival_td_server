/* C239 local arc level requirements only; atomic, guarded and reversible. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const pg='survival_td_local-postgres-1',nk='survival_td_local-nakama-1',docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
for(const name of [pg,nk]){const c=JSON.parse(docker(['inspect',name]))[0];assert.equal(c.Config.Labels['com.docker.compose.project'],'survival_td_local');assert(c.State.Running);if(name===nk)assert.equal(c.NetworkSettings.Ports['7350/tcp'][0].HostIp,'127.0.0.1');}
const container=JSON.parse(docker(['inspect',pg]))[0],env=Object.fromEntries(container.Config.Env.map(x=>{let i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
const sql=q=>docker(['exec','-i',pg,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],q),read=()=>JSON.parse(sql("SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM game_arcs a WHERE id <> 'arc_0'"));
const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/arcs.json'),'utf8')).filter(x=>x.id!=='arc_0'),before=read();assert.equal(before.length,7);const desired=structuredClone(before);
for(const a of desired){let row=source.find(x=>x.id===a.id);assert(row);a.level_min=row.level_min;a.level_max=row.level_max;}
const quote=x=>"'"+String(x).replace(/'/g,"''")+"'",json=x=>quote(JSON.stringify(x))+'::jsonb';const dir=path.resolve(__dirname,'../../tmp/c239-arc-requirements',String(Date.now()));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify(before,null,2));
let q="BEGIN; SET LOCAL lock_timeout='5s'; LOCK TABLE game_arcs IN SHARE ROW EXCLUSIVE MODE;\n";
q+=`DO $$ BEGIN IF (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM game_arcs a WHERE id <> 'arc_0') IS DISTINCT FROM ${json(before)} THEN RAISE EXCEPTION 'C239_ARC_CONCURRENT_CHANGE'; END IF; END $$;\n`;
for(const a of desired)q+=`UPDATE game_arcs SET level_min=${a.level_min}, level_max=${a.level_max} WHERE id=${quote(a.id)};\n`;
q+=`DO $$ BEGIN IF (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM game_arcs a WHERE id <> 'arc_0') IS DISTINCT FROM ${json(desired)} THEN RAISE EXCEPTION 'C239_ARC_POSTCHECK'; END IF; END $$; COMMIT;`;
sql(q);assert.deepEqual(read(),desired);fs.writeFileSync(path.join(dir,'after.json'),JSON.stringify(desired,null,2));console.log(JSON.stringify({status:'PASS',scope:'local arc min/max only',backup:dir}));

/* C240: local-only element metadata patch; preserve balance, profiles and releases. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const mode=process.argv[2];if(!['--check','--apply','--verify'].includes(mode))throw Error('Use --check|--apply|--verify');
const root=path.resolve(__dirname,'..'),project='survival_td_local',pg=project+'-postgres-1',nk=project+'-nakama-1';
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
try{
 for(const name of [pg,nk]){const m=JSON.parse(docker(['inspect',name]))[0];assert.equal(m.Config.Labels['com.docker.compose.project'],project);assert(m.State.Running);if(name===nk)assert.equal(m.NetworkSettings.Ports['7350/tcp'][0].HostIp,'127.0.0.1');}
 const m=JSON.parse(docker(['inspect',pg]))[0],env=Object.fromEntries(m.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
 const sql=q=>docker(['exec','-i',pg,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],q);
 const read=table=>JSON.parse(sql(`SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM ${table} r;`));
 const tables=['game_skills','game_enemies'],before=Object.fromEntries(tables.map(t=>[t,read(t)])),desired=structuredClone(before);
 const skills=JSON.parse(fs.readFileSync(path.join(root,'data/skills.json'))),enemies=JSON.parse(fs.readFileSync(path.join(root,'data/enemies.json')));
 for(const skill of skills){const row=desired.game_skills.find(r=>r.id===skill.id);assert(row,`Missing local skill ${skill.id}`);row.element=skill.element;}
 for(const enemy of enemies){const row=desired.game_enemies.find(r=>r.id===enemy.id);assert(row,`Missing local enemy ${enemy.id}`);if(row.attack_skill&&Object.keys(row.attack_skill).length){assert(enemy.attack_skill?.element);row.attack_skill.element=enemy.attack_skill.element;}for(const skill of row.boss_skills||[]){const source=enemy.boss_skills?.find(s=>s.id===skill.id&&s.type===skill.type);assert(source?.element,`Unmatched local inline boss skill ${enemy.id}/${skill.id}`);skill.element=source.element;}}
 const releaseBefore=sql('SELECT config_version::text || \':\' || md5(snapshot::text) FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;');
 const changed=tables.reduce((sum,t)=>sum+before[t].filter((r,i)=>JSON.stringify(r)!==JSON.stringify(desired[t][i])).length,0);
 if(mode==='--check'){console.log(JSON.stringify({status:changed?'DIFF':'MATCH',changed_rows:changed,scope:'local skill/inline-attack element metadata only'}));process.exit(0);}
 if(mode==='--apply'&&changed){
  const backup=path.resolve(root,'../tmp/c240-local-elements',String(Date.now()));fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'before.json'),JSON.stringify(before,null,2)+'\n');
  const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
  let q="BEGIN; SET LOCAL lock_timeout='5s'; LOCK TABLE game_skills,game_enemies IN SHARE ROW EXCLUSIVE MODE;\n";
  for(const table of tables)q+=`DO $$ BEGIN IF (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM ${table} r) IS DISTINCT FROM ${quote(JSON.stringify(before[table]))}::jsonb THEN RAISE EXCEPTION 'C240_CATALOG_CHANGED'; END IF; END $$;\n`;
  for(const row of desired.game_skills)if(row.element!==before.game_skills.find(x=>x.id===row.id).element)q+=`UPDATE game_skills SET element=${quote(row.element)} WHERE id=${quote(row.id)};\n`;
  for(const row of desired.game_enemies)if(JSON.stringify(row)!==JSON.stringify(before.game_enemies.find(x=>x.id===row.id)))q+=`UPDATE game_enemies SET attack_skill=${row.attack_skill===null?'NULL':quote(JSON.stringify(row.attack_skill))+'::jsonb'},boss_skills=${row.boss_skills===null?'NULL':quote(JSON.stringify(row.boss_skills))+'::jsonb'} WHERE id=${quote(row.id)};\n`;
  for(const table of tables)q+=`DO $$ BEGIN IF (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM ${table} r) IS DISTINCT FROM ${quote(JSON.stringify(desired[table]))}::jsonb THEN RAISE EXCEPTION 'C240_POSTCHECK_FAILED'; END IF; END $$;\n`;
  sql(q+'COMMIT;');fs.writeFileSync(path.join(backup,'after.json'),JSON.stringify(Object.fromEntries(tables.map(t=>[t,read(t)])),null,2)+'\n');
 }
 for(const table of tables)assert.deepEqual(read(table),desired[table]);
 assert.equal(sql('SELECT config_version::text || \':\' || md5(snapshot::text) FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;'),releaseBefore);
 console.log(JSON.stringify({status:'PASS',mode,changed_rows:changed,preserved:'all balance fields, other rows, profiles and published releases',target:project}));
}catch(error){console.error('C240 local metadata sync failed: '+String(error.message).split('\n')[0]);process.exitCode=1;}

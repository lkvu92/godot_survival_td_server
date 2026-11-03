/* Authenticated local readback using an isolated device identity, no gameplay/rewards. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'..'),out=path.join(workspace,'tmp/c239-arc1-rpc');fs.mkdirSync(out,{recursive:true});
const appVersion=fs.readFileSync(path.join(workspace,'client/src/services/ConfigService.gd'),'utf8').match(/APP_VERSION := "([^"]+)"/)[1];
const project=fs.readFileSync(path.join(workspace,'client/project.godot'),'utf8'),key=project.match(/develop_server_key="([^"]+)"/)?.[1]||'defaultkey';
async function run(){
 const response=await fetch('http://127.0.0.1:7350/v2/account/authenticate/device?create=true',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({id:'c239-arc1-local-acceptance-device'})});assert(response.ok,'Local test authentication failed: '+response.status);const session=await response.json();assert(session.token);
 const call=async(id,payload)=>{const rpc=await fetch('http://127.0.0.1:7350/v2/rpc/'+id,{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({...payload,app_version:appVersion}))});assert(rpc.ok,'RPC HTTP '+rpc.status);return JSON.parse((await rpc.json()).payload);};
 const servers=await call('list_servers',{});assert(servers.success,JSON.stringify(servers));const server=servers.servers.find(s=>s.status==='open'&&s.allow_new_characters);assert(server,'No open local server for isolated acceptance character');const context={server_id:server.server_id,generation:Number(server.generation)};
 const created=await call('create_character',context);assert(created.success,JSON.stringify(created));
 const result=await call('get_game_config',{table:'all',...context});assert(!result.error,JSON.stringify(result.error));
 fs.writeFileSync(path.join(out,'authenticated-config.json'),JSON.stringify(result,null,2)+'\n');
 const data=result.data||result;assert(Array.isArray(data.stages),'Missing stages; response keys: '+Object.keys(result).join(','));const stages=data.stages.filter(s=>s.arc_id==='arc_2');assert.equal(stages.length,10);assert(stages.every(s=>s.stage_rules?.enemy_framework_version===2));assert(data.progression?.enemy_framework?.species?.a1_flame_imp);
 if(process.argv.includes('--campaign')){
  for(let n=1;n<=7;n++){
   const migration=n<=5?require('./arc'+n+'_levelled_catalog.cjs').load():require('./arc67_levelled_catalog.cjs').load(n);
   const remote=data.stages.filter(s=>s.arc_id===migration.arc_id);assert.equal(remote.length,10,`Arc ${n} stage count`);
   for(const expected of migration.stages){const actual=remote.find(s=>s.id===expected.id);assert(actual,expected.id);assert.equal(actual.stage_rules.enemy_framework_version,2);assert.equal(actual.level,expected.level);assert.deepEqual(actual.stage_rules,expected.stage_rules);assert.deepEqual(actual.waves.map(w=>w.entries),expected.waves.map(w=>w.entries),`Arc ${n} ${expected.id} wave readback`);}
  }
  assert.deepEqual(data.progression.enemy_framework,require('./enemy_framework_catalog.cjs').buildFramework(),'Shared growth/atlas/templates readback');
 }
 console.log(JSON.stringify({status:'PASS',authenticated:true,scope:process.argv.includes('--campaign')?'orders 1-7':'Arc 1',stages:process.argv.includes('--campaign')?70:stages.length,waves:process.argv.includes('--campaign')?1385:stages.reduce((n,s)=>n+s.waves.length,0),output:path.join(out,'authenticated-config.json')}));
}run().catch(e=>{console.error(String(e.message).slice(0,600));process.exitCode=1;});

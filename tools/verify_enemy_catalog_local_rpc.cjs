// Genuine local session, public catalog readback and rejected mutation checks.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const workspace=path.resolve(__dirname,'../..');
async function run(){
 const project=fs.readFileSync(path.join(workspace,'client/project.godot'),'utf8');
 const key=project.match(/develop_server_key="([^"]+)"/)?.[1]||'defaultkey';
 const app=fs.readFileSync(path.join(workspace,'client/src/services/ConfigService.gd'),'utf8').match(/APP_VERSION := "([^"]+)"/)[1];
 const auth=await fetch('http://127.0.0.1:7350/v2/account/authenticate/device?create=false',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({id:'c239-arc1-local-acceptance-device'})});
 assert(auth.ok,'Run verify_c239_arc1_local_rpc.cjs to initialize the isolated local fixture first');
 const session=await auth.json();
 const call=async(id,payload={})=>{const response=await fetch('http://127.0.0.1:7350/v2/rpc/'+id,{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({app_version:app,...payload}))});assert(response.ok,'RPC transport '+response.status);return JSON.parse((await response.json()).payload);};
 const servers=await call('list_servers'),server=servers.servers.find(s=>s.status==='open'&&s.allow_new_characters);assert(server);
 const scope={server_id:server.server_id,generation:Number(server.generation)};
 const config=await call('get_game_config',{table:'all',...scope});
 const enemyVersion=String(config.progression.enemy_framework.catalog_version);assert(/^[1-9][0-9]*$/.test(enemyVersion));
 assert.equal(config.stages.filter(s=>Number(s.stage_rules?.enemy_framework_version)===2).length,70);
 for(const species of Object.values(config.progression.enemy_framework.species)){
  const visual=config.enemies.find(e=>e.id===species.visual_definition_id);assert(visual?.presentation_assets&&Object.keys(visual.presentation_assets).length===6);
 }
 const denied=await call('admin_enemy_catalog_status');assert.equal(denied.code,403);
 const out=path.join(workspace,'tmp/c239-arc1-rpc/authenticated-config.json');fs.writeFileSync(out,JSON.stringify(config,null,2));
 console.log(JSON.stringify({status:'PASS',authenticated:true,enemy_version:enemyVersion,config_version:config.config_version,stages:70,normal_player_admin_denied:true}));
}
run().catch(error=>{console.error(String(error.message).slice(0,500));process.exitCode=1;});

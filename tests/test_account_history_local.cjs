const fs=require('fs'),crypto=require('crypto'),cp=require('child_process'),assert=require('assert'),path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../nakama/.env.local'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const custom='c245-fixture-'+crypto.randomUUID();let uid='',token='';
async function call(route,body,auth){const r=await fetch('http://127.0.0.1:7350'+route,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function rpc(id,body){const r=await call('/v2/rpc/'+id,JSON.stringify(body),'Bearer '+token);return JSON.parse(r.payload);}
(async()=>{
 const session=await call('/v2/account/authenticate/custom?create=true',{id:custom},'Basic '+Buffer.from(env.NAKAMA_SERVER_KEY+':').toString('base64'));
 token=session.token;uid=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).uid;assert(/^[a-f0-9-]{36}$/.test(uid));
 const registry=await rpc('list_servers',{});let target={};
 if(registry.server_mode==='multi'){
  const s=registry.servers.find(s=>s.available&&s.allow_new_characters);if(!s)throw Error('NO_OPEN_SERVER_FOR_FIXTURE');
  target={server_id:s.server_id,generation:Number(s.generation)};
  const created=await rpc('create_character',target);assert(created.success);
 }
 const history=await rpc('account_history',target);assert.equal(history.success,true);assert.deepEqual(history.transactions,[]);assert(history.summary.resources);assert(!JSON.stringify(history).includes('purchase_token'));
 console.log(JSON.stringify({suite:'B2/C245 local HTTP',generated_at:new Date().toISOString(),scope:'disposable custom account/character; no actual purchases; not email-link test',target,response:history},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{
 if(uid){assert(/^[a-f0-9-]{36}$/.test(uid));const owner=`account_id='${uid}'::uuid AND EXISTS(SELECT 1 FROM users WHERE id='${uid}'::uuid AND custom_id='${custom}')`;cp.execFileSync('docker',['exec','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-c',`BEGIN;DELETE FROM player_server_preferences WHERE ${owner};DELETE FROM player_characters WHERE ${owner};DELETE FROM account_link_state WHERE user_id='${uid}'::uuid AND EXISTS(SELECT 1 FROM users WHERE id='${uid}'::uuid AND custom_id='${custom}');DELETE FROM users WHERE id='${uid}'::uuid AND custom_id='${custom}';COMMIT;`],{encoding:'utf8'});}
});

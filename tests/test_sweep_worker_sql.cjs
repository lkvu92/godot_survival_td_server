// C144 scheduler SQL runs against an exact disposable schema, never game tables.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{spawnSync}=require('child_process');
const pg=process.env.SEED_TEST_PSQL,port=process.env.SEED_TEST_PORT;
if(!pg||!port)throw Error('Set SEED_TEST_PSQL and SEED_TEST_PORT');
const schema='sweep_worker_test_'+Date.now();
assert(/^sweep_worker_test_\d+$/.test(schema));
function sql(query,args=[],csv=false){
 const bound=query.replace(/\$(\d+)\b/g,(_,n)=>{const v=args[Number(n)-1];assert.notEqual(v,undefined);return v===null?'NULL':typeof v==='boolean'?(v?'TRUE':'FALSE'):typeof v==='number'?String(v):"'"+String(v).replace(/'/g,"''")+"'";});
 const r=spawnSync(pg,['-X','-q',...(csv?['--csv']:[]),'-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','-'],{input:bound,encoding:'utf8',env:{...process.env,PGOPTIONS:'-c search_path='+schema+',public'}});
 if(r.status!==0)throw Error(r.stderr||r.error?.message||'psql failed');return r.stdout;
}
// Query results here contain only UUIDs, numeric attempts and keys without commas.
function rows(query,args){const lines=sql(query,args,true).trim().split(/\r?\n/);if(lines.length<2)return[];const head=lines.shift().split(',');return lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[head[i],v])));}
let now=Date.now(),processed=[],fail=false,advance=false,notifications=0;
class Clock extends Date{static now(){return now;}}
const c=vm.createContext({Date:Clock});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/sweep_worker.js'),'utf8'),c);
const fn=n=>vm.runInContext(n,c),uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const nk={sqlExec:sql,sqlQuery:rows,uuidv4:()=>String(Math.random()),notificationSend(){notifications++;throw Error('socket unavailable');}};
c.mailCombatRuntime=runtime=>runtime;
c.characterRuntime=(_base,scope)=>({scope});c.withServerRequest=(_base,scope,action)=>action();
c.sweepProcess=(runtime,user,logger,time,limit)=>{assert.equal(limit,4);processed.push({user,scope:runtime.scope});if(advance)now+=800;if(fail)throw Error('simulated storage outage');return {session_id:user,state_version:2};};
const logger={warn(){}};
const tick=multi=>JSON.parse(fn('rpcSweepTick')({env:{MULTI_SERVER_ENABLED:String(multi)}},logger,nk,'{}'));
try{
 sql(`CREATE SCHEMA ${schema};CREATE TABLE users(id UUID PRIMARY KEY,disable_time TIMESTAMPTZ);CREATE TABLE account_link_state(user_id UUID,status TEXT);
 CREATE TABLE storage(user_id UUID,collection TEXT,key TEXT,value JSONB);
 CREATE TABLE game_servers(server_id TEXT,generation INT,status TEXT,opens_at TIMESTAMPTZ);
 CREATE TABLE player_characters(account_id UUID,server_id TEXT,generation INT,status TEXT);`);
 fn('sweepCreateWorkerIndex')(nk);fn('sweepCreateWorkerIndex')(nk);
 const add=(n,key='main')=>{sql('INSERT INTO users VALUES($1,NULL) ON CONFLICT DO NOTHING',[uid(n)]);sql("INSERT INTO storage VALUES($1,'player_profiles',$2,$3::JSONB)",[uid(n),key,JSON.stringify({sweep:{status:'running',next_due_at_ms:now-1000}})]);};
 for(let n=1;n<=40;n++)add(n);
 assert.equal(JSON.parse(fn('rpcSweepTick')({userId:uid(999),env:{}},logger,nk,'{}')).code,'FORBIDDEN');
 let result=tick(false);assert.equal(result.scanned,32);assert.equal(result.processed,32);assert.equal(processed.length,32);assert.equal(notifications,32,'socket failure cannot fail committed work');
 sql('DELETE FROM storage');processed=[];add(50);fail=true;result=tick(false);assert.equal(result.failed,1);assert.equal(rows('SELECT attempts FROM sweep_worker_claims WHERE user_id=$1',[uid(50)])[0].attempts,'1');
 fail=false;assert.equal(tick(false).scanned,0,'retry backoff excludes failing player');sql("UPDATE sweep_worker_claims SET retry_at=NOW()-INTERVAL '1 second',lease_until=NOW()-INTERVAL '1 second'");assert.equal(tick(false).processed,1);
 sql('DELETE FROM storage');processed=[];add(60);add(61);advance=true;result=tick(false);assert.equal(result.processed,1,'750ms deadline stops batch before next profile');advance=false;
 sql('DELETE FROM storage');processed=[];add(65);sql("UPDATE storage SET value=jsonb_set(jsonb_set(value,'{sweep,next_due_at_ms}',$1::JSONB),'{sweep,cancel_at_ms}',$2::JSONB)",[String(now+90000),String(now-1)]);
 assert.equal(tick(false).processed,1,'committed cancel marker is selected before future round deadline');
 sql('DELETE FROM storage');processed=[];add(70,'s001:g1:main');add(71,'s001:g2:main');add(72,'s002:g1:main');
 sql("INSERT INTO game_servers VALUES('s001',1,'open',NOW()-INTERVAL '1 day'),('s002',1,'maintenance',NOW()-INTERVAL '1 day');INSERT INTO player_characters VALUES($1,'s001',1,'ready'),($2,'s001',2,'ready'),($3,'s002',1,'ready')",[uid(70),uid(71),uid(72)]);
 assert.equal(tick(true).processed,1);assert.equal(processed[0].scope.serverId,'s001');assert.equal(processed[0].scope.generation,1);assert.equal(processed[0].scope.accountId,uid(70));
 console.log('PASS C144 real PostgreSQL: repeatable index DDL, bounded 32-profile scan, four-round cap, deadline, auth, retry backoff, failed socket, server/generation admission');
}finally{sql(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}

const assert=require('node:assert/strict');
const {runtime}=require('../tools/enemy_catalog_db.cjs');
const c=runtime();let calls=0;
c.startStage=()=>{calls++;return JSON.stringify({success:true});};
c.sweepResourceRuntime=n=>n;
const nk={sqlQuery(query){
 if(query.includes('FROM remote_config_releases'))return [{config_version:100,snapshot:{system:{min_app_version:'1.0.0'}}}];
 if(query.includes('FROM enemy_catalog_state'))return [{version:'1'}];
 throw Error('Unexpected query: '+query);
}};
for(const config_version of [undefined,0,99]){
 const result=JSON.parse(c.invokeWithVersionGate({}, {},nk,JSON.stringify({app_version:'1.1.0',config_version}),c.startStage));
 assert.equal(result.reason,'CONFIG_UPDATED');assert.equal(result.config_version,100);
}
assert.equal(calls,0,'Stale requests must not reach resource/run mutations');
const current=JSON.parse(c.invokeWithVersionGate({}, {},nk,JSON.stringify({app_version:'1.1.0',config_version:100}),c.startStage));
assert.equal(current.success,true);assert.equal(calls,1);
console.log('PASS C259 version gate: missing/stale requests reject before mutation; current version proceeds');

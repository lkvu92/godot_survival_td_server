const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const sandbox=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/character_repository.js'),'utf8'),sandbox);
const fn=name=>vm.runInContext(name,sandbox);
const a={accountId:'account-a',serverId:'s001',generation:1};
const b={...a,serverId:'s002'};
const objects=new Map();
const identity=r=>[r.userId,r.collection,r.key].join('/');
const nk={
  storageRead(refs){return refs.map(r=>objects.get(identity(r))).filter(Boolean);},
  storageWrite(writes){
    for(const w of writes){const old=objects.get(identity(w));if(w.version==='*'&&old)throw Error('CAS');if(w.version!=='*'&&(!old||old.version!==w.version))throw Error('CAS');}
    return writes.map(w=>{const row={...w,version:String(Number(objects.get(identity(w))?.version||0)+1)};objects.set(identity(w),row);return {collection:w.collection,key:w.key,userId:w.userId,version:row.version};});
  }
};
const write=(ctx,gold,version='*')=>fn('characterWrite')(nk,ctx,[{collection:'player_profiles',key:'main',userId:ctx.accountId,value:{gold},version}]);
write(a,100);write(b,200);
assert.equal(fn('characterRead')(nk,a,[{collection:'player_profiles',key:'main'}])[0].value.gold,100);
assert.equal(fn('characterRead')(nk,b,[{collection:'player_profiles',key:'main'}])[0].value.gold,200);
assert.equal(fn('characterRead')(nk,{...a,generation:2},[{collection:'player_profiles',key:'main'}]).length,0);
assert.throws(()=>write(a,999),'duplicate creation cannot overwrite progress');
assert.throws(()=>write(a,999,'stale'),'stale version cannot overwrite progress');
write(a,101,'1');
assert.equal(fn('characterRead')(nk,b,[{collection:'player_profiles',key:'main'}])[0].value.gold,200);
assert.throws(()=>fn('characterRead')(nk,a,[{collection:'player_compliance_profiles',key:'profile'}]));
assert.throws(()=>fn('characterWrite')(nk,a,[{collection:'player_profiles',key:'main',userId:'other',value:{},version:'*'}]));
assert.throws(()=>fn('characterStorageKey')({...a,serverId:'s001:%'},'main'));
assert.throws(()=>fn('characterWrite')(nk,a,[{collection:'player_profiles',key:'main',value:{}}]));
assert([...objects.values()].every(r=>r.permissionRead===0&&r.permissionWrite===0),'character data is runtime-only');
assert.equal(fn('characterRead')(nk,a,[{collection:'player_profiles',key:'main'}])[0].key,'main','repository normalizes keys for callers');
console.log('PASS character repository: server/generation isolation, ownership, CAS, runtime-only access');
const shared={userId:a.accountId,collection:'player_compliance_profiles',key:'profile',value:{verified:true},version:'1'};
objects.set(identity(shared),shared);
const boards=[];
nk.leaderboardCreate=(id,authoritative)=>{assert.equal(authoritative,true,'scoped boards reject direct client score writes');boards.push(id);};
nk.leaderboardRecordWrite=(id)=>({id});
const runtime=fn('characterRuntime')(nk,a);
assert.equal(runtime.storageRead([{collection:'player_profiles',key:'main',userId:a.accountId}])[0].value.gold,101);
runtime.storageWrite([{collection:'player_profiles',key:'main',userId:a.accountId,value:{gold:102}}]);
assert.equal(fn('characterRead')(nk,a,[{collection:'player_profiles',key:'main'}])[0].value.gold,102,'existing helpers get CAS from their request-local read');
assert.equal(runtime.storageRead([{collection:'player_compliance_profiles',key:'profile',userId:a.accountId}])[0].value.verified,true);
assert.throws(()=>runtime.storageRead([{collection:'unregistered',key:'main',userId:a.accountId}]));
assert.throws(()=>runtime.storageWrite([{collection:'player_profiles',key:'main',userId:'other',value:{},version:'*'}]));
assert.equal(runtime.leaderboardRecordWrite('combat_power_v2',a.accountId,'name',1).id,'s001:g1:combat_power_v2');
assert.deepEqual(boards,['s001:g1:combat_power_v2']);
assert.equal(fn('characterRead')(nk,b,[{collection:'player_profiles',key:'main'}])[0].value.gold,200);
console.log('PASS scoped gameplay runtime: shared compliance, inferred CAS, unknown collection rejection and leaderboard namespace');

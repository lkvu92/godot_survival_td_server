const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const c=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/player_rpc.js'),'utf8'),c);
const ensure=c.ensurePlayerName, rename=vm.runInContext('renamePlayer',c);
let google=true, generated=0, db, conflict=false;
const copy=value=>JSON.parse(JSON.stringify(value));
const nk={
 accountGetId:()=>({user:{googleId:google?'google-subject':'',username:google?'xYzSdkRandom':'EmailPlayer'}}),
 uuidv4:()=>{generated++;return 'abcdef12-1234-4321-abcd-123456789abc';},
 storageRead(reads){return reads.flatMap(r=>db[r.collection]?[copy({...db[r.collection],collection:r.collection,key:r.key,userId:r.userId})]:[]);},
 storageWrite(writes){
  for(const w of writes){const row=db[w.collection];if(conflict || (w.version==='*'?!!row:!!w.version&&(!row||row.version!==w.version)))throw Error('version conflict');}
  for(const w of writes)db[w.collection]={value:copy(w.value),version:'v'+Math.random()};
 }
};
function reset(profile={}){db={player_profiles:{value:copy(profile),version:'v1'}};google=true;generated=0;conflict=false;}
function call(name){return JSON.parse(rename({userId:'user'}, {}, nk,JSON.stringify({display_name:name})));}
reset();const p={};assert.equal(ensure(nk,'user',p),true);assert.equal(p.display_name,'Tu Giả ABCDEF');
ensure(nk,'user',p);assert.equal(generated,1,'generated once, reused from durable identity');
reset({display_name:'xYzSdkRandom'});ensure(nk,'user',db.player_profiles.value);assert.equal(db.player_profiles.value.display_name,'Tu Giả ABCDEF');
reset({display_name:'Tên đã đặt'});ensure(nk,'user',db.player_profiles.value);assert.equal(db.player_profiles.value.display_name,'Tên đã đặt');
reset();google=false;ensure(nk,'user',db.player_profiles.value);assert.equal(db.player_profiles.value.display_name,'EmailPlayer');
for(const name of ['ab','x'.repeat(25),'bad\nname','[b]name','bad\u200bname']){reset();assert.equal(call(name).code,400);assert(!db.player_identity);}
reset({display_name:'Initial'});assert.equal(call('Initial').code,400);
assert.equal(call('Tên Mới').success,true);assert.equal(db.player_identity.value.name_changes_used,1);
assert.equal(call('Tên Mới').success,true,'same-name retry safe');assert.equal(call('Another Name').code,409);
db.player_profiles.value={display_name:'stale client name',name_changes_used:0};
assert.equal(call('Bypass Name').code,409,'stale profile cannot restore chance');
ensure(nk,'user',db.player_profiles.value);assert.equal(db.player_profiles.value.display_name,'Tên Mới');assert.equal(db.player_profiles.value.name_changes_used,1);
reset({display_name:'Initial'});ensure(nk,'user',db.player_profiles.value);conflict=true;assert.equal(call('Concurrent Name').code,409);assert.equal(db.player_identity.value.name_changes_used,0);
reset();assert.equal(JSON.parse(rename({}, {}, nk,'{}')).code,401);
assert.equal(JSON.parse(rename({userId:'user'}, {}, nk,'null')).code,400);
console.log('PASS player names: Google generation/persistence, email/custom preservation, validation, CAS, one-time/replay and stale-save guard');

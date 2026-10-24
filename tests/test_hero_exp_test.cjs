const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const context=vm.createContext({parseJsonb:x=>x});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/progression_rpc.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/sweep_rpc.js'),'utf8'),context);
const access=vm.runInContext('adminExpTestAccess',context),grant=vm.runInContext('adminExpTest',context);
let db,writes,conflict,configValid;
const clone=v=>JSON.parse(JSON.stringify(v));
const accounts={a:'lkvu92@gmail.com',b:'LKVU921@GMAIL.COM',other:'other@gmail.com'};
context.getRemoteConfigValue=()=>configValid?Array.from({length:51},(_,i)=>i*1000):[];
const nk={
 sqlQuery(sql,args){
  if(sql.includes('FROM users')){
   assert.deepEqual(args.slice(1),['lkvu92@gmail.com','lkvu921@gmail.com']);
   return args.slice(1).includes((accounts[args[0]]||'').toLowerCase())?[{}]:[];
  }
  if(sql.includes('FROM game_heroes'))return [{attributes:{hp:100,atk:10},level_up_stats:{hp:1.1,atk:1.1}}];
  throw Error(sql);
 },
 storageRead(reads){return reads.map(r=>db[r.collection]).filter(Boolean).map(clone);},
 storageWrite(rows){
  if(conflict)throw Error('CAS');
  for(const r of rows)assert.equal(r.version,db[r.collection].version);
  writes++;for(const r of rows)db[r.collection]=clone(r);
 }
};
function reset(){writes=0;conflict=false;configValid=true;db={
 player_profiles:{collection:'player_profiles',version:'p1',value:{level:15,exp:123,resources:{gold:99}}},
 player_heroes:{collection:'player_heroes',version:'h1',value:{heroes:[{hero_id:'hero_1',level:1,exp:5,owned:true},{hero_id:'hero_2',level:1,exp:0,owned:false}]}},
 };}
const call=(id,p={hero_id:'hero_1'})=>JSON.parse(grant({userId:id},{},nk,JSON.stringify(p)));
for(const userId of ['a','b']){
 reset();assert(JSON.parse(access({userId},{},nk)).allowed);
 const profile=clone(db.player_profiles.value),r=call(userId,{hero_id:'hero_1',level:50,exp:1e9});
 assert(r.success);assert.equal(r.hero.level,15);assert.equal(r.hero.exp,0);assert(r.hero.current_attribute.hp>100);
 assert.deepEqual(db.player_profiles.value,profile);assert.equal(db.player_heroes.value.heroes[1].owned,false);
 assert.deepEqual(call(userId).hero,r.hero);
}
for(const id of ['other','']){reset();assert(!JSON.parse(access({userId:id},{},nk)).allowed);assert.equal(call(id).code,'FORBIDDEN');assert.equal(writes,0);}
reset();assert.equal(call('a',{hero_id:'hero_2'}).code,'HERO_NOT_OWNED');assert.equal(writes,0);
for(const activity of ['combat','sweep','tribulation']){reset();db.player_profiles.value.activity={type:activity};assert.equal(call('a').code,'ACTIVITY_ACTIVE');assert.equal(writes,0);}
for(const status of ['running','cancelling','blocked']){reset();db.player_profiles.value.sweep={status};assert.equal(call('a').code,'ACTIVITY_ACTIVE');assert.equal(writes,0);}
reset();db.player_stage_runs={collection:'player_stage_runs',value:{status:'active'}};assert.equal(call('a').code,'ACTIVITY_ACTIVE');assert.equal(writes,0);
reset();db.player_profiles.value.breakthrough={in_tribulation:true};assert.equal(call('a').code,'ACTIVITY_ACTIVE');
reset();conflict=true;assert.equal(call('a').code,'STATE_CONFLICT');assert.equal(writes,0);
reset();configValid=false;assert.equal(call('a').code,'CONFIG_INVALID');assert.equal(writes,0);
reset();db.player_profiles.value.level=50;assert.equal(call('a').hero.next_level_exp,0);
console.log('PASS C186 EXP test: two-account DB allowlist, forged input, owned hero, current user cap, stat recomputation, replay, activity/CAS/config guards');

const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const root=path.join(__dirname,'..'),c=vm.createContext({});
for(const name of ['character_repository','feature_unlocks','mailbox','player_rpc'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',name+'.js'),'utf8'),c);
const fn=name=>vm.runInContext(name,c),copy=x=>JSON.parse(JSON.stringify(x));
const config=JSON.parse(fs.readFileSync(path.join(root,'data/feature_unlocks.json'),'utf8'));
const realms=JSON.parse(fs.readFileSync(path.join(root,'data/realm_milestones.json'),'utf8'));
assert.deepEqual(copy(fn('FEATURE_DEFAULTS')),config);assert.deepEqual(copy(fn('REALM_MILESTONE_DEFAULTS')),realms);
fn('featureValidateConfig')(config,realms);
assert.deepEqual(copy(fn('defaultPlayerProfile')('new-user').feature_unlocks),{schema_version:1,unlocked:{},completed_tours:[]},'Fresh characters retain a pending Lv1 mailbox tour rather than being baselined as legacy');
const requested={mailbox:1,checkin:2,daily_quests:3,shop:4,sweep:5,leaderboard:10,elements:15,talisman:20,trial_tower:25,laws:30};
for(const [id,level] of Object.entries(requested)){assert.equal(config.features[id].required_user_level,level);assert.equal(config.features[id].enabled,true);assert(config.features[id].tour_id);}
for(const id of ['guild_war','ancient_battlefield','multiverse']){assert.equal(config.features[id].enabled,false);assert.equal(config.features[id].required_user_level,null);}
assert.equal(config.features.sweep.tour_id,'sweep_v2');assert.equal(config.features.sweep.tour_mode,'guided');
for(const mutate of [x=>delete x.features.checkin,x=>x.features.elements.required_user_level='20',x=>x.features.guild_war.enabled=true,x=>x.features.shop.tour_id=x.features.checkin.tour_id]){
    const bad=copy(config);mutate(bad);assert.throws(()=>fn('featureValidateConfig')(bad,realms));
}
let configMissing=false,serial=0,fail=false,pushes=0;
c.getRemoteConfigValue=(_nk,_module,key)=>key==='feature_unlocks'?(configMissing?null:config):key==='realm_milestones'?realms:{warning_hours:24,retention_days:7};
const store=new Map(),key=r=>r.userId+'/'+r.collection+'/'+r.key;
const base={sqlQuery(sql,args){if(sql.includes('sha256'))return [{hash:crypto.createHash('sha256').update(args[0]).digest('hex')}];throw Error(sql);},
    storageRead(refs){return refs.map(r=>store.get(key(r))).filter(Boolean).map(copy);},
    storageWrite(writes){const unique=new Set();for(const w of writes){assert(!unique.has(key(w)),'No duplicate keys in a transaction');unique.add(key(w));const old=store.get(key(w));if(w.version==='*'?old:!old||w.version!==old.version)throw Error('CAS conflict');}if(fail){fail=false;throw Error('injected precommit');}return writes.map(w=>{const row={...copy(w),version:'v'+(++serial)};store.set(key(w),row);return copy(row);});},
    notificationSend(){pushes++;throw Error('socket unavailable');}};
const userId='user',scope={accountId:userId,serverId:'s001',generation:1};
c.characterStorageKey=(s,k)=>s.serverId+':g'+s.generation+':'+k;
const scoped=fn('characterRuntime')(base,scope),runtime=fn('featureRuntime')(scoped,userId);
const read=()=>runtime.storageRead([{collection:'player_profiles',key:'main',userId}])[0];
const write=(value,version)=>runtime.storageWrite([{collection:'player_profiles',key:'main',userId,value,version,permissionRead:1,permissionWrite:0}]);
write({level:1,breakthrough:{history:[]}},'*');
assert.equal(Object.keys(read().value.feature_unlocks.unlocked).length,1);
let row=read();row.value.level=2;fail=true;assert.throws(()=>write(row.value,row.version));
assert.equal(read().value.level,1);assert.equal([...store.values()].filter(r=>r.collection==='player_mail').length,1);assert.equal(pushes,1);
row=read();row.value.level=2;write(row.value,row.version);
assert.equal(Object.keys(read().value.feature_unlocks.unlocked).length,2);assert.equal(pushes,2);
assert.equal(read().value.feature_unlocks.completed_tours.length,0,'Newly earned tour stays pending');
const stale=read();row=read();row.value.level=30;row.value.breakthrough.history=[{level:10},{level:20},{level:30}];write(row.value,row.version);
assert.equal(Object.keys(read().value.feature_unlocks.unlocked).length,12,'Jump reconciles all released features only');
assert.equal(pushes,15,'Nine unlock mails plus three proven breakthrough mails');
assert.throws(()=>write(stale.value,stale.version));
row=read();write(row.value,row.version);assert.equal(pushes,15,'Retries never redeliver');
const definition=copy(config.features.shop);config.features.shop.required_user_level=40;
assert.equal(fn('featureAccess')(read().value,'shop',{features:config.features}).success,true,'Existing rights survive threshold increases');
config.features.shop=definition;
for(const [id,f] of Object.entries(config.features)){
    if(!f.enabled)continue;
    if(f.required_user_level>1)assert.equal(fn('featureAccess')({level:f.required_user_level-1},id,{features:config.features}).code,'FEATURE_LOCKED');
    assert.equal(fn('featureAccess')({level:f.required_user_level},id,{features:config.features}).success,true);
}
assert.equal(fn('featureAccess')({level:50},'guild_war',{features:config.features}).code,'FEATURE_UNAVAILABLE');
const handler=()=>JSON.stringify({success:true,called:true});
const guard=fn('featureGuardedRpc')('upgrade_element',handler);
const ctx={userId};
assert.equal(JSON.parse(guard(ctx,{},runtime,'{}')).called,true);
configMissing=true;assert.equal(JSON.parse(guard(ctx,{},runtime,'{}')).code,'FEATURE_CONFIG_INVALID');configMissing=false;
assert.deepEqual(copy(fn('featureForRpc')('start_stage',{level_id:'epic'})),['stage_epic']);
assert.deepEqual(copy(fn('featureForRpc')('mail_list',{})),['mailbox']);
assert.deepEqual(copy(fn('featureForRpc')('prepare_rewarded_ad',{placement_id:'daily_mission_talisman_fragment_ad'})),['daily_quests']);
assert.deepEqual(copy(fn('featureForRpc')('preview_sweep',{sweep_type:'tower'})),['sweep','trial_tower']);
assert.deepEqual(copy(fn('featureForRpc')('start_sweep',{level_id:'legend'})),['sweep','stage_legend'],'Sweeping cannot bypass a difficulty gate');
assert.deepEqual(copy(fn('featureForRpc')('prepare_trial_tower',{})),[],'An accepted run may finish preparing after rollout');
assert.deepEqual(copy(fn('featureForRpc')('finish_sweep',{})),[],'Settlements remain possible');
const complete=fn('completeFeatureTour');
assert.equal(JSON.parse(complete(ctx,{},runtime,JSON.stringify({tour_id:'elements_v1'}))).success,true);
assert.equal(JSON.parse(complete(ctx,{},runtime,JSON.stringify({tour_id:'elements_v1'}))).success,true);
assert.deepEqual(copy(read().value.feature_unlocks.completed_tours),['elements_v1']);assert.equal(pushes,15);
// Another character has its own ledger, rights and tour state.
const other=fn('featureRuntime')(fn('characterRuntime')(base,{...scope,serverId:'s002'}),userId);
other.storageWrite([{collection:'player_profiles',key:'main',userId,value:{level:2},version:'*'}]);assert.equal(pushes,17);
assert.equal(other.storageRead([{collection:'player_profiles',key:'main',userId}])[0].value.feature_unlocks.completed_tours.length,0);
// Old characters: mails backfill once, historical tours baseline, no invented realm history.
const legacyScoped=fn('characterRuntime')(base,{...scope,generation:2});
legacyScoped.storageWrite([{collection:'player_profiles',key:'main',userId,value:{level:50},version:'*'}]);
const legacy=fn('featureRuntime')(legacyScoped,userId),old=legacy.storageRead([{collection:'player_profiles',key:'main',userId}])[0];
legacy.storageWrite([{collection:'player_profiles',key:'main',userId,value:old.value,version:old.version}]);
const migrated=legacy.storageRead([{collection:'player_profiles',key:'main',userId}])[0].value.feature_unlocks;
assert.equal(migrated.completed_tours.length,12);assert.equal(pushes,29);
// Deleting a mail preserves immutable source ledger; reconcile never recreates it.
const mail=[...store.values()].find(r=>r.collection==='player_mail');store.delete(key(mail));
row=read();write(row.value,row.version);assert.equal(pushes,29);
row=read();row.value.level=50;row.value.breakthrough.history.push({level:40},{level:50});write(row.value,row.version);
assert.equal(pushes,31,'All five successful realm milestones and newly eligible Phap Tac send congratulations');
const held=copy(config.features.guild_war);
Object.assign(config.features.guild_war,{required_user_level:40,enabled:true,release_status:'released',tour_id:'guild_war_v1'});
row=read();write(row.value,row.version);
assert.equal(pushes,32,'A later release opens for already eligible characters');
assert(!read().value.feature_unlocks.completed_tours.includes('guild_war_v1'));
config.features.guild_war=held;
assert.equal(fn('featureAccess')(read().value,'guild_war',{features:config.features}).code,'FEATURE_UNAVAILABLE','Disabling a release blocks access without deleting rights');
console.log('PASS C176: config parity/validation, thresholds, jump, CAS/rollback, durable mail, proven realms, migration, guards, tour ACK and character isolation');

const beforeNewRealms=pushes;
row=read();row.value.level=70;write(row.value,row.version);
assert.equal(pushes,beforeNewRealms,'Level alone cannot invent breakthrough mail');
row=read();row.value.breakthrough.history.push({level:60},{level:70});write(row.value,row.version);
assert.equal(pushes,beforeNewRealms+2,'Two new committed realms send mail');
row=read();write(row.value,row.version);assert.equal(pushes,beforeNewRealms+2,'New realm mails remain idempotent');
console.log('PASS C225 realm 60/70: proven history required, exactly-once mail');

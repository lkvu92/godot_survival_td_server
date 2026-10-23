const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const root=path.join(__dirname,'..'),c=vm.createContext({});
for(const name of ['character_repository','feature_unlocks','mailbox'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',name+'.js'),'utf8'),c);
const fn=name=>vm.runInContext(name,c),copy=x=>JSON.parse(JSON.stringify(x));
const config=JSON.parse(fs.readFileSync(path.join(root,'data/feature_unlocks.json'),'utf8'));
const realms=JSON.parse(fs.readFileSync(path.join(root,'data/realm_milestones.json'),'utf8'));
assert.deepEqual(copy(fn('FEATURE_DEFAULTS')),config);assert.deepEqual(copy(fn('REALM_MILESTONE_DEFAULTS')),realms);
fn('featureValidateConfig')(config,realms);
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
assert.equal(Object.keys(read().value.feature_unlocks.unlocked).length,0);
let row=read();row.value.level=2;fail=true;assert.throws(()=>write(row.value,row.version));
assert.equal(read().value.level,1);assert.equal([...store.values()].filter(r=>r.collection==='player_mail').length,0);assert.equal(pushes,0);
row=read();row.value.level=2;write(row.value,row.version);
assert.equal(Object.keys(read().value.feature_unlocks.unlocked).length,1);assert.equal(pushes,1);
assert.equal(read().value.feature_unlocks.completed_tours.length,0,'Newly earned tour stays pending');
const stale=read();row=read();row.value.level=30;row.value.breakthrough.history=[{level:10},{level:20},{level:30}];write(row.value,row.version);
assert.equal(Object.keys(read().value.feature_unlocks.unlocked).length,9,'Jump reconciles all released features only');
assert.equal(pushes,12,'Nine unlock mails plus three proven breakthrough mails');
assert.throws(()=>write(stale.value,stale.version));
row=read();write(row.value,row.version);assert.equal(pushes,12,'Retries never redeliver');
const definition=copy(config.features.shop);config.features.shop.required_user_level=40;
assert.equal(fn('featureAccess')(read().value,'shop',{features:config.features}).success,true,'Existing rights survive threshold increases');
config.features.shop=definition;
for(const [id,f] of Object.entries(config.features)){
    if(!f.enabled)continue;
    assert.equal(fn('featureAccess')({level:f.required_user_level-1},id,{features:config.features}).code,'FEATURE_LOCKED');
    assert.equal(fn('featureAccess')({level:f.required_user_level},id,{features:config.features}).success,true);
}
assert.equal(fn('featureAccess')({level:50},'guild_war',{features:config.features}).code,'FEATURE_UNAVAILABLE');
const handler=()=>JSON.stringify({success:true,called:true});
const guard=fn('featureGuardedRpc')('upgrade_element',handler);
const ctx={userId};
assert.equal(JSON.parse(guard(ctx,{},runtime,'{}')).called,true);
configMissing=true;assert.equal(JSON.parse(guard(ctx,{},runtime,'{}')).code,'FEATURE_CONFIG_INVALID');configMissing=false;
assert.deepEqual(copy(fn('featureForRpc')('start_stage',{level_id:'epic'})),['stage_epic']);
assert.deepEqual(copy(fn('featureForRpc')('preview_sweep',{sweep_type:'tower'})),['sweep','trial_tower']);
assert.deepEqual(copy(fn('featureForRpc')('start_sweep',{level_id:'legend'})),['sweep','stage_legend'],'Sweeping cannot bypass a difficulty gate');
assert.deepEqual(copy(fn('featureForRpc')('prepare_trial_tower',{})),[],'An accepted run may finish preparing after rollout');
assert.deepEqual(copy(fn('featureForRpc')('finish_sweep',{})),[],'Settlements remain possible');
const complete=fn('completeFeatureTour');
assert.equal(JSON.parse(complete(ctx,{},runtime,JSON.stringify({tour_id:'elements_v1'}))).success,true);
assert.equal(JSON.parse(complete(ctx,{},runtime,JSON.stringify({tour_id:'elements_v1'}))).success,true);
assert.deepEqual(copy(read().value.feature_unlocks.completed_tours),['elements_v1']);assert.equal(pushes,12);
// Another character has its own ledger, rights and tour state.
const other=fn('featureRuntime')(fn('characterRuntime')(base,{...scope,serverId:'s002'}),userId);
other.storageWrite([{collection:'player_profiles',key:'main',userId,value:{level:2},version:'*'}]);assert.equal(pushes,13);
assert.equal(other.storageRead([{collection:'player_profiles',key:'main',userId}])[0].value.feature_unlocks.completed_tours.length,0);
// Old characters: mails backfill once, historical tours baseline, no invented realm history.
const legacyScoped=fn('characterRuntime')(base,{...scope,generation:2});
legacyScoped.storageWrite([{collection:'player_profiles',key:'main',userId,value:{level:50},version:'*'}]);
const legacy=fn('featureRuntime')(legacyScoped,userId),old=legacy.storageRead([{collection:'player_profiles',key:'main',userId}])[0];
legacy.storageWrite([{collection:'player_profiles',key:'main',userId,value:old.value,version:old.version}]);
const migrated=legacy.storageRead([{collection:'player_profiles',key:'main',userId}])[0].value.feature_unlocks;
assert.equal(migrated.completed_tours.length,10);assert.equal(pushes,23);
// Deleting a mail preserves immutable source ledger; reconcile never recreates it.
const mail=[...store.values()].find(r=>r.collection==='player_mail');store.delete(key(mail));
row=read();write(row.value,row.version);assert.equal(pushes,23);
row=read();row.value.level=50;row.value.breakthrough.history.push({level:40},{level:50});write(row.value,row.version);
assert.equal(pushes,26,'All five successful realm milestones and newly eligible Than Luan send congratulations');
const held=copy(config.features.daily_quests);
Object.assign(config.features.daily_quests,{enabled:true,release_status:'released',tour_id:'daily_quests_v1'});
row=read();write(row.value,row.version);
assert.equal(pushes,27,'A later release opens for already eligible characters');
assert(!read().value.feature_unlocks.completed_tours.includes('daily_quests_v1'));
config.features.daily_quests=held;
assert.equal(fn('featureAccess')(read().value,'daily_quests',{features:config.features}).code,'FEATURE_UNAVAILABLE','Disabling a release blocks access without deleting rights');
console.log('PASS C176: config parity/validation, thresholds, jump, CAS/rollback, durable mail, proven realms, migration, guards, tour ACK and character isolation');

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),copy=x=>JSON.parse(JSON.stringify(x));
const config=JSON.parse(fs.readFileSync(path.join(root,'data/vip_config.json'),'utf8'));
const items=JSON.parse(fs.readFileSync(path.join(root,'data/items.json'),'utf8'));
const talismans=JSON.parse(fs.readFileSync(path.join(root,'data/talismans.json'),'utf8'));
const box=vm.createContext({});
for(const file of ['character_repository','config_rpc','progression_rpc','resource_rpc','monetization_rpc','mailbox','event_service_rpc','daily_checkin_rpc'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',file+'.js'),'utf8'),box);
const fn=name=>vm.runInContext(name,box);
box.parseJsonb=x=>typeof x==='string'?JSON.parse(x):x;
box.parseJsonObject=box.parseJsonb;
box.getRemoteConfigValue=(_nk,_module,_key,fallback)=>fallback;
let serial=0,fail=false,vipExp=1000,randomCalls=0;
const db=new Map(),key=r=>r.userId+'/'+r.collection+'/'+r.key;
const base={sqlQuery(sql,args=[]){
  if(sql.includes('sha256'))return[{hash:crypto.createHash('sha256').update(args[0]).digest('hex')}];
  if(sql.includes('game_content_configs'))return[{payload:copy(config)}];
  if(sql.includes('FROM player_vip_credits'))return[{exp:vipExp,revision:2}];
  if(sql.includes('game_items'))return items.filter(i=>i.id===args[0]).map(copy);
  if(sql.includes('player_characters')&&sql.includes('created_at_ms'))return[{created_at_ms:Date.now()}];
  throw Error('Unexpected SQL: '+sql);
},sqlExec(){},notificationSend(){},storageRead(refs){return refs.map(r=>db.get(key(r))).filter(Boolean).map(copy);},storageWrite(writes){
  for(const w of writes){const old=db.get(key(w));if(w.version==='*'?!!old:!old||w.version!==old.version)throw Error('CAS_CONFLICT');}
  if(fail){fail=false;throw Error('INJECTED_FAILURE');}
  return writes.map(w=>{const row={...copy(w),version:String(++serial)};db.set(key(w),row);return copy(row);});
}};
const context={accountId:'vip-user',serverId:'s001',generation:1},nk=fn('characterRuntime')(base,context),userId=context.accountId;
const seed=(c,k,v)=>nk.storageWrite([{collection:c,key:k,userId,value:v,version:'*'}]);
const read=(c,k)=>nk.storageRead([{collection:c,key:k,userId}])[0];
seed('player_profiles','main',{level:1,vip:12,resources:{gold:0,gems:100},stamina:0,unlocked_arcs:[]});
seed('player_inventory','items',{items:[]});seed('player_heroes','states',{heroes:[]});
assert.equal(config.milestone_rewards.length,12);
const expected=[
 [10,10,3,0,0,30,0,0,0,0,0],[10,0,5,2,0,60,0,0,0,0,0],[15,0,8,2,50,100,0,0,0,0,0],
 [20,0,11,2,100,150,0,0,0,0,0],[25,0,14,2,150,150,2,0,0,0,0],[30,0,17,2,50,150,2,2,0,0,0],
 [30,0,20,2,100,150,2,2,1,0,0],[35,0,23,3,50,150,2,2,3,0,0],[35,0,23,3,100,150,2,2,3,2,0],
 [35,0,23,3,100,150,2,2,3,2,50],[40,0,26,4,100,150,8,8,3,3,70],[45,0,30,4,100,150,10,10,5,4,100]
];
for(const [i,m] of config.milestone_rewards.entries()){
  const n=id=>m.rewards.find(r=>r.id===id)?.amount||0;
  const random=m.rewards.filter(r=>r.type==='random_items');
  assert.deepEqual([n('healing_elixir'),n('shield_elixir'),n('energy_elixir'),n('exp_boost_card_10')+n('exp_boost_card_25'),random.find(r=>r.pool[0].includes('_low')||r.pool[0].includes('_medium')||r.pool[0].includes('_high'))?.amount||0,n('campaign_sweep_ticket'),n('element_enlightenment_charm'),n('talisman_enhance_charm'),random.find(r=>r.pool[0].endsWith('_aptitude_fruit'))?.amount||0,n('spirit_root_reset'),m.rewards.find(r=>r.type==='random_item_bundle')?.amount||0],expected[i],'Exact VIP'+(i+1)+' gift quantities');
  for(const r of m.rewards){
    for(const id of r.pool||[r.id])assert(items.some(it=>it.id===id),'Valid item '+id);
    if(r.type==='random_item_bundle')assert.deepEqual(r.pool,talismans.filter(t=>t.quality==='mid').map(t=>'talisman_fragment_'+t.id));
    if(r.pool?.[0].endsWith('_aptitude_fruit'))assert(r.pool.every(id=>/^(metal|water|wood|fire|earth)_aptitude_fruit$/.test(id)));
  }
}
for(let level=0;level<=12;level++){
  const source=[{type:'resource',id:'gold',amount:100},{type:'item',id:'energy_elixir',amount:3}];
  const scaled=fn('vipScaleRewardGrants')(nk,source,level);
  assert.equal(scaled[0].amount,100+10*level);assert.equal(scaled[1].amount,Math.floor(3*(1+level*.1)+1e-9));
  assert.equal(source[0].amount,100,'Never mutate or compound the base');
}
vm.runInContext('Math.random=()=>0.37',box);
const vip={configured:true,level:12};
fail=true;assert.throws(()=>fn('vipEnsureMilestoneMails')(nk,userId,vip),/INJECTED_FAILURE/);
assert.equal([...db.values()].filter(r=>r.collection==='player_mail').length,0,'Failed delivery leaves no marker/mail');
assert.equal(fn('vipEnsureMilestoneMails')(nk,userId,vip).length,12);
const mails=[...db.values()].filter(r=>r.collection==='player_mail');assert.equal(mails.length,12);
const before=JSON.stringify(mails);
vm.runInContext('Math.random=()=>{throw Error("REROLL_FORBIDDEN")}',box);
fn('vipEnsureMilestoneMails')(nk,userId,vip);
assert.equal(JSON.stringify([...db.values()].filter(r=>r.collection==='player_mail')),before,'Replay never rerolls');
for(const level of [10,11,12]){
  const mail=read('player_mail',fn('mailId')(nk,'vip_milestone:'+level));
  const fragments=mail.value.attachments.filter(r=>r.id.startsWith('talisman_fragment_'));
  assert.equal(fragments.length,1,'Whole fragment bundle has one type');assert.equal(fragments[0].amount,expected[level-1][10]);
}
const id=fn('mailId')(nk,'vip_milestone:1');
assert(fn('mailClaimOne')(nk,userId,id).success);
const inventory=JSON.stringify(read('player_inventory','items').value);
assert(fn('mailClaimOne')(nk,userId,id).already_claimed);
assert.equal(JSON.stringify(read('player_inventory','items').value),inventory,'No duplicate attachment grants');
db.delete(key({userId,collection:'player_mail',key:'s001:g1:'+id}));
fn('vipEnsureMilestoneMails')(nk,userId,vip);
assert(!read('player_mail',id),'Purged mail is not recreated when its immutable marker remains');
vm.runInContext('Math.random=()=>0.2',box);
const other=fn('characterRuntime')(base,{...context,serverId:'s002'});
fn('vipEnsureMilestoneMails')(other,userId,{configured:true,level:1});
assert(other.storageRead([{collection:'player_mail',key:id,userId}]).length,'Another server has its own once-only gift');

// Actual status/claim paths use ledger VIP2, ignoring forged profile/request VIP12.
const now=Date.now();
const campaign={event_id:'vip_bounty',active:true,title:'Bounty',starts_at:new Date(now-3600000).toISOString(),ends_at:new Date(now+3600000).toISOString(),requirements:{level:1,vip:0},quests:[{quest_id:'level',type:'user_level_reached',target:1,rewards:{normal:[{type:'resource',id:'gold',amount:100}],vip:{required_vip:1,grants:[{type:'resource',id:'gold',amount:200}]}}}]};
const checkin={campaign_id:'vip_checkin',start_mode:'account_created',duration_days:2,catchup_gem_cost:10,days:[{day:1,grants:[{type:'resource',id:'gold',amount:100}]}]};
box.readContentConfig=(_nk,id)=>id==='events'?{events:[campaign]}:id==='daily_checkin'?checkin:null;
const ctx={userId,env:{APP_ENVIRONMENT:'develop'}},logger={};
const list=JSON.parse(fn('eventList')(ctx,logger,nk,'{}'));
assert(list.success,JSON.stringify(list));
const event=list.active_events[0];assert.equal(event.quests[0].rewards.normal[0].amount,120);assert.equal(event.quests[0].rewards.vip.grants[0].amount,240);
const claim=JSON.parse(fn('eventClaim')(ctx,logger,nk,JSON.stringify({event_id:campaign.event_id,occurrence_id:event.occurrence_id,quest_id:'level',track:'normal',vip:12})));
assert(claim.success,JSON.stringify(claim));assert.equal(claim.grants[0].amount,240);assert.equal(claim.track,"vip");
assert(!JSON.parse(fn('eventClaim')(ctx,logger,nk,JSON.stringify({event_id:campaign.event_id,occurrence_id:event.occurrence_id,quest_id:'level',track:'normal'}))).success);

// A quest is a single entitlement, including legacy track markers and VIP upgrades.
const request=(id,track='normal')=>JSON.stringify({event_id:campaign.event_id,occurrence_id:event.occurrence_id,quest_id:id,track});
const settle=(id,track='normal')=>JSON.parse(fn('eventClaim')(ctx,logger,nk,request(id,track)));
const addQuest=id=>campaign.quests.push({...copy(campaign.quests[0]),quest_id:id});
const balance=()=>read('player_profiles','main').value.resources.gold;
const questView=id=>JSON.parse(fn('eventList')(ctx,logger,nk,'{}')).active_events[0].quests.find(q=>q.quest_id===id);
assert.equal(questView('level').reward_track,'vip');
assert(questView('level').claimed.normal && questView('level').claimed.vip);
let beforeBounty=balance();
assert(!settle('level','vip').success,'Normal request settled VIP must block later VIP request');
assert.equal(balance(),beforeBounty);
for(const legacyTrack of ['normal','vip']){
  const id='legacy_'+legacyTrack;addQuest(id);
  const stored=fn('eventReadState')(nk,userId,campaign,fn('eventOccurrence')(campaign,Date.now()));
  stored.state.claimed[id]={[legacyTrack]:true};
  nk.storageWrite([{collection:'player_event_progress',key:stored.key,userId,value:stored.state,version:stored.object.version}]);
  for(const track of ['normal','vip'])assert(!settle(id,track).success,'Legacy '+legacyTrack+' blocks '+track);
  assert(questView(id).claimed.normal && questView(id).claimed.vip);
}
addQuest('free');vipExp=0;
assert(!settle('free','vip').success,'Non-VIP cannot force VIP payout');
const free=settle('free');assert(free.success);assert.equal(free.track,'normal');assert.equal(free.grants[0].amount,100);
vipExp=1000;
assert(!settle('free','vip').success,'VIP upgrade never unlocks a second grant');
addQuest('vip_first');const vipFirst=settle('vip_first','vip');assert(vipFirst.success);assert.equal(vipFirst.grants[0].amount,240);
assert(!settle('vip_first','normal').success,'VIP first blocks normal');
addQuest('no_vip');campaign.quests[campaign.quests.length-1].rewards.vip.grants=[];
assert.equal(settle('no_vip').grants[0].amount,120,'No VIP variant uses normal value with the existing bonus');
addQuest('injected_failure');beforeBounty=balance();fail=true;
assert.throws(()=>settle('injected_failure'),/INJECTED_FAILURE/);
assert.equal(balance(),beforeBounty);assert(!questView('injected_failure').claimed.normal);
assert(settle('injected_failure').success,'Failed atomic write may retry once');
addQuest('concurrent');beforeBounty=balance();
const originalWrite=nk.storageWrite;let racing=true;
nk.storageWrite=writes=>{
  if(racing && writes.some(w=>w.collection==='player_event_progress')){
    racing=false;assert(settle('concurrent','vip').success);
  }
  return originalWrite(writes);
};
assert.throws(()=>settle('concurrent','normal'),/CAS_CONFLICT/);
nk.storageWrite=originalWrite;
assert.equal(balance()-beforeBounty,240,'Competing normal/VIP requests grant exactly once');
assert(!settle('concurrent').success);
console.log('PASS bounty single claim: server-selected value, both request orders, legacy markers, VIP upgrade, fallback, rollback and concurrent CAS');
const status=JSON.parse(fn('dailyCheckinStatus')(ctx,logger,nk,'{}'));assert(status.success,JSON.stringify(status));assert.equal(status.days[0].grants[0].amount,120);
const checkClaim=JSON.parse(fn('dailyCheckinClaim')(ctx,logger,nk,JSON.stringify({campaign_id:'vip_checkin',day:1,vip:12})));
assert(checkClaim.success,JSON.stringify(checkClaim));assert.equal(checkClaim.grants[0].amount,120);assert.equal(checkClaim.state.days[0].grants[0].amount,120,'Preview never compounds after claim');
assert(!JSON.parse(fn('dailyCheckinClaim')(ctx,logger,nk,JSON.stringify({campaign_id:'vip_checkin',day:1}))).success);
checkin.campaign_id='vip_catchup';checkin.start_mode='fixed';checkin.starts_at=new Date(Date.now()-86400000).toISOString();checkin.duration_days=3;
const gemsBefore=read('player_profiles','main').value.resources.gems;
const caught=JSON.parse(fn('dailyCheckinClaim')(ctx,logger,nk,JSON.stringify({campaign_id:'vip_catchup',day:1})));
assert(caught.success,JSON.stringify(caught));assert.equal(caught.grants[0].amount,120);assert.equal(caught.gem_cost,10,'VIP does not increase catch-up price');
assert.equal(read('player_profiles','main').value.resources.gems,gemsBefore-10);
const fixedNow = Date.parse('2026-10-29T12:00:00+07:00');
const realCheckinConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'daily_checkin.json'), 'utf8'));
assert.equal(realCheckinConfig.duration_days, 30);
assert.equal(realCheckinConfig.days.length, 30);
const dayMs = 86400000;
const m1Sel = fn('checkinSelectCampaign')(realCheckinConfig, fixedNow, fixedNow - 5 * dayMs, fixedNow - 10 * dayMs);
assert.equal(m1Sel.campaign.campaign_id, 'server_month_1_v1');
assert.equal(m1Sel.window.open_day, 11);
const m2Sel = fn('checkinSelectCampaign')(realCheckinConfig, fixedNow, fixedNow - 5 * dayMs, fixedNow - 35 * dayMs);
assert.equal(m2Sel.campaign.campaign_id, 'server_month_2_v1');
assert.equal(m2Sel.window.open_day, 6);
const m3Sel = fn('checkinSelectCampaign')(realCheckinConfig, fixedNow, fixedNow - 5 * dayMs, fixedNow - 65 * dayMs);
assert.equal(m3Sel.campaign.campaign_id, 'server_month_3_v1');
assert.equal(m3Sel.window.open_day, 6);
console.log('PASS C224: exact12 gifts, five-element pools, one-type medium fragments, VIP0–12 base scaling, authoritative bounty/check-in preview+claim, replay, atomic mail failure, frozen randomness, purge ledger, server isolation and claim-once');

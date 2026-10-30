// C147 fault injection: actual mailbox functions with atomic versioned Storage semantics.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
let now=1000000,fail=false,advance=false,notifications=0;
class Clock extends Date{static now(){return now;}}
const c=vm.createContext({Date:Clock});
for(const file of ['character_repository','monetization_rpc','mailbox'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',file+'.js'),'utf8'),c);
const fn=n=>vm.runInContext(n,c),copy=v=>JSON.parse(JSON.stringify(v)),store=new Map();
const key=r=>r.userId+'/'+r.collection+'/'+r.key;
let serial=0;
const base={sqlQuery(sql,args){
 if(sql.includes('sha256'))return[{hash:crypto.createHash('sha256').update(args[0]).digest('hex')}];
 if(sql.includes('FROM game_arcs'))return[{display_name:'Arc Test'}];
 if(sql.includes('FROM game_items'))return args[0]==='ticket'?[{id:'ticket',stackable:true,max_stack:999}]:[];
 if(sql.includes('FROM game_heroes'))return args[0]==='hero_5'?[{id:'hero_5'}]:[];if(sql.includes("FROM storage WHERE collection='player_mail'")&&sql.includes('ORDER BY key LIMIT 26'))return[...store.values()].filter(r=>r.collection==='player_mail'&&r.userId===args[0]&&r.key.startsWith(args[1])&&r.key>args[3]&&!r.value.deleted_at_ms&&(r.value.purge_at_ms===null||r.value.purge_at_ms>args[2])).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,26).map(r=>({key:r.key.slice(args[1].length),value:copy(r.value)}));
 throw Error('Unexpected SQL '+sql);
},storageRead(refs){return refs.map(r=>store.get(key(r))).filter(Boolean).map(copy);},
 storageWrite(writes){
  for(const w of writes){const old=store.get(key(w));if(w.version==='*'?old:(!old||w.version!==old.version))throw Error('version conflict');}
  if(fail){fail=false;throw Error('injected pre-commit failure');}
  return writes.map(w=>{const row={...copy(w),version:'v'+(++serial)};store.set(key(row),row);return copy(row);});
},notificationSend(){notifications++;throw Error('offline socket');}};
c.getRemoteConfigValue=()=>({warning_hours:24,retention_days:7});
c.parseJsonObject=v=>typeof v==='string'?JSON.parse(v):v;
c.weeklyClaimKey=(p,b)=>p+'_'+b;
c.progressionApplyUser=(_nk,p,amount)=>{p.exp=(p.exp||0)+amount;};c.progressionReconcileLevelUnlocks=()=>{};
const scope={accountId:'buyer',serverId:'s001',generation:1},nk=fn('characterRuntime')(base,scope),userId='buyer';
const seed=(collection,key,value)=>nk.storageWrite([{collection,key,userId,value,version:'*'}]);
seed('player_profiles','main',{resources:{gold:0,gems:0},exp:0});seed('player_inventory','items',{items:[]});seed('player_heroes','states',{heroes:[{hero_id:'hero_5',owned:false,level:1,exp:0,next_level_exp:1000,current_attribute:{}}]});
const input={source_id:'gift:1',title:'Gift',body:'Test',attachments:[{type:'resource',id:'gold',amount:7},{type:'item',id:'ticket',amount:2},{type:'exp',id:'user',amount:3}]};
const deliver=overrides=>fn('deliverMail')(nk,userId,{...input,...overrides});
const claim=id=>fn('mailClaimOne')(nk,userId,id),read=(collection,key)=>nk.storageRead([{collection,key,userId}])[0];
const id=deliver({}).id;assert.equal(deliver({}).idempotent,true);assert.equal(notifications,1);
fail=true;assert.equal(claim(id).code,'DATA_CHANGED');assert.equal(read('player_profiles','main').value.resources.gold,0);assert.equal(read('player_inventory','items').value.items.length,0);assert.equal(read('player_mail',id).value.claimed_at_ms,null);
assert.equal(claim(id).success,true);assert.equal(read('player_profiles','main').value.resources.gold,7);assert.equal(read('player_profiles','main').value.exp,3);assert.equal(read('player_inventory','items').value.items[0].quantity,2);assert.equal(read('player_mail',id).value.read_at_ms,read('player_mail',id).value.claimed_at_ms);
assert.equal(claim(id).already_claimed,true);assert.equal(read('player_profiles','main').value.resources.gold,7);
const purchase=fn('applyPurchaseMailRewards')(nk,userId,'purchase-hero-mail','first_topup_pack','non_consumable',[{reward_type:'hero',reward_id:'hero_5',quantity:1}]);
assert(purchase.mail&&purchase.mail.id,'paid hero must be sent through purchase mail');
assert.equal(read('player_heroes','states').value.heroes[0].owned,false,'hero must remain locked before the mail claim');
assert.equal(claim(purchase.mail.id).success,true);
assert.equal(read('player_heroes','states').value.heroes[0].owned,true,'mail claim must grant the purchased hero');
const expired=deliver({source_id:'expired',expires_at_ms:now}).id;assert.equal(claim(expired).code,'MAIL_EXPIRED');assert.equal(fn('mailMutateOne')(nk,userId,expired,'delete').code,'UNCLAIMED_REWARD');assert.equal(fn('mailPresent')(nk,read('player_mail',expired).value,now).can_delete,false);
const boundary=deliver({source_id:'boundary',expires_at_ms:now+1}).id;
const originalAdd=fn('addStoreInventoryItem');c.addStoreInventoryItem=(...args)=>{originalAdd(...args);if(advance)now+=1;};advance=true;
assert.equal(claim(boundary).code,'MAIL_EXPIRED','expiry must be checked again after preparing grants');advance=false;assert.equal(read('player_profiles','main').value.resources.gold,7);
const infinite=deliver({source_id:'infinite'}).id;assert.equal(read('player_mail',infinite).value.purge_at_ms,null);
const foreign=fn('characterRuntime')(base,{...scope,serverId:'s002'});assert.equal(fn('mailClaimOne')(foreign,userId,id).code,'MAIL_NOT_FOUND');
const weekly=deliver({source_id:'weekly:1:combat_power',weekly:{period_id:'1',board_id:'combat_power'}}).id;
seed('weekly_leaderboard_claims','1_combat_power',{rewards:[]});assert.equal(claim(weekly).already_claimed,true);assert.equal(read('player_profiles','main').value.resources.gold,7);
assert.equal(fn('mailMutateOne')(nk,userId,infinite,'delete').code,'UNCLAIMED_REWARD');
assert.equal(fn('mailMutateOne')(nk,userId,id,'delete').success,true);const bulkId=deliver({source_id:'bulk_claim_delete',attachments:[{type:'resource',id:'gold',amount:1}]}).id;assert(fn('mailBulk')(nk,userId,{},'claim').results.some(r=>r.id===bulkId&&r.success));assert.equal(read('player_mail',bulkId).value.read_at_ms,read('player_mail',bulkId).value.claimed_at_ms);assert(fn('mailBulk')(nk,userId,{},'delete').results.some(r=>r.id===bulkId&&r.success));assert(read('player_mail',bulkId).value.deleted_at_ms!==null);
base.storageDelete=refs=>refs.forEach(r=>store.delete(key(r)));
nk.storageDelete([{collection:'player_mail',key:id,userId,version:read('player_mail',id).version}]);
assert.equal(deliver({}).idempotent,true,'purging mail does not purge delivery identity');
assert.throws(()=>deliver({source_id:'bad',attachments:[{type:'item',id:'unknown',amount:1}]}),/INVALID_ITEM/);
seed('player_stage_runs','active',{run_id:'run1',status:'active'});
const combat=fn('mailCombatRuntime')(nk,userId),run=read('player_stage_runs','active');
const settlement={collection:'player_stage_runs',key:'active',userId,value:{...run.value,status:'settled',won:true,stage_id:'stage_1_1',stage_reward:{base_exp:5}},version:run.version};
fail=true;assert.throws(()=>combat.storageWrite([settlement]),/pre-commit/);assert.equal(read('player_stage_runs','active').value.status,'active');
const battleId=fn('mailId')(nk,'battle:run1');assert(!read('player_mail',battleId),'ordinary stage must not create mail');
combat.storageWrite([settlement]);assert(!read('player_mail',battleId),'settled stage must not create battle report');
const pBefore=read('player_profiles','main');
const unlock={collection:'player_profiles',key:'main',userId,value:{...pBefore.value,unlocked_arcs:['arc_0','arc_2']},version:pBefore.version};
const arcId=fn('mailId')(nk,'arc_opened:arc_2');
fail=true;assert.throws(()=>combat.storageWrite([unlock]),/pre-commit/);assert(!read('player_mail',arcId),'failed unlock must not leak mail');
combat.storageWrite([unlock]);assert.equal(read('player_mail',arcId).value.source_type,'arc_opened');assert.equal(read('player_mail',arcId).value.attachments.length,0);
const mailCount=[...store.values()].filter(r=>r.collection==='player_mail').length;
const pAgain=read('player_profiles','main');combat.storageWrite([{...pAgain,value:{...pAgain.value,exp:99}}]);
assert.equal([...store.values()].filter(r=>r.collection==='player_mail').length,mailCount,'replaying progression with same arcs cannot send another notice');
// C173 mixed packs: one-time purchase mail + immutable daily entitlement
// must commit together, and retry must not extend or duplicate either side.
const packCatalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/packs.json'),'utf8')).packs_by_tab.daily;
const itemCatalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/items.json'),'utf8'));
const oldQuery=base.sqlQuery;
base.sqlQuery=(sql,args)=>sql.includes('FROM game_items')&&args[0]!=='ticket'
 ? itemCatalog.filter(i=>i.id===args[0]) : oldQuery(sql,args);
for(const product of packCatalog){
 const before=new Map([...store].map(([k,v])=>[k,copy(v)]));
 const grantId='mixed-'+product.id;
 fail=true;
 assert.throws(()=>fn('applyPurchaseMailRewards')(nk,userId,grantId,product.id,'consumable',product.rewards),/pre-commit/);
 assert.deepEqual(store,before,'failed transaction cannot activate daily pack or leak bonus mail');
 const granted=fn('applyPurchaseMailRewards')(nk,userId,grantId,product.id,'consumable',product.rewards);
 assert(!granted.mail,'New daily-only bundles must not issue an extra instant bonus mail');
 const entitlement=read('player_profiles','main').value.daily_packs[product.id];
 assert(entitlement.rewards.every(r=>product.rewards.some(p=>p.metadata?.daily_pack_days===30&&p.reward_id===r.reward_id&&p.quantity===r.quantity)));
 assert.equal(entitlement.rewards.length,product.id==='daily_deal'?4:7,'All requested reward lines enter the daily entitlement');
 const activated=new Map([...store].map(([k,v])=>[k,copy(v)]));
 assert(fn('applyPurchaseMailRewards')(nk,userId,grantId,product.id,'consumable',product.rewards).idempotent);
 assert.deepEqual(store,activated,'purchase replay cannot duplicate mail or change expiry');

}
console.log('PASS C147/C173: atomic claims, expiry, scoped ownership, daily-only activation rollback, immutable daily snapshots and durable replay suppression');

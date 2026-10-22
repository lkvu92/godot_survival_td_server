const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..'), DAY = 86400000;
const packs = JSON.parse(fs.readFileSync(path.join(root, 'data/packs.json'), 'utf8')).packs_by_tab.daily;
const items = JSON.parse(fs.readFileSync(path.join(root, 'data/items.json'), 'utf8'));
let now = 1800000123456, conflict = false;
class ServerDate extends Date { static now() { return now; } }
const ctx = vm.createContext({Date: ServerDate});
vm.runInContext(fs.readFileSync(path.join(root, 'nakama/data/modules/build/monetization_rpc.js'), 'utf8'), ctx);
const grant = vm.runInContext('applyPurchaseStorageRewards', ctx);
const claim = vm.runInContext('claimDailyPack', ctx);
const status = vm.runInContext('getDailyPackStatus', ctx);
const order = vm.runInContext('createPurchaseOrder', ctx);
ctx.isRemoteFlagEnabled = () => true;
const clone = x => JSON.parse(JSON.stringify(x));
let db;
function reset() { db = {player_profiles:{value:{resources:{gold:0,gems:0},stamina:30},version:'1'}, player_inventory:{value:{items:[]},version:'1'}}; }
const nk = {
  storageRead(reads) { return reads.filter(r => db[r.collection]).map(r => ({...clone(db[r.collection]),collection:r.collection,key:r.key})); },
  storageWrite(writes) {
    if (conflict) throw Error('CAS conflict');
    for (const w of writes) assert.equal(w.version, db[w.collection].version);
    for (const w of writes) db[w.collection] = {value:clone(w.value),version:String(Number(w.version)+1)};
  },
  sqlQuery(sql, [id]) {
    if (sql.includes('game_store_platform_products')) return [];
    if (sql.includes('game_store_products')) return [{product_id:id,active:true}];
    const item = items.find(i => i.id === id); assert(item, 'Unknown test reward: '+id); return [item];
  }
};
const user = {userId:'buyer'};
const invoke = (fn, payload={}) => JSON.parse(fn(user, {}, nk, JSON.stringify(payload)));
const readStatus = id => invoke(status).data.packs[id];
reset();
assert.equal(invoke(claim,{product_id:'flash_sale'}).code,409);
assert.equal(JSON.parse(claim({}, {}, nk, '{}')).code,401);
assert.equal(invoke(claim,{product_id:'unknown'}).code,400);
for (const invalid of ['null','[]','{']) assert.equal(JSON.parse(claim(user,{},nk,invalid)).code,400);
for (const pack of packs) {
  reset(); const start = now;
  assert.equal(pack.duration_days,30);
  assert(pack.rewards.some(r => r.metadata.daily_pack_days === 30));
  grant(nk,'buyer','receipt-1',pack.id,'consumable',pack.rewards);
  assert.equal(db.player_profiles.value.resources.gems,0,'Purchase activates only; daily claim grants rewards');
  const activation = clone(db);
  grant(nk,'buyer','receipt-1',pack.id,'consumable',pack.rewards);
  assert.deepEqual(db,activation,'Receipt retry must not extend entitlement');
  assert(readStatus(pack.id).claimable);
  assert.equal(readStatus(pack.id).expires_at,Math.floor((start+30*DAY)/1000));
  assert.throws(()=>grant(nk,'buyer','receipt-2',pack.id,'consumable',pack.rewards),/already active/);
  assert.equal(invoke(order,{product_id:pack.id}).code,409,'Block active repurchase before Billing');
  conflict=true;
  assert.equal(invoke(claim,{product_id:pack.id}).code,409);
  assert.deepEqual(db,activation,'CAS failure must not partially grant profile/inventory');
  conflict=false;
  for (let day=0;day<30;day++) {
    now=start+day*DAY;
    const result=invoke(claim,{product_id:pack.id}); assert.equal(result.status,'success'); assert(!result.idempotent);
    assert(!readStatus(pack.id).claimable);
    const after=clone(db);
    assert(invoke(claim,{product_id:pack.id}).idempotent);
    assert.deepEqual(db,after,'Same-day replay must not issue rewards twice');
    now=start+(day+1)*DAY-1;
    assert(!readStatus(pack.id).claimable,'No early claim at next-day boundary');
  }
  assert.equal(db.player_profiles.value.resources.gems, pack.id==='daily_deal'?300:900);
  assert.equal(db.player_inventory.value.items.find(i=>i.item_id==='campaign_sweep_ticket').quantity,pack.id==='daily_deal'?5:30,'One-time tickets and daily tickets remain separate');
  assert.equal(db.player_profiles.value.stamina,30+(pack.id==='daily_deal'?150:300),'Full stamina reward, no cap loss');
  if (pack.id==='daily_deal') assert.equal(db.player_profiles.value.resources.gold,75000);
  else {
    assert.equal(db.player_profiles.value.resources.gold,150000);
    for (const id of ['talisman_enhance_charm','element_enlightenment_charm']) assert.equal(db.player_inventory.value.items.find(i=>i.item_id===id).quantity,1);
    assert(!db.player_inventory.value.items.some(i=>i.item_id==='reset_talisman'));
  }
  now=start+30*DAY;
  assert(!readStatus(pack.id).active);
  assert.equal(invoke(claim,{product_id:pack.id}).code,409,'Expiry is exclusive');
  grant(nk,'buyer','receipt-renewal',pack.id,'consumable',pack.rewards);
  assert(readStatus(pack.id).claimable,'May repurchase after expiry');
}
reset();
for (const p of packs) grant(nk,'buyer','receipt-'+p.id,p.id,'consumable',p.rewards);
assert(readStatus('daily_deal').claimable && readStatus('flash_sale').claimable,'Both products can coexist');
now+=3*DAY;
invoke(claim,{product_id:'flash_sale'});
assert.equal(db.player_profiles.value.resources.gems,30,'Missed days are not banked');
db.player_stage_runs={value:{status:'active',expires_at_ms:now+DAY},version:'1'};
assert.equal(invoke(claim,{product_id:'daily_deal'}).code,409,'Do not mutate rewards during combat');
reset();
ctx.parseJsonb = x => typeof x === 'string' ? JSON.parse(x) : x;
ctx.vipConfig = () => ({product_exp:{daily_deal:100}});
ctx.monetizationMode = () => 'mock';
let insertedOrder;
const purchaseNk = {...nk, uuidv4:()=> 'monthly-order',
  sqlQuery(sql) {
    if (sql.includes('game_store_platform_products')) return [];
    if (sql.includes('game_store_products')) return [{...packs[0], ui:packs[0]}];
    if (sql.includes('FROM monetization_purchase_orders')) return [{id:'old-paid-or-unpaid-order',status:'pending',reward_snapshot:[{reward_type:'currency',reward_id:'gems',quantity:100}]}];
    if (sql.includes('game_store_product_rewards')) return packs[0].rewards;
    throw Error('Unexpected purchase query '+sql);
  },
  sqlExec(sql,args) { assert(sql.includes('INSERT INTO monetization_purchase_orders')); insertedOrder=args; }
};
const newOrder=JSON.parse(order(user,{},purchaseNk,JSON.stringify({product_id:'daily_deal'})));
assert.equal(newOrder.data.purchase_order_id,'monthly-order','Do not launch new monthly purchase against old one-time snapshot');
assert(JSON.parse(insertedOrder[3]).some(r=>r.metadata.daily_pack_days===30));
assert(JSON.parse(insertedOrder[3]).every(r=>r.metadata.pricing_version===250001));
// Old recurring orders also must not be reused for today's lower daily rewards.
const originalQuery=purchaseNk.sqlQuery;
purchaseNk.sqlQuery=(sql,args)=>sql.includes('FROM monetization_purchase_orders')
 ? [{id:'old-monthly',status:'pending',reward_snapshot:[{reward_type:'currency',reward_id:'gems',quantity:100,metadata:{daily_pack_days:30}}]}]
 : originalQuery(sql,args);
assert.equal(JSON.parse(order(user,{},purchaseNk,JSON.stringify({product_id:'daily_deal'}))).data.purchase_order_id,'monthly-order');
purchaseNk.sqlQuery=(sql,args)=>sql.includes('FROM monetization_purchase_orders')
 ? [{id:'current-monthly',status:'pending',reward_snapshot:packs[0].rewards}]
 : originalQuery(sql,args);
assert.equal(JSON.parse(order(user,{},purchaseNk,JSON.stringify({product_id:'daily_deal'}))).data.purchase_order_id,'current-monthly');
// Purchased legacy 30-day snapshots keep their original rewards across catalog changes.
reset();
grant(nk,'buyer','old-recurring','daily_deal','consumable',[
 {reward_type:'currency',reward_id:'gems',quantity:100,metadata:{daily_pack_days:30}},
 {reward_type:'currency',reward_id:'gold',quantity:10000,metadata:{daily_pack_days:30}},
 {reward_type:'stamina',reward_id:'stamina',quantity:20,metadata:{daily_pack_days:30}},
 {reward_type:'item',reward_id:'campaign_sweep_ticket',quantity:5,metadata:{daily_pack_days:30}}]);
const oldStart=now;
for(let day=0;day<30;day++){now=oldStart+day*DAY;assert.equal(invoke(claim,{product_id:'daily_deal'}).status,'success');}
assert.equal(db.player_profiles.value.resources.gems,3000);
assert.equal(db.player_profiles.value.resources.gold,300000);
assert.equal(readStatus('daily_deal').rewards.find(r=>r.reward_id==='gems').quantity,100,'Status exposes old purchased rewards for UI');
assert.equal(db.player_profiles.value.stamina,630);
assert.equal(db.player_inventory.value.items.find(i=>i.item_id==='campaign_sweep_ticket').quantity,150);
const patch = require('../nakama/build_daily_pack_patch.cjs').sql;
assert(patch.includes('BEGIN;') && patch.includes('COMMIT;'));
assert(!/UPDATE (player_|monetization_purchase_orders)/.test(patch),'Patch must not rewrite players or old orders');
console.log('PASS 30-day packs: activation/receipt replay, 30 claims, exact boundaries, expiry/renewal, no catch-up, coexistence, active-purchase guard, CAS, full stamina, new/legacy order snapshots and catalog patch');

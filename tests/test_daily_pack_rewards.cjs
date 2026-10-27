const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
// Keep legacy purchased order snapshots explicit: today's catalog must not
// silently change what a player already paid for.
const packs = [
 {id:'daily_deal',fulfillment_type:'consumable',rewards:[
  {reward_type:'currency',reward_id:'gems',quantity:100},
  {reward_type:'currency',reward_id:'gold',quantity:10000},
  {reward_type:'stamina',reward_id:'stamina',quantity:20},
  {reward_type:'item',reward_id:'campaign_sweep_ticket',quantity:5}]},
 {id:'flash_sale',fulfillment_type:'consumable',rewards:[
  {reward_type:'currency',reward_id:'gems',quantity:300},
  {reward_type:'item',reward_id:'talisman_enhance_charm',quantity:1},
  {reward_type:'item',reward_id:'element_enlightenment_charm',quantity:1},
  {reward_type:'stamina',reward_id:'stamina',quantity:50},
  {reward_type:'item',reward_id:'campaign_sweep_ticket',quantity:15}]}
];
const items = JSON.parse(fs.readFileSync(path.join(root, 'data/items.json'), 'utf8'));
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'nakama/data/modules/build/resource_rpc.js'), 'utf8'), context);
context.getRemoteConfigValue = (_nk, _section, _key, fallback) => fallback;
vm.runInContext(fs.readFileSync(path.join(root, 'nakama/data/modules/build/monetization_rpc.js'), 'utf8'), context);
const grant = vm.runInContext('applyPurchaseStorageRewards', context);
const clone = value => JSON.parse(JSON.stringify(value));
for (const product of packs) {
  // Legacy in-flight orders without the recurring marker remain one-time grants.
  product.rewards = product.rewards.map(({metadata, ...line}) => line);
  const db = {
    player_profiles: {value: {resources: {gems: 0, gold: 0}, stamina: 0}, version: '1'},
    player_inventory: {value: {items: []}, version: '1'}
  };
  const nk = {
    storageRead(reads) { return reads.map(r => ({...clone(db[r.collection]), collection: r.collection, key: r.key})); },
    storageWrite(writes) { for (const w of writes) { assert.equal(w.version, db[w.collection].version); db[w.collection] = {value: clone(w.value), version: String(Number(w.version) + 1)}; } },
    sqlQuery(_sql, [id]) { const item = items.find(i => i.id === id); assert(item, 'Reward item must exist: ' + id); return [item]; }
  };
  grant(nk, 'test-user', 'verified-purchase', product.id, product.fulfillment_type, product.rewards);
  const after = clone(db);
  grant(nk, 'test-user', 'verified-purchase', product.id, product.fulfillment_type, product.rewards);
  assert.deepEqual(db, after, 'Purchase retry must not grant twice');
  assert.equal(db.player_profiles.value.resources.gems, product.id === 'daily_deal' ? 100 : 300);
  if (product.id === 'daily_deal') {
    assert.equal(db.player_profiles.value.resources.gold, 10000);
    assert.equal(db.player_profiles.value.stamina, 20);
  } else {
    const inventory = db.player_inventory.value.items;
    assert.equal(inventory.find(i => i.item_id === 'talisman_enhance_charm').quantity, 1);
    assert.equal(inventory.find(i => i.item_id === 'element_enlightenment_charm').quantity, 1);
    assert(!inventory.some(i => i.item_id === 'reset_talisman'));
    assert.equal(db.player_profiles.value.stamina, 50, 'Purchase reward can exceed natural regeneration target within storage cap 200');
  }
  db.player_profiles.value.stamina = 195;
  grant(nk, 'test-user', 'verified-purchase-near-cap', product.id, product.fulfillment_type, product.rewards);
  assert.equal(db.player_profiles.value.stamina,200,'Legacy one-time purchases clamp at storage cap 200');
}
console.log('PASS daily-tab packs: actual storage fulfillment, both charm rewards, no reset talisman, replay idempotency; confirmed one-time rewards and stamina cap');

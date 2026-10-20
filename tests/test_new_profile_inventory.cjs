const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = vm.createContext({});
for (const name of ['progression_rpc', 'player_rpc', 'sweep_rpc']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build', `${name}.js`), 'utf8'), context);
}
const loadPlayerProfile = vm.runInContext('loadPlayerProfile', context);
const clone = value => JSON.parse(JSON.stringify(value));
context.getRemoteConfigValue = (_nk, _section, _key, fallback) => fallback;
context.ensurePlayerName = () => false;
context.buildMonetizationResponse = () => ({});
context.monetizationMode = () => 'develop';
vm.runInContext('canonicalHeroStates = () => []; cultivationEnsurePreview = () => false;', context);

let storage = {};
let revision = 0;
const storageKey = row => `${row.collection}:${row.key}`;
const nk = {
  storageRead(requests) {
    return requests.flatMap(request => storage[storageKey(request)] ? [clone(storage[storageKey(request)])] : []);
  },
  storageWrite(writes) {
    for (const write of writes) {
      const current = storage[storageKey(write)];
      assert.equal(write.version, current ? current.version : '*');
      storage[storageKey(write)] = {...clone(write), version: String(++revision)};
    }
    return writes.map(write => ({collection: write.collection, key: write.key,
      version: storage[storageKey(write)].version}));
  },
  sqlQuery(sql) {
    if (sql.includes('AS now')) return [{now: Math.floor(Date.now() / 1000)}];
    return [];
  }
};
const load = () => JSON.parse(loadPlayerProfile({userId: 'test-user', env: {}}, {}, nk, '{}'));

let result = load();
assert(result.profile && result.inventory, `new profile must load: ${JSON.stringify(result)}`);
assert.deepEqual(result.inventory.items, [], 'new account must start with empty inventory');
assert.deepEqual(storage['player_inventory:items'].value.items, [], 'server must persist empty inventory');
assert(!result.profile._starter_talisman_granted, 'new account must not receive starter grant flag');

result = load();
assert(result.profile && result.inventory, 'existing profile must load');
assert.deepEqual(result.inventory.items, [], 'empty inventory must stay empty on every load');

const owned = {item_id: 'talisman_1', instance_id: 'owned-item', category: 'talisman', quantity: 1};
storage['player_inventory:items'].value.items = [owned];
result = load();
assert.equal(result.inventory.items.length, 1, 'owned talisman must not be duplicated');
assert.equal(result.inventory.items[0].instance_id, owned.instance_id, 'owned talisman must be preserved');

storage['player_inventory:items'].value.items = [{item_id: 'talisman_fragment_1', quantity: 10}];
result = load();
assert.equal(result.inventory.items.length, 1, 'material-only inventory must not gain a talisman');
assert.equal(result.inventory.items[0].item_id, 'talisman_fragment_1');

console.log('PASS new/existing profile inventory: no automatic talisman grant, existing items preserved');

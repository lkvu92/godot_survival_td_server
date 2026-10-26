const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const effects = JSON.parse(fs.readFileSync(path.join(root, 'data/effects.json'), 'utf8'));
const context = vm.createContext({});
for (const file of ['config_tables', 'config_rpc', 'seed'])
  vm.runInContext(fs.readFileSync(path.join(root, 'nakama/data/modules/build', file + '.js'), 'utf8'), context);
let sql = '';
const seed = vm.runInContext('seedGameData', context);
const result = JSON.parse(seed({env: {}}, {info() {}, error() {}}, {sqlExec: statement => { sql += statement; }}, JSON.stringify({table: 'effects', rows: effects})));
assert(result.success && result.inserted === 40, 'Existing seed RPC accepts presentation metadata for every effect');
let supplemental = 0;
for (const effect of effects) {
  const {id, display_name, description, default_props, ...metadata} = effect;
  const row = context.processEffect({id, display_name, description: description || '', default_props: JSON.stringify(default_props || {}), metadata: JSON.stringify(metadata)});
  assert.equal(row.icon_effect_id, effect.icon_effect_id, 'Gameplay aliases survive metadata transport unchanged');
  assert.equal(row.ui_icon_id, effect.ui_icon_id, 'UI identity survives metadata transport independently');
  assert.equal(row.metadata, undefined, 'Metadata is flattened for remote clients');
  if (effect.ui_icon_id) {
    supplemental++;
    assert.equal(effect.ui_icon_id, id, 'Supplemental effects retain their own UI identity');
    assert.equal(effect.icon_frame, undefined, 'Supplemental effects cannot advertise a conflicting original frame');
    assert(sql.includes('"ui_icon_id":"' + id + '"'), 'Seed SQL persists UI metadata: ' + id);
  }
}
assert.equal(supplemental, 20);
console.log('PASS status icon metadata: 40-effect seed/remote serialization, 20 supplemental identities and unchanged gameplay aliases');

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const playerRuntime = fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/player_rpc.js'), 'utf8');
const mainRuntime = fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/main.js'), 'utf8');
const resourceRuntime = fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/resource_rpc.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(playerRuntime, context);
const check = vm.runInContext('adminTestAccess', context);
let writes = 0;
const nk = {
  sqlQuery(sql, args) {
    assert(sql.includes('FROM users') && sql.includes('LOWER(email)'));
    assert.deepEqual(args.slice(1), ['lkvu92@gmail.com','lkvu921@gmail.com']);
    assert(sql.includes('LOWER($3)'));
    const emails={'admin-user-id':'lkvu92@gmail.com','second-admin':'LKVU921@GMAIL.COM','other-user-id':'other@gmail.com','disabled-admin':'lkvu921@gmail.com'};
    return args[0] !== 'disabled-admin' && args.slice(1).includes((emails[args[0]]||'').toLowerCase()) ? [{'?column?':1}] : [];
  },
  storageWrite() { writes++; throw Error('admin access must be read-only'); }
};
assert.equal(JSON.parse(check({userId: 'admin-user-id'}, {}, nk, '{}')).allowed, true);
assert.equal(JSON.parse(check({userId: 'other-user-id'}, {}, nk, '{}')).allowed, false);
assert.equal(JSON.parse(check({userId: ''}, {}, nk, '{}')).allowed, false);
assert.equal(JSON.parse(check({userId:'second-admin'}, {}, nk, '{}')).allowed,true);
assert.equal(JSON.parse(check({userId:'disabled-admin'}, {}, nk, '{}')).allowed,false);
assert.equal(JSON.parse(check({userId:'other-user-id'}, {}, nk, JSON.stringify({email:'lkvu921@gmail.com'}))).allowed,false);
assert(resourceRuntime.includes('lkvu921@gmail.com'));
assert.equal(writes, 0);
assert(mainRuntime.includes('registerRpc("admin_test_access", linkedRpc_admin_test_access)'));
assert(resourceRuntime.includes('stageId === "stage_0_admin_test"'));
const arcs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/arcs.json'), 'utf8'));
const stages = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stages.json'), 'utf8'));
const levels = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stage_levels.json'), 'utf8'));
assert(arcs.find(arc => arc.id === 'arc_0').stage_ids.includes('stage_0_admin_test'));
const stage = stages.find(entry => entry.id === 'stage_0_admin_test');
assert(stage && stage.arc_id === 'arc_0' && stage.waves.length === 1);
assert.deepEqual(stage.waves[0].entries, []);
const level = levels.find(entry => entry.stage_id === stage.id);
assert(level && level.gold_reward === 0 && level.exp_multiplier === 0 && level.stamina_cost === 0);
assert.deepEqual(level.loot_table, []);
assert.deepEqual(level.boss_loot_table, []);
console.log('PASS admin test stage: server identity gate, no writes/rewards, normal-run block and Arc 0 catalog');

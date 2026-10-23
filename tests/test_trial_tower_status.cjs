const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const clone = x => JSON.parse(JSON.stringify(x));
let now = Date.parse('2026-10-22T16:59:00Z');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/trial_tower.json')));
let activeConfig = config, db = {}, revision = 0, race = null;
const sandbox = vm.createContext({Date: class extends Date { static now() { return now; } },
    readContentConfig: () => activeConfig});
for (const module of ['server_context', 'character_repository', 'progression_rpc', 'sweep_rpc'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/' + module + '.js'), 'utf8'), sandbox);
const fn = name => vm.runInContext(name, sandbox);
const identity = ref => [ref.userId, ref.collection, ref.key].join('/');
const nk = {
    storageRead(refs) { return refs.flatMap(ref => ref.collection==='player_profiles' ? [{...ref,value:{level:30},version:'fixture'}] : db[identity(ref)] ? [clone(db[identity(ref)])] : []); },
    storageWrite(writes) {
        if (race) { const callback = race; race = null; callback(); }
        for (const write of writes) {
            const old = db[identity(write)];
            assert(write.permissionRead === 0 && write.permissionWrite === 0);
            if ((write.version === '*' && old) || (write.version !== '*' && (!old || old.version !== write.version))) throw Error('CAS');
        }
        return writes.map(write => {
            const row = Object.assign(clone(write), {version: String(++revision)});
            db[identity(write)] = row;
            return row;
        });
    }
};
const scope = (serverId = 's001', generation = 1, accountId = 'a') =>
    fn('characterRuntime')(nk, {accountId, serverId, generation});
const rpc = (runtime = scope(), userId = 'a') => JSON.parse(fn('trialTowerStatus')({userId}, {warn() {}}, runtime, '{}'));
assert.equal(JSON.parse(fn('startTrialTower')({userId:'a'}, {}, nk, 'null')).code, 'INVALID_REQUEST');
assert.equal(JSON.parse(fn('finishTrialTower')({userId:'a'}, {}, nk, 'null')).code, 'INVALID_REQUEST');
assert.equal(rpc(scope(), '').code, 401);
assert.equal(Object.keys(db).length, 0);
let status = rpc();
assert(status.success);
assert.equal(status.snapshot.floors.length, 30);
for(let i=0;i<30;i++)assert.equal(status.snapshot.floors[i].stat_multiplier,Math.round((0.7+i*0.1)*10000)/10000);
for(let i=0;i<30;i++)assert.equal(status.snapshot.floors[i].speed_multiplier,Math.round((0.7+i*0.05)*10000)/10000);
assert.equal(status.snapshot.floors[1].speed_multiplier,0.75);
assert.equal(status.snapshot.floors[19].speed_multiplier,1.65);
assert.equal(status.snapshot.floors[0].stat_multiplier, 0.7);
assert.equal(status.snapshot.floors[1].stat_multiplier, 0.8);
assert.equal(status.snapshot.floors[3].stat_multiplier, 1);
assert.equal(status.snapshot.floors[19].stat_multiplier, 2.6);
assert.equal(status.snapshot.floors[29].stat_multiplier, 3.6);
assert.equal(status.snapshot.floors[29].speed_multiplier, 2.15);
assert.equal(status.snapshot.floors[0].repeat_rewards.find(r=>r.kind==='item').item_id,'law_fragment_low');
assert.equal(status.snapshot.floors[9].repeat_rewards.find(r=>r.kind==='item').item_id,'law_fragment_low');
assert.equal(status.snapshot.floors[10].repeat_rewards.find(r=>r.kind==='item').item_id,'law_fragment_medium');
assert.equal(status.snapshot.floors[19].repeat_rewards.find(r=>r.kind==='item').item_id,'law_fragment_medium');
assert.equal(status.snapshot.floors[20].repeat_rewards.find(r=>r.kind==='item').item_id,'law_fragment_high');
assert.equal(status.snapshot.floors[29].repeat_rewards.find(r=>r.kind==='item').item_id,'law_fragment_high');
assert.equal(status.snapshot.highest_cleared, 0);
assert.equal(status.snapshot.tickets, 5);
let saved = clone(db);
rpc(); assert.deepEqual(db, saved, 'Repeated reads must not grant tickets');
now += 120000; // Midnight in UTC+7, not UTC.
assert.equal(rpc().snapshot.tickets, 10);
saved = clone(db);
rpc(); assert.deepEqual(db, saved);
now += 20 * 86400000;
assert.equal(rpc().snapshot.tickets, 20);
const stored = Object.values(db)[0];
stored.value.tickets = 0; // Simulate a later authoritative spend at cap.
assert.equal(rpc().snapshot.tickets, 0, 'Overflow at cap must not be banked');
now -= 86400000;
assert.equal(rpc().snapshot.tickets, 0, 'Backward clock must not grant');
assert.equal(rpc(scope('s002')).snapshot.tickets, 5);
assert.equal(rpc(scope('s001', 2)).snapshot.tickets, 5);
assert.equal(rpc(scope('s001', 1, 'b'), 'b').snapshot.tickets, 5);
assert.equal(Object.keys(db).length, 4, 'Account/server/generation isolation');
activeConfig = {}; assert.equal(rpc().code, 503); activeConfig = config;
stored.value.highest_cleared = 31;
assert.equal(rpc().code, 503);
db = {}; now += 86400000;
race = () => { assert(rpc().success); };
assert.equal(rpc().snapshot.tickets, 5, 'CAS retry after competing first request');
assert.equal(Object.keys(db).length, 1);
now += 86400000;
race = () => { assert.equal(rpc().snapshot.tickets, 10); };
assert.equal(rpc().snapshot.tickets, 10, 'Concurrent daily grant occurs once');
const adminState = Object.values(db)[0].value;
adminState.tickets = 100;
assert.equal(rpc().code, 503, 'Ordinary balances above 20 remain invalid');
adminState.admin_test_ticket_cap = 100;
assert.equal(rpc().snapshot.tickets, 100);
assert.equal(rpc().snapshot.ticket_cap, 100);
now += 86400000;
assert.equal(rpc().snapshot.tickets, 100, 'Daily reset must not destroy an admin grant');
Object.values(db)[0].value.tickets = 99;
assert.equal(rpc().snapshot.tickets, 99, 'Reading status cannot replenish consumed test entries');
Object.values(db)[0].value.tickets = 101;
assert.equal(rpc().code, 503);
assert.equal(rpc(scope('s002')).snapshot.ticket_cap, 20, 'Test capacity is character scoped');
console.log('PASS trial tower: auth, config, UTC+7 reset, normal/admin cap, clock rollback, CAS retries and character isolation');

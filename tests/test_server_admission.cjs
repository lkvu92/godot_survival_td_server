const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const sandbox = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/server_context.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/character_repository.js'), 'utf8'), sandbox);
const fn = name => vm.runInContext(name, sandbox);
sandbox.repairMultiLinkBoards=()=>{};
const ctx = { userId: 'account-a', env: { MULTI_SERVER_ENABLED: 'true' } };
let server = { server_id: 's001', display_name: 'S1', status: 'open', generation: 1, has_opened: true };
let character = { status: 'ready', generation: 1 };
let mutations = [];
const nk = {
  sqlQuery(sql) {
    if(sql.includes('active_requests=active_requests+1'))return server&&server.status==='open'?[{server_id:server.server_id}]:[];
    if (sql.includes('WHERE server_id=$1')) return server ? [server] : [];
    if (sql.includes('SELECT status,generation FROM player_characters')) return character ? [character] : [];
    if (sql.includes('SELECT 1 FROM player_characters')) return character ? [{}] : [];
    return [];
  },
  sqlExec(sql, args) { mutations.push({ sql, args }); }
};
const enter = request => JSON.parse(fn('enterGameServer')(ctx, {}, nk, JSON.stringify(request)));
assert.equal(enter({}).reason, 'SERVER_REQUIRED');
assert.equal(enter({ server_id: 's001', generation: 0 }).reason, 'GENERATION_MISMATCH');
assert.equal(enter({ server_id: 's001', generation: '1' }).reason, 'GENERATION_MISMATCH');
server.status = 'disabled';
assert.equal(enter({ server_id: 's001', generation: 1 }).reason, 'SERVER_UNAVAILABLE');
assert.equal(mutations.length, 0, 'rejected admission cannot mutate');
server.status = 'open'; server.generation = 2;
assert.equal(enter({ server_id: 's001', generation: 1 }).reason, 'GENERATION_MISMATCH');
server.generation = 1; character = null;
assert.equal(enter({ server_id: 's001', generation: 1 }).reason, 'CHARACTER_NOT_FOUND');
character = { status: 'initializing', generation: 1 };
assert.equal(enter({ server_id: 's001', generation: 1 }).reason, 'CHARACTER_NOT_READY');
character = { status: 'ready', generation: 1 };
assert.equal(enter({ server_id: 's001', generation: 1 }).success, true);
assert.equal(mutations.length, 2);
assert(mutations.every(m => m.args[0] === ctx.userId), 'account comes from authenticated identity');
assert.equal(JSON.parse(fn('enterGameServer')({ env: {} }, {}, nk, '{}')).code, 401);
let invoked = false;
const guarded = fn('serverAdmissionRpc')('get_config_bootstrap', () => { invoked = true; return '{}'; });
assert.equal(JSON.parse(guarded(ctx, {}, nk, '{}')).reason, 'SERVER_REQUIRED');
assert.equal(invoked, false, 'config must not run before valid admission');
guarded(ctx, {}, nk, '{"server_id":"s001","generation":1}');
assert.equal(invoked, true, 'valid config invokes a scoped runtime under a server lease');
const payment=fn('serverAdmissionRpc')('iap_claim',(_c,_l,runtime)=>JSON.stringify({scoped:runtime.__characterContext.serverId}));
assert.equal(JSON.parse(payment(ctx,{},nk,'{"server_id":"s001","generation":1}')).scoped,'s001');
console.log('PASS server admission: auth, state, generation, ownership, config ordering, scoped lease and scoped payment routing');

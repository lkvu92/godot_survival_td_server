// Read-only packaging gate: the tracked/mounted artifact must match this build.
const fs = require('fs'), path = require('path'), assert = require('assert');
const read = relative => fs.readFileSync(path.join(__dirname, relative), 'utf8');
const canonical = read('data/build/index.js');
assert.equal(canonical, read('data/modules/build/index.js'), 'Runtime entrypoint copies differ; rebuild before restart');
assert(canonical.includes('function serverAdmissionRpc('), 'Runtime missing server admission guard');
assert(canonical.includes('registerRpc("enter_server"'), 'Runtime missing enter_server registration');
assert(canonical.includes('registerRpc("store_purchase"'), 'Mounted runtime is missing store_purchase registration');
assert(canonical.includes('registerRpc("abandon_run"'), 'Mounted runtime is missing abandon_run registration');
assert(canonical.includes('request.fresh_login === true'), 'Mounted runtime is missing fresh-login recovery');
assert(canonical.includes('rpcSweepTick'), 'Mounted runtime is missing C144 sweep worker');
assert(canonical.includes('sweepCreateWorkerIndex'), 'Mounted runtime is missing durable sweep discovery');
assert(read('docker-compose.yml').includes('sweep-worker:'), 'Deployment must include the sweep worker');
assert(read('docker-compose.local.yml').includes('sweep-worker:'), 'Local deployment must include the sweep worker');
assert(canonical.includes('Store purchase protocol v2 loaded'), 'Mounted runtime is missing purchase protocol v2');
assert(canonical.includes('purchase_protocol: 2'), 'Mounted runtime must return currency protocol proof');
assert(/js_entrypoint:\s*["']build\/index\.js["']/.test(read('data/local.yml')), 'Mounted data/local.yml must load canonical build/index.js');
assert(read('docker-compose.yml').includes('--config /nakama/data/local.yml'), 'Docker must use the tracked mounted config, not an ignored legacy local.yml');
console.log('PASS runtime packaging: canonical build/index.js, matching artifacts, store_purchase v2 registered');

assert(canonical.includes("linkedRpc_mail_claim"), "Runtime missing C147 mailbox RPCs");
for (const name of ["docker-compose.yml", "docker-compose.local.yml"]) assert(read(name).includes("mail-worker:"), "Deployment missing mailbox worker");

for (const rpc of ['operator_config_release', 'get_trial_tower_status', 'start_trial_tower', 'prepare_trial_tower', 'finish_trial_tower'])
    assert(canonical.includes('registerRpc("' + rpc + '"'), 'Runtime missing required RPC: ' + rpc);

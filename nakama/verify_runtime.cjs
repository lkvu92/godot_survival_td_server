// Read-only packaging gate: the tracked/mounted artifact must match this build.
const fs = require('fs'), path = require('path'), assert = require('assert');
const read = relative => fs.readFileSync(path.join(__dirname, relative), 'utf8');
const canonical = read('data/build/index.js');
assert.equal(canonical, read('data/modules/build/index.js'), 'Runtime entrypoint copies differ; rebuild before restart');
assert(canonical.includes('registerRpc("store_purchase"'), 'Mounted runtime is missing store_purchase registration');
assert(canonical.includes('Store purchase protocol v2 loaded'), 'Mounted runtime is missing purchase protocol v2');
assert(canonical.includes('purchase_protocol: 2'), 'Mounted runtime must return currency protocol proof');
assert(/js_entrypoint:\s*["']build\/index\.js["']/.test(read('data/local.yml')), 'Mounted data/local.yml must load canonical build/index.js');
assert(read('docker-compose.yml').includes('--config /nakama/data/local.yml'), 'Docker must use the tracked mounted config, not an ignored legacy local.yml');
console.log('PASS runtime packaging: canonical build/index.js, matching artifacts, store_purchase v2 registered');

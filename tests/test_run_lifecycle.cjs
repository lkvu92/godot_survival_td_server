const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const c = vm.createContext({});
for (const name of ['progression_rpc', 'player_rpc']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build', name + '.js'), 'utf8'), c);
const fn = name => vm.runInContext(name, c), clone = x => JSON.parse(JSON.stringify(x));
// Keep actual cultivation recovery/penalties; isolate unrelated name, VIP and catalog code.
c.getRemoteConfigValue = (_nk, _section, _key, fallback) => fallback;
c.ensurePlayerName = () => false;
c.buildMonetizationResponse = () => ({});
c.monetizationMode = () => 'production';
vm.runInContext('canonicalHeroStates = (_nk, source) => source.heroes || []; cultivationEnsurePreview = () => false;', c);
let db, revision = 0, conflict = false;
const key = r => `${r.collection}:${r.key}`;
function row(collection, name, value) { db[`${collection}:${name}`] = {collection, key: name, userId: 'u', value: clone(value), version: String(++revision)}; }
const nk = {
  storageRead(reads) { assert(reads.every(r => r.userId === 'u')); return reads.flatMap(r => db[key(r)] ? [clone(db[key(r)])] : []); },
  storageWrite(writes) {
    if (conflict) throw Error('CAS conflict');
    for (const w of writes) assert.equal(w.version, db[key(w)]?.version);
    for (const w of writes) row(w.collection, w.key, w.value);
    return writes.map(w => ({collection: w.collection, key: w.key, version: db[key(w)].version}));
  },
  sqlQuery(sql) { if (sql.includes('AS now')) return [{now: Math.floor(Date.now()/1000)}]; return []; }
};
function reset() {
  db = {}; conflict = false;
  row('player_profiles', 'main', {level: 9, exp: 10000, stamina: 30, last_stamina_update: Math.floor(Date.now()/1000),
    talent_tier: 'ha_pham', talent_score: 25, main_element: 'fire', element_affinities: {}, affinity_flags: [],
    breakthrough: {in_tribulation: false, encounter_id: 'trial', attempts_left: 3, failures: 0},
    unlocked_arcs: ['arc_0'], unlocked_stages: [{stage_id: 'stage_0_1'}]});
  row('player_stage_runs', 'active', {run_id: 'run', status: 'active', expires_at_ms: Date.now()+7200000});
  row('player_heroes', 'states', {heroes: []}); row('player_inventory', 'items', {items: []}); row('player_settings', 'prefs', {volume: 1});
}
const stage = () => db['player_stage_runs:active'].value;
const profile = () => db['player_profiles:main'].value;
const abandon = request => JSON.parse(fn('abandonRun')({userId: 'u', env: {}}, {}, nk, JSON.stringify(request)));
const load = request => JSON.parse(fn('loadPlayerProfile')({userId: 'u', env: {}}, {}, nk, JSON.stringify(request)));
reset(); assert(abandon({run_id: 'run'}).success); assert.equal(stage().status, 'abandoned'); assert.equal(profile().exp, 10000);
assert(abandon({run_id: 'run'}).success); assert.equal(profile().stamina, 30);
reset(); assert(!abandon({run_id: 'old'}).success); assert.equal(stage().status, 'active');
assert(!abandon({}).success);
assert(!abandon({run_id: 'run', encounter_id: 'old'}).success); assert.equal(stage().status, 'active');
reset(); stage().status = 'settled'; assert(abandon({run_id: 'run'}).success); assert.equal(stage().status, 'settled');
reset(); stage().expires_at_ms = 1; assert(abandon({run_id: 'run'}).success); assert.equal(stage().status, 'abandoned');
reset(); conflict = true; assert(!abandon({run_id: 'run'}).success); assert.equal(stage().status, 'active');
conflict = false; assert(abandon({run_id: 'run'}).success);
reset(); profile().breakthrough.in_tribulation = true;
assert(abandon({encounter_id: 'trial'}).success); assert.equal(profile().breakthrough.in_tribulation, false);
assert.equal(profile().breakthrough.attempts_left, 2); assert.equal(stage().status, 'active');
assert(abandon({encounter_id: 'trial'}).success); assert.equal(profile().breakthrough.failures, 1);
reset(); profile().breakthrough.in_tribulation = true; profile().breakthrough.attempts_left = 1;
conflict = true;
assert(!abandon({run_id: 'run', encounter_id: 'trial'}).success);
assert.equal(stage().status, 'active'); assert(profile().breakthrough.in_tribulation); assert.equal(profile().exp, 10000);
conflict = false;
assert(abandon({run_id: 'run', encounter_id: 'trial'}).success);
assert.equal(stage().status, 'abandoned'); assert.equal(profile().breakthrough.attempts_left, 3); assert(profile().exp < 10000);
const afterPenalty = profile().exp; assert(abandon({encounter_id: 'trial'}).success); assert.equal(profile().exp, afterPenalty);
reset(); profile().breakthrough.in_tribulation = true;
load({}); assert.equal(stage().status, 'active'); assert(profile().breakthrough.in_tribulation); assert.equal(profile().breakthrough.attempts_left, 3);
load({fresh_login: false}); assert.equal(stage().status, 'active'); assert(profile().breakthrough.in_tribulation);
load({fresh_login: true}); assert.equal(stage().status, 'abandoned'); assert(!profile().breakthrough.in_tribulation); assert.equal(profile().breakthrough.attempts_left, 2);
load({fresh_login: true}); assert.equal(profile().breakthrough.attempts_left, 2);
reset(); stage().expires_at_ms = 1; load({fresh_login: true}); assert.equal(stage().status, 'abandoned');
for (const payload of ['null', '[]', '{']) {
  assert.equal(JSON.parse(fn('abandonRun')({userId: 'u'}, {}, nk, payload)).success, false);
  assert.equal(JSON.parse(fn('loadPlayerProfile')({userId: 'u'}, {}, nk, payload)).success, false);
}
reset(); profile().stamina = 80; profile().last_stamina_update = 1;
profile().daily_packs = {flash_sale:{grant_id:'paid',started_at_ms:Date.now(),expires_at_ms:Date.now()+86400000,last_claim_day:0,rewards:[]}};
load({}); assert.equal(profile().stamina,80,'Profile refresh must preserve paid stamina overflow');
load({fresh_login:true}); assert.equal(profile().stamina,80,'Login must preserve paid stamina overflow');
assert.equal(profile().daily_packs.flash_sale.grant_id,'paid','Login must preserve daily-pack entitlement/claim state');
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/resource_rpc.js'),'utf8'),c);
c.parseJsonb = x => typeof x === 'string' ? JSON.parse(x) : x;
c.progressionReconcileLevelUnlocks = () => {};
c.eventRecord = () => {};
c.talismanCreateStageRun = () => ({run:{run_id:'new-run',status:'active'},version:db['player_stage_runs:active'].version});
const stageNk={...nk,sqlQuery(sql,args){return sql.includes('stamina_cost')?[{stamina_cost:5}]:nk.sqlQuery(sql,args);}};
const started=JSON.parse(fn('startStage')({userId:'u'},{},stageNk,JSON.stringify({stage_id:'stage_0_1',level_id:'normal'})));
assert(started.success); assert.equal(profile().stamina,75,'Starting a stage must debit from the full paid stamina balance');
console.log('PASS run lifecycle: exit/retry/stale/terminal/expired/CAS, tribulation penalty once, fresh login vs refresh, paid stamina and daily-pack preservation');

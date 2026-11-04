const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const c = vm.createContext({JSON, Math, Number, String, Array, Date});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/player_rpc.js'), 'utf8'), c);
let writes = [];
c.nk = {storageWrite: rows => writes.push(...rows)};
c.ctx = {userId:'fixture'}; c.logger = {};
c.eventProfileComplete = () => false;
function save(phone) {
  c.payload = JSON.stringify({full_name:'Fixture', phone_number:phone});
  return JSON.parse(vm.runInContext('saveComplianceProfile(ctx, logger, nk, payload)', c));
}
for (const phone of ['+12025550123','02412345678','09012345678','0901234567x','090/1234567']) {
  assert.equal(save(phone).success, false); assert.equal(writes.length, 0);
}
assert.equal(save('+84 901-234-567').profile.phone_number, '0901234567');
assert.equal(writes.length, 1);
assert.equal(save('').profile.is_verified, false);
console.log('PASS C262 legacy profile: foreign/malformed phones rejected without writes, VN normalized, empty remains unverified');

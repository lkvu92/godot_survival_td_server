const fs = require('fs'), vm = require('vm'), assert = require('assert');
const path = require('path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/account_link.js'), 'utf8'), context);
const invoke = (name, ctx, nk, body) => JSON.parse(vm.runInContext(name, context)(ctx, {}, nk, body));
let account, updated, hashed, proofOwner, changed, leases;
const userId = '11111111-1111-1111-1111-111111111111';
function reset() {
  account = {email: 'google@example.test', google_id: 'google-subject', google_linked: true, has_password: false};
  updated = 0; hashed = 0; proofOwner = userId; changed = false; leases = 0;
}
const nk = {
  authenticateGoogle(token, username, create) {
    assert.equal(create, false, 'proof verification must never create an account');
    if (token !== 'valid-proof') throw Error('invalid Google token');
    return {userId: proofOwner};
  },
  bcryptHash(password) { hashed++; assert.equal(typeof password, 'string'); return '$2a$hash'; },
  sqlQuery(sql, args) {
	if (sql.includes('FROM player_login_sessions')) return [{generation:'test'}];
    if (sql.includes('INSERT INTO account_link_state')) { leases++; return [{user_id: userId}]; }
    if (sql.startsWith('SELECT')) return account ? [account] : [];
    assert(sql.startsWith('UPDATE users'));
    assert(sql.includes('COALESCE(octet_length(password),0)=0'));
    assert(sql.includes('google_id=$3') && sql.includes('email=$2') && sql.includes('disable_time'));
    assert.equal(args[0], userId); assert.equal(args[1], account.email);
    assert.equal(args[2], account.google_id); assert.equal(args[3], '$2a$hash');
    if (process.argv.includes('--update-sql')) {
      process.stdout.write(JSON.stringify(sql));
      process.exit(0);
    }
    if (changed || account.has_password) return [];
    account.has_password = true; updated++;
    return [{id: userId}];
  },
  sqlExec() { leases--; }
};
const ctx = {userId, vars:{login_generation:'test'}};
const body = (password = 'secure-password', id_token = 'valid-proof') => JSON.stringify({password, id_token});
const setup = payload => invoke('setupAccountPassword', ctx, nk, payload);
if (process.argv.includes('--update-sql')) { reset(); setup(body()); throw Error('No SQL captured'); }
reset(); assert.equal(invoke('setupAccountPassword', {}, nk, body()).code, 401); assert.equal(updated, 0);
for (const payload of ['{', 'null', '[]', '{}', body('short'), body('x'.repeat(73)), body('\u00e9'.repeat(37)), body('\ud800'.repeat(8)), body('secure-password', '')]) {
  reset(); assert.equal(setup(payload).code, 400); assert.equal(hashed, 0); assert.equal(updated, 0);
}
reset(); assert.equal(setup(body('secure-password', 'bad-proof')).code, 403); assert.equal(hashed, 0);
reset(); proofOwner = 'other-user'; assert.equal(setup(body()).code, 403); assert.equal(updated, 0);
reset(); account = null; assert.equal(setup(body()).code, 403);
for (const field of ['email', 'google_id']) {
  reset(); account[field] = ''; assert.equal(setup(body()).code, 409); assert.equal(updated, 0);
}
reset(); account.has_password = true; assert.equal(setup(body()).code, 409); assert.equal(hashed, 0);
reset(); assert.equal(setup(body('\u00e9'.repeat(36))).success, true, '72 UTF-8 bytes accepted');
reset(); changed = true; assert.equal(setup(body()).code, 409); assert.equal(updated, 0);
reset();
assert.equal(invoke('accountPasswordStatus', ctx, nk, '{}').can_setup, true);
const guarded = vm.runInContext('accountGuardedRpc("setup_account_password", setupAccountPassword)', context);
const result = JSON.parse(guarded(ctx, {}, nk, body()));
assert.equal(result.success, true); assert.equal(updated, 1); assert.equal(leases, 0);
assert(!JSON.stringify(result).includes('secure-password') && !JSON.stringify(result).includes('$2a$hash'));
assert.equal(invoke('accountPasswordStatus', ctx, nk, '{}').has_password, true);
assert.equal(invoke('accountPasswordStatus', ctx, nk, '{}').can_setup, false);
assert.equal(setup(body()).code, 409); assert.equal(updated, 1, 'retries cannot reset an existing password');
console.log('PASS password setup: ownership, validation, conditional update, replay and account lease');
const hook=vm.runInContext('beforeEmailPasswordSetup',context);
for (const create of [false,true]) {
  const request={account:{email:'Google@Example.test',password:'test-password'},create};
  let queryArgs;
  assert.throws(()=>hook({}, {}, {sqlQuery(sql,args){queryArgs=args;assert(sql.includes("COALESCE(octet_length(password),0)=0"));return [{}];}}, request),
    error=>error.code===9 && error.message.startsWith('PASSWORD_SETUP_REQUIRED:'));
  assert.equal(queryArgs[0],'google@example.test');
  assert.strictEqual(hook({}, {}, {sqlQuery(){return [];}},request),request,'normal password and new account retain native auth');
}
const usernameRequest={account:{password:'test-password'},username:'player'};
assert.strictEqual(hook({}, {}, {sqlQuery(){throw Error('must not query');}},usernameRequest),usernameRequest);
console.log('PASS email auth recovery hook: precise missing-password marker for login/register, native auth preserved');

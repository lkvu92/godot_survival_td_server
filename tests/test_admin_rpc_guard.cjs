// Admin RPC authorization gate (static + behavioural). Run after `npm run build` in server/nakama.
const fs = require('fs'), path = require('path'), assert = require('assert');
const mod = n => fs.readFileSync(path.join(__dirname, '../nakama/data/modules', n), 'utf8');
const main = mod('main.ts');
const built = fs.readFileSync(path.join(__dirname, '../nakama/data/build/index.js'), 'utf8');

// 1. No ad-hoc admin comparisons outside the central helper.
for (const f of fs.readdirSync(path.join(__dirname, '../nakama/data/modules')).filter(f => f.endsWith('.ts') && f !== 'server_admin.ts' && f !== 'nkruntime.d.ts')) {
  const src = mod(f);
  assert(!/userId\s*!==?\s*String\([^)]*CONFIG_ADMIN_USER_ID/.test(src), `${f}: use isConfigAdmin(ctx) instead of inline CONFIG_ADMIN_USER_ID compare`);
}

// 2. Every admin-ish RPC must be registered and reach a guard.
const registered = [...main.matchAll(/registerRpc\(\s*['"]([a-z0-9_]+)['"]\s*,\s*([A-Za-z0-9_]+)/g)].map(m => ({ id: m[1], fn: m[2] }));
const adminLike = registered.filter(r => /^(admin_|operator_|seed_game_data|publish_config_release|sync_all_leaderboards|.*_tick$|mail_admin_|gift_code_admin)/.test(r.id));
assert(adminLike.some(r => r.id === 'admin_whoami'), 'admin_whoami must be registered');
const allSrc = fs.readdirSync(path.join(__dirname, '../nakama/data/modules')).filter(f => f.endsWith('.ts')).map(mod).join('\n');
const GUARD = /(isConfigAdmin|requireServerAdmin|CONFIG_PUBLISH_TOKEN|MONETIZATION_VERIFIER_SECRET|adminExpTestAllowed|adminTestAccess)/;
const KNOWN_NON_ADMIN_WRAPPERS = new Set(['admin_test_access', 'admin_exp_test_access', 'admin_exp_test']); // sandbox gates, email allow-list
const defs = {};
for (const m of allSrc.matchAll(/(?:^|\n)(?:async\s+)?(?:function|const)\s+([A-Za-z0-9_]+)\b/g)) defs[m[1]] = m.index;
const starts = Object.values(defs).sort((a, b) => a - b);
function bodyOf(name) { const i = defs[name]; if (i === undefined) return ''; const next = starts.find(s => s > i); return allSrc.slice(i, next === undefined ? undefined : next); }
const SKIP = new Set(['accountGuardedRpc', 'serverAdmissionRpc', 'featureGuardedRpc', 'invokeWithVersionGate']); // generic player gates, not admin checks
function reachesGuard(name, depth, seen) {
  if (depth < 0 || seen.has(name) || SKIP.has(name)) return false;
  seen.add(name);
  const body = bodyOf(name);
  if (GUARD.test(body)) return true;
  for (const id of new Set([...body.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*[(,)]/g)].map(m => m[1]) || [])) if (defs[id] !== undefined && id !== name && reachesGuard(id, depth - 1, seen)) return true;
  return false;
}
for (const r of adminLike) {
  if (KNOWN_NON_ADMIN_WRAPPERS.has(r.id)) continue;
  assert(defs[r.fn] !== undefined, `cannot locate handler ${r.fn} for ${r.id}`);
  assert(reachesGuard(r.fn, 3, new Set()), `RPC ${r.id} (${r.fn}) has no admin/operator guard`);
}
// 3. Behavioural test of the guard compiled into the runtime artifact.
const helperSrc = /function isConfigAdmin[\s\S]*?\n}\n/.exec(built);
assert(helperSrc, 'built runtime missing isConfigAdmin; run npm run build');
const whoamiSrc = /function rpcAdminWhoami[\s\S]*?\n}\n/.exec(built);
const { isConfigAdmin, rpcAdminWhoami } = new Function(helperSrc[0] + whoamiSrc[0] + '\nreturn { isConfigAdmin, rpcAdminWhoami };')();
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
assert.equal(isConfigAdmin({ userId: A, env: { CONFIG_ADMIN_USER_ID: A } }), true);
assert.equal(isConfigAdmin({ userId: A.toUpperCase(), env: { CONFIG_ADMIN_USER_ID: A } }), true);
assert.equal(isConfigAdmin({ userId: B, env: { CONFIG_ADMIN_USER_ID: A } }), false, 'non-admin must be rejected');
assert.equal(isConfigAdmin({ userId: B, env: { CONFIG_ADMIN_USER_ID: ` ${A}, ${B} ` } }), true, 'list support');
assert.equal(isConfigAdmin({ userId: '', env: { CONFIG_ADMIN_USER_ID: '' } }), false, 'anonymous + empty config must fail closed');
assert.equal(isConfigAdmin({ userId: B, env: {} }), false, 'missing config must fail closed');
assert.equal(isConfigAdmin({ userId: B }), false, 'missing env must fail closed');
assert.throws(() => rpcAdminWhoami({ userId: B, env: { CONFIG_ADMIN_USER_ID: A } }), e => e.code === 7, 'whoami rejects non-admin with PERMISSION_DENIED');
assert.throws(() => rpcAdminWhoami({ userId: '', env: { CONFIG_ADMIN_USER_ID: A } }), e => e.code === 16, 'whoami rejects anonymous');
assert.equal(JSON.parse(rpcAdminWhoami({ userId: A, env: { CONFIG_ADMIN_USER_ID: A } })).role, 'admin');
console.log(`PASS admin RPC guard: ${adminLike.length} admin-like RPCs checked, helper behaviour verified`);

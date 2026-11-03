const assert = require('assert');

const serverKey = 'd4ab1d75d528586b8f6d616529eb7aa7c2561755da0ec8b3185f81a6b114eb57';
const authBasic = Buffer.from(serverKey + ':').toString('base64');

async function callRpc(token, rpcName, bodyObj) {
  const r = await fetch(`http://127.0.0.1:7350/v2/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(JSON.stringify(bodyObj || {}))
  });
  const data = await r.json();
  if (r.status !== 200) {
    return { status: r.status, error: data };
  }
  const payload = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
  return { status: 200, payload };
}

async function main() {
  console.log('=== TEST 1: Login Admin & Non-Admin ===');
  const rAdmin = await fetch('http://127.0.0.1:7350/v2/account/authenticate/email?create=false', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + authBasic, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lkvu92@gmail.com', password: 'anhvancho' })
  });
  const adminAuth = await rAdmin.json();
  const adminToken = adminAuth.token;

  const rUser = await fetch('http://127.0.0.1:7350/v2/account/authenticate/email?create=false', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + authBasic, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lkvu923@gmail.com', password: 'anhvancho' })
  });
  const userAuth = await rUser.json();
  const userToken = userAuth.token;

  console.log('Admin & User authenticated successfully.');

  console.log('\n=== TEST 2: Test admin_config_get ===');
  const getNonAdmin = await callRpc(userToken, 'admin_config_get', {});
  assert.equal(getNonAdmin.status, 403, 'Non-admin must be 403 on admin_config_get');

  const getAdmin = await callRpc(adminToken, 'admin_config_get', {});
  assert.equal(getAdmin.status, 200);
  assert.equal(getAdmin.payload.success, true);
  const activeVer = getAdmin.payload.data.active_version;
  console.log('-> Active config version:', activeVer);
  console.log('-> Total settings count:', getAdmin.payload.data.settings.length);
  console.log('-> Releases count:', getAdmin.payload.data.releases.length);

  console.log('\n=== TEST 3: Test admin_config_update ===');
  const updateRes = await callRpc(adminToken, 'admin_config_update', {
    updates: [
      { module: 'system', key: 'stamina_max', value: 30, value_type: 'int', description: 'Năng lượng tối đa' }
    ]
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.payload.success, true);
  console.log('-> Update success:', updateRes.payload.message);

  console.log('\n=== TEST 4: Test Toggle & Validate (Bắt lỗi khi thiếu setting bắt buộc) ===');
  // 4a: Deactive ads_enabled -> Snapshot không còn ads_enabled
  const deactRes = await callRpc(adminToken, 'admin_config_toggle', {
    module: 'system',
    key: 'ads_enabled',
    is_active: false
  });
  assert.equal(deactRes.status, 200);
  assert.equal(deactRes.payload.is_active, false);

  // 4b: Validate phải bắt được lỗi thiếu cờ ads_enabled (422)
  const valFailRes = await callRpc(adminToken, 'admin_config_validate', {});
  assert.equal(valFailRes.status, 200);
  assert.equal(valFailRes.payload.valid, false);
  assert.equal(valFailRes.payload.code, 422);
  console.log('-> Validate caught expected validation failure:', valFailRes.payload.message);

  // 4c: Active lại ads_enabled -> Validate phải PASS
  const actRes = await callRpc(adminToken, 'admin_config_toggle', {
    module: 'system',
    key: 'ads_enabled',
    is_active: true
  });
  assert.equal(actRes.status, 200);
  assert.equal(actRes.payload.is_active, true);

  const valPassRes = await callRpc(adminToken, 'admin_config_validate', {});
  assert.equal(valPassRes.status, 200);
  assert.equal(valPassRes.payload.valid, true);
  console.log('-> Validate passed successfully after reactivation!');

  console.log('\n=== TEST 5: Test Publish Config Release ===');
  const pubRes = await callRpc(adminToken, 'publish_config_release', {
    store_url: 'https://play.google.com/store/apps/details?id=com.survival.td'
  });
  assert.equal(pubRes.status, 200);
  assert.equal(pubRes.payload.status, 'ok');
  const newVer = pubRes.payload.config_version;
  console.log(`-> Published new release! Old version: ${activeVer} -> New version: ${newVer}`);
  assert.equal(newVer, activeVer + 1);

  console.log('\n=== TEST 6: Test Rollback Config Release ===');
  const rollbackRes = await callRpc(adminToken, 'admin_config_rollback', {
    target_version: activeVer,
    reason: 'Test automated rollback'
  });
  assert.equal(rollbackRes.status, 200);
  assert.equal(rollbackRes.payload.status, 'ok');
  const rolledVer = rollbackRes.payload.config_version;
  console.log(`-> Rollback success! Published new rollback version: ${rolledVer} restored from v${activeVer}`);
  assert.equal(rolledVer, newVer + 1);

  console.log('\n=== TEST 7: Test Security Guards for Non-Admin on all Config RPCs ===');
  const nonAdminUpdate = await callRpc(userToken, 'admin_config_update', { updates: [] });
  assert.equal(nonAdminUpdate.status, 403, 'Must reject non-admin on admin_config_update');
  const nonAdminToggle = await callRpc(userToken, 'admin_config_toggle', { module: 'system', key: 'ads_enabled', is_active: true });
  assert.equal(nonAdminToggle.status, 403, 'Must reject non-admin on admin_config_toggle');
  const nonAdminValidate = await callRpc(userToken, 'admin_config_validate', {});
  assert.equal(nonAdminValidate.status, 403, 'Must reject non-admin on admin_config_validate');
  const nonAdminRollback = await callRpc(userToken, 'admin_config_rollback', { target_version: 1 });
  assert.equal(nonAdminRollback.status, 403, 'Must reject non-admin on admin_config_rollback');
  const nonAdminPub = await callRpc(userToken, 'publish_config_release', {});
  assert.equal(nonAdminPub.payload.code, 403, 'Must reject non-admin on publish_config_release');
  console.log('-> Non-admin caller rejected on 100% of config management RPCs.');

  console.log('\n>>> TOÀN BỘ 7/7 TEST NAKAMA CONFIG RPC ĐẠT CHUẨN 100%! <<<');
}

main().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});

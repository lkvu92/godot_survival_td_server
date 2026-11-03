const assert = require('assert');

const serverKey = 'd4ab1d75d528586b8f6d616529eb7aa7c2561755da0ec8b3185f81a6b114eb57';
const authBasic = Buffer.from(serverKey + ':').toString('base64');

async function main() {
  console.log('=== TEST 1: Đăng nhập tài khoản Admin (lkvu92@gmail.com) ===');
  const rAdmin = await fetch('http://127.0.0.1:7350/v2/account/authenticate/email?create=false', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + authBasic, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lkvu92@gmail.com', password: 'anhvancho' })
  });
  assert.equal(rAdmin.status, 200, 'Admin login failed');
  const adminAuth = await rAdmin.json();
  const adminUid = JSON.parse(Buffer.from(adminAuth.token.split('.')[1], 'base64').toString()).uid;
  console.log('-> Admin authenticated! UID:', adminUid);

  console.log('\n=== TEST 2: Admin gọi RPC admin_whoami (Kỳ vọng 200 role: admin) ===');
  const rWhoami = await fetch('http://127.0.0.1:7350/v2/rpc/admin_whoami', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + adminAuth.token, 'Content-Type': 'application/json' },
    body: '"{}"'
  });
  console.log('-> HTTP Status:', rWhoami.status);
  const whoamiData = await rWhoami.json();
  console.log('-> Payload:', whoamiData);
  assert.equal(rWhoami.status, 200, 'Admin call must be 200');
  const parsed = JSON.parse(whoamiData.payload);
  assert.equal(parsed.role, 'admin', 'Role must be admin');
  assert.equal(parsed.user_id, adminUid, 'UID must match');

  console.log('\n=== TEST 3: Admin gọi RPC admin_server_list (Kỳ vọng 200 trả về danh sách servers) ===');
  const rServerList = await fetch('http://127.0.0.1:7350/v2/rpc/admin_server_list', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + adminAuth.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify({ limit: 10 }))
  });
  console.log('-> HTTP Status:', rServerList.status);
  const serverListData = await rServerList.json();
  console.log('-> Payload snippet:', serverListData.payload?.slice(0, 200));
  assert.equal(rServerList.status, 200, 'admin_server_list must succeed for admin');

  console.log('\n=== TEST 4: Đăng nhập tài khoản User thường (lkvu923@gmail.com) ===');
  const rUser = await fetch('http://127.0.0.1:7350/v2/account/authenticate/email?create=false', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + authBasic, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lkvu923@gmail.com', password: 'anhvancho' })
  });
  assert.equal(rUser.status, 200, 'User login failed');
  const userAuth = await rUser.json();
  const userUid = JSON.parse(Buffer.from(userAuth.token.split('.')[1], 'base64').toString()).uid;
  console.log('-> Normal user authenticated! UID:', userUid);

  console.log('\n=== TEST 5: User thường gọi admin_whoami (Kỳ vọng BỊ CHẶN 403 Forbidden) ===');
  const rUserWhoami = await fetch('http://127.0.0.1:7350/v2/rpc/admin_whoami', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + userAuth.token, 'Content-Type': 'application/json' },
    body: '"{}"'
  });
  console.log('-> HTTP Status:', rUserWhoami.status);
  const userWhoamiErr = await rUserWhoami.json();
  console.log('-> Error body:', userWhoamiErr);
  assert.equal(rUserWhoami.status, 403, 'Normal user must be rejected with 403');
  assert.equal(userWhoamiErr.code, 7, 'Code must be 7 (PERMISSION_DENIED)');

  console.log('\n=== TEST 6: User thường gọi admin_server_list (Kỳ vọng BỊ CHẶN 403 Forbidden) ===');
  const rUserServerList = await fetch('http://127.0.0.1:7350/v2/rpc/admin_server_list', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + userAuth.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify({ limit: 10 }))
  });
  console.log('-> HTTP Status:', rUserServerList.status);
  const userServerListErr = await rUserServerList.json();
  console.log('-> Error body:', userServerListErr);
  const payloadJson = typeof userServerListErr.payload === 'string' ? JSON.parse(userServerListErr.payload) : userServerListErr;
  assert.equal(payloadJson.success, false, 'Must not be success');
  assert.equal(payloadJson.code, 403, 'Must be rejected with 403 Forbidden');
  assert.equal(payloadJson.reason, 'FORBIDDEN', 'Reason must be FORBIDDEN');

  console.log('\n=== TEST 7: Khách vãng lai không có token gọi RPC admin (Kỳ vọng BỊ CHẶN 401 Unauthorized) ===');
  const rAnon = await fetch('http://127.0.0.1:7350/v2/rpc/admin_whoami', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '"{}"'
  });
  console.log('-> HTTP Status:', rAnon.status);
  const anonErr = await rAnon.json();
  console.log('-> Error body:', anonErr);
  assert.equal(rAnon.status, 401, 'Anonymous caller must be rejected with 401');

  console.log('\n>>> TẤT CẢ 7 TEST PHÂN QUYỀN RPC ĐỀU ĐẠT CHUẨN 100%! <<<');
}

main().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});

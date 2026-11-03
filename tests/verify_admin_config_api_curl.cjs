const assert = require('assert');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:3000';
const SESSION_SECRET = 'dev-session-secret-survival-td-nakama-2026-very-secure';

// Helper trích xuất cookie từ Set-Cookie header
function getCookies(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie.split(',').map(s => s.split(';')[0].trim()).join('; ');
}

// Tạo JWT HS256 thuần chuẩn jose
function signHs256(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Tạo cookie giả lập user thường (role: player) có chữ ký HS256 hợp lệ
function createPlayerCookie() {
  const nowSec = Math.floor(Date.now() / 1000);
  const jwt = signHs256({
    token: 'dummy-player-nakama-token',
    refresh_token: 'dummy-player-refresh-token',
    user_id: '03838edf-13ae-43d9-a3b7-d185c0010814',
    role: 'player',
    exp: nowSec + 86400
  }, SESSION_SECRET);

  return `nk_session=${jwt}`;
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Accept': 'application/json',
    'Origin': BASE_URL, // Đảm bảo vượt qua CSRF check isSameOrigin
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, headers: res.headers, data: json };
}

async function main() {
  console.log('================================================================');
  console.log('  TEST SUITE: ADMIN CONFIG MANAGEMENT APIS (END-TO-END CURL)   ');
  console.log('================================================================\n');

  // ------------------------------------------------------------------------
  // BƯỚC 1: ĐĂNG NHẬP VÀ XÁC THỰC QUYỀN
  // ------------------------------------------------------------------------
  console.log('>>> [AUTH] 1. Đăng nhập Admin (lkvu92@gmail.com) ...');
  const adminLoginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'lkvu92@gmail.com', password: 'anhvancho' }
  });
  console.log('    Login response:', adminLoginRes.data);
  assert.equal(adminLoginRes.status, 200, 'Admin login failed');
  assert.equal(adminLoginRes.data.ok, true, 'Admin login ok must be true');
  const adminCookie = getCookies(adminLoginRes);

  const adminMe = await request('/api/auth/me', { headers: { Cookie: adminCookie } });
  assert.equal(adminMe.status, 200);
  assert.equal(adminMe.data.role, 'admin', 'Admin role must be admin');
  console.log('    ✓ Admin đăng nhập thành công. Role:', adminMe.data.role);

  console.log('>>> [AUTH] 2. Kiểm tra chặn Non-Admin đăng nhập vào Web Admin ...');
  const userLoginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'lkvu923@gmail.com', password: 'anhvancho' }
  });
  console.log(`    [Non-Admin login] Status: ${userLoginRes.status} -> Message: ${userLoginRes.data?.message}`);
  assert.equal(userLoginRes.status, 403, 'Non-admin must be rejected at login with 403');
  console.log('    ✓ Gateway Login chặn thành công tài khoản không có quyền admin!');

  const playerCookie = createPlayerCookie();
  console.log('    ✓ Khởi tạo Player Session Token ký hợp lệ (role: player) để test route guard.\n');

  // ------------------------------------------------------------------------
  // API 1: GET /api/admin/config
  // ------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('>>> [API 1] GET /api/admin/config');
  console.log('----------------------------------------------------------------');
  // 1a. Anonymous gọi không có cookie -> Kỳ vọng 403
  const anonGet = await request('/api/admin/config');
  console.log(`    [Anonymous] Status: ${anonGet.status} -> Message: ${anonGet.data?.message}`);
  assert.equal(anonGet.status, 403, 'Anonymous must be rejected with 403');

  // 1b. User thường (role player) gọi -> Kỳ vọng 403
  const userGet = await request('/api/admin/config', { headers: { Cookie: playerCookie } });
  console.log(`    [Non-Admin] Status: ${userGet.status} -> Message: ${userGet.data?.message}`);
  assert.equal(userGet.status, 403, 'Non-admin must be rejected with 403');

  // 1c. Admin gọi -> Kỳ vọng 200 và dữ liệu đầy đủ
  const adminGet = await request('/api/admin/config', { headers: { Cookie: adminCookie } });
  console.log(`    [Admin]     Status: ${adminGet.status} -> Message: ${adminGet.data?.message}`);
  assert.equal(adminGet.status, 200, 'Admin GET must succeed');
  assert.equal(adminGet.data.status, 'ok');
  const configData = adminGet.data.data;
  console.log(`    -> Phiên bản Active hiện tại: v${configData.active_version}`);
  console.log(`    -> Tổng số settings trong DB: ${configData.settings.length} dòng`);
  console.log(`    -> Lịch sử releases: ${configData.releases.length} bản ghi`);
  assert(Number.isInteger(configData.active_version), 'active_version must be integer');
  assert(Array.isArray(configData.settings) && configData.settings.length > 0, 'settings must not be empty');
  assert(Array.isArray(configData.releases), 'releases must be array');
  const initialActiveVersion = configData.active_version;
  console.log('    ✓ API 1 ĐẠT CHUẨN (Auth Guard + Phản hồi đúng schema)\n');

  // ------------------------------------------------------------------------
  // API 2: PUT /api/admin/config (Cập nhật settings)
  // ------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('>>> [API 2] PUT /api/admin/config');
  console.log('----------------------------------------------------------------');
  // 2a. User thường gọi -> Kỳ vọng 403
  const userPut = await request('/api/admin/config', {
    method: 'PUT',
    headers: { Cookie: playerCookie },
    body: { module: 'system', key: 'stamina_max', value: 30 }
  });
  console.log(`    [Non-Admin] Status: ${userPut.status} -> Message: ${userPut.data?.message}`);
  assert.equal(userPut.status, 403, 'Non-admin must be rejected on PUT');

  // 2b. Admin gửi dữ liệu không hợp lệ (thiếu key) -> Kỳ vọng 400
  const invalidPut = await request('/api/admin/config', {
    method: 'PUT',
    headers: { Cookie: adminCookie },
    body: { module: 'system', value: 30 } // thiếu key
  });
  console.log(`    [Invalid]   Status: ${invalidPut.status} -> Message: ${invalidPut.data?.message}`);
  assert.equal(invalidPut.status, 400, 'Invalid payload must return 400');

  // 2c. Admin cập nhật hợp lệ -> Kỳ vọng 200
  const validPut = await request('/api/admin/config', {
    method: 'PUT',
    headers: { Cookie: adminCookie },
    body: {
      updates: [
        { module: 'system', key: 'stamina_max', value: 30, value_type: 'int', description: 'Năng lượng hồi phục tối đa' },
        { module: 'system', key: 'stamina_storage_max', value: 200, value_type: 'int', description: 'Trần lưu trữ thể lực' }
      ]
    }
  });
  console.log(`    [Admin]     Status: ${validPut.status} -> Message: ${validPut.data?.message}`);
  assert.equal(validPut.status, 200, 'Valid update must succeed');
  assert.equal(validPut.data.status, 'ok');
  console.log('    ✓ API 2 ĐẠT CHUẨN (Validation + Cập nhật hàng loạt thành công)\n');

  // ------------------------------------------------------------------------
  // API 3: POST /api/admin/config/toggle (Active / Deactive)
  // ------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('>>> [API 3] POST /api/admin/config/toggle');
  console.log('----------------------------------------------------------------');
  // 3a. User thường gọi -> Kỳ vọng 403
  const userToggle = await request('/api/admin/config/toggle', {
    method: 'POST',
    headers: { Cookie: playerCookie },
    body: { module: 'system', key: 'campaign_wave_pressure', is_active: false }
  });
  console.log(`    [Non-Admin] Status: ${userToggle.status} -> Message: ${userToggle.data?.message}`);
  assert.equal(userToggle.status, 403, 'Non-admin must be rejected on toggle');

  // 3b. Admin vô hiệu hóa setting (is_active: false) -> Kỳ vọng 200
  const adminDeact = await request('/api/admin/config/toggle', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { module: 'system', key: 'campaign_wave_pressure', is_active: false }
  });
  console.log(`    [Deactive]  Status: ${adminDeact.status} -> Message: ${adminDeact.data?.message}`);
  assert.equal(adminDeact.status, 200);
  assert.equal(adminDeact.data.status, 'ok');
  assert.equal(adminDeact.data.data.is_active, false);

  // 3c. Admin kích hoạt lại setting (is_active: true) -> Kỳ vọng 200
  const adminAct = await request('/api/admin/config/toggle', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { module: 'system', key: 'campaign_wave_pressure', is_active: true }
  });
  console.log(`    [Active]    Status: ${adminAct.status} -> Message: ${adminAct.data?.message}`);
  assert.equal(adminAct.status, 200);
  assert.equal(adminAct.data.status, 'ok');
  assert.equal(adminAct.data.data.is_active, true);
  console.log('    ✓ API 3 ĐẠT CHUẨN (Active/Deactive thành công)\n');

  // ------------------------------------------------------------------------
  // API 4: POST /api/admin/config/validate (Kiểm tra snapshot)
  // ------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('>>> [API 4] POST /api/admin/config/validate');
  console.log('----------------------------------------------------------------');
  // 4a. User thường gọi -> Kỳ vọng 403
  const userVal = await request('/api/admin/config/validate', {
    method: 'POST',
    headers: { Cookie: playerCookie },
    body: {}
  });
  console.log(`    [Non-Admin] Status: ${userVal.status} -> Message: ${userVal.data?.message}`);
  assert.equal(userVal.status, 403, 'Non-admin must be rejected on validate');

  // 4b. Admin validate cấu hình hiện tại trong DB -> Kỳ vọng 200, valid: true
  const adminValPass = await request('/api/admin/config/validate', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: {}
  });
  console.log(`    [Valid]     Status: ${adminValPass.status} -> Message: ${adminValPass.data?.message}`);
  assert.equal(adminValPass.status, 200);
  assert.equal(adminValPass.data.status, 'ok');
  assert.equal(adminValPass.data.data.valid, true);

  // 4c. Admin gửi snapshot lỗi (thiếu system config) -> Kỳ vọng 422 Unprocessable Entity
  const adminValFail = await request('/api/admin/config/validate', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: {
      snapshot: { system: {} } // thiếu tất cả cờ bắt buộc
    }
  });
  console.log(`    [Invalid]   Status: ${adminValFail.status} -> Message: ${adminValFail.data?.message}`);
  assert.equal(adminValFail.status, 422, 'Invalid snapshot must return 422');
  assert.equal(adminValFail.data.status, 'error');
  assert.equal(adminValFail.data.data.valid, false);
  console.log('    ✓ API 4 ĐẠT CHUẨN (Bắt lỗi chính xác theo luật nghiệp vụ Nakama)\n');

  // ------------------------------------------------------------------------
  // API 5: POST /api/admin/config/publish (Xuất bản Release mới)
  // ------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('>>> [API 5] POST /api/admin/config/publish');
  console.log('----------------------------------------------------------------');
  // 5a. User thường gọi -> Kỳ vọng 403
  const userPub = await request('/api/admin/config/publish', {
    method: 'POST',
    headers: { Cookie: playerCookie },
    body: {}
  });
  console.log(`    [Non-Admin] Status: ${userPub.status} -> Message: ${userPub.data?.message}`);
  assert.equal(userPub.status, 403, 'Non-admin must be rejected on publish');

  // 5b. Admin xuất bản release mới -> Kỳ vọng 200 và config_version tăng lên
  const adminPub = await request('/api/admin/config/publish', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: {
      store_url: 'https://play.google.com/store/apps/details?id=com.survival.td'
    }
  });
  console.log(`    [Admin]     Status: ${adminPub.status} -> Message: ${adminPub.data?.message}`);
  assert.equal(adminPub.status, 200);
  assert.equal(adminPub.data.status, 'ok');
  const publishedVersion = adminPub.data.data.config_version;
  console.log(`    -> Phiên bản cũ: v${initialActiveVersion} | Phiên bản mới phát hành: v${publishedVersion}`);
  assert.equal(publishedVersion, initialActiveVersion + 1, 'Version must increment by 1');
  console.log('    ✓ API 5 ĐẠT CHUẨN (Tạo snapshot mới và xuất bản thành công)\n');

  // ------------------------------------------------------------------------
  // API 6: POST /api/admin/config/rollback (Khôi phục phiên bản release)
  // ------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('>>> [API 6] POST /api/admin/config/rollback');
  console.log('----------------------------------------------------------------');
  // 6a. User thường gọi -> Kỳ vọng 403
  const userRoll = await request('/api/admin/config/rollback', {
    method: 'POST',
    headers: { Cookie: playerCookie },
    body: { target_version: initialActiveVersion }
  });
  console.log(`    [Non-Admin] Status: ${userRoll.status} -> Message: ${userRoll.data?.message}`);
  assert.equal(userRoll.status, 403, 'Non-admin must be rejected on rollback');

  // 6b. Admin rollback về version không tồn tại -> Kỳ vọng 400 hoặc 404
  const invalidRoll = await request('/api/admin/config/rollback', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { target_version: 999999 }
  });
  console.log(`    [Invalid]   Status: ${invalidRoll.status} -> Message: ${invalidRoll.data?.message}`);
  assert(invalidRoll.status === 400 || invalidRoll.status === 404, 'Must reject nonexistent version');

  // 6c. Admin rollback về version hợp lệ -> Kỳ vọng 200 và sinh version mới
  const adminRoll = await request('/api/admin/config/rollback', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: {
      target_version: initialActiveVersion,
      reason: 'Khôi phục tự động qua test suite'
    }
  });
  console.log(`    [Admin]     Status: ${adminRoll.status} -> Message: ${adminRoll.data?.message}`);
  assert.equal(adminRoll.status, 200);
  assert.equal(adminRoll.data.status, 'ok');
  const rolledVersion = adminRoll.data.data.config_version;
  console.log(`    -> Đã rollback về v${initialActiveVersion}. Tạo release khôi phục mới: v${rolledVersion}`);
  assert.equal(rolledVersion, publishedVersion + 1, 'Rollback creates next release version');
  console.log('    ✓ API 6 ĐẠT CHUẨN (Khôi phục cấu hình từ snapshot lịch sử thành công)\n');

  console.log('================================================================');
  console.log('  TẤT CẢ 6/6 API ADMIN CONFIG ĐÃ VƯỢT QUA TEST CURL THÀNH CÔNG! ');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});

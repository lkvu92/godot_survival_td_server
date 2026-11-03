const assert = require('assert');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:3000';
const SESSION_SECRET = 'dev-session-secret-survival-td-nakama-2026-very-secure';

function getCookies(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return '';
  return setCookie.split(',').map(s => s.split(';')[0].trim()).join('; ');
}

function signHs256(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

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
    'Origin': BASE_URL,
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
  console.log('  TEST SUITE: ADMIN ITEM MANAGEMENT APIS (END-TO-END CURL)      ');
  console.log('================================================================\n');

  // 1. AUTH
  console.log('>>> [1] Đăng nhập Admin vào Web BFF ...');
  const adminLoginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'lkvu92@gmail.com', password: 'anhvancho' }
  });
  assert.equal(adminLoginRes.status, 200, 'Admin login failed');
  assert.equal(adminLoginRes.data.ok, true, 'Admin login ok must be true');
  const adminCookie = getCookies(adminLoginRes);
  const playerCookie = createPlayerCookie();
  console.log('    ✓ Admin đăng nhập thành công.');

  // 2. CHẶN QUYỀN
  console.log('\n>>> [2] Kiểm tra chặn người dùng không có quyền Admin (Fail-Closed) ...');
  const noAuthRes = await request('/api/admin/items');
  assert.equal(noAuthRes.status, 403, 'No session must return 403');
  console.log('    ✓ Request không có session bị chặn 403.');

  const playerRes = await request('/api/admin/items', { headers: { Cookie: playerCookie } });
  assert.equal(playerRes.status, 403, 'Player role must return 403');
  console.log('    ✓ Request với player cookie bị chặn 403.');

  const playerToggleRes = await request('/api/admin/items/stone_fire_low/toggle', {
    method: 'POST',
    headers: { Cookie: playerCookie },
    body: { active: false }
  });
  assert.equal(playerToggleRes.status, 403, 'Player toggle must return 403');
  console.log('    ✓ Request toggle không có quyền bị chặn 403.');

  // 3. GET /api/admin/items
  console.log('\n>>> [3] Test GET /api/admin/items (Phân trang, Lọc & Enrich Atlas Region) ...');
  const listRes = await request('/api/admin/items?page=1&limit=15&category=material', {
    headers: { Cookie: adminCookie }
  });
  assert.equal(listRes.status, 200);
  assert.equal(listRes.data.status, 'ok');
  assert.ok(Array.isArray(listRes.data.data.items), 'items must be an array');
  assert.ok(listRes.data.data.pagination, 'pagination metadata must exist');
  console.log(`    ✓ Lấy danh sách thành công: ${listRes.data.data.items.length} items trên trang 1.`);
  console.log(`    ✓ Phân trang: Tổng ${listRes.data.data.pagination.total_items} items, ${listRes.data.data.pagination.total_pages} trang.`);
  
  const sampleItem = listRes.data.data.items[0];
  console.log(`    ✓ Sample item: id=${sampleItem.id}, display_name="${sampleItem.display_name}", active=${sampleItem.active}`);
  if (sampleItem.atlas_region) {
    console.log(`    ✓ Atlas region enriched: path=${sampleItem.atlas_region.path}, rect=[${sampleItem.atlas_region.rect}]`);
  }

  // 4. GET /api/admin/items/[id]
  console.log('\n>>> [4] Test GET /api/admin/items/[id] (Chi tiết 1 item) ...');
  const itemDetailRes = await request('/api/admin/items/stone_fire_low', {
    headers: { Cookie: adminCookie }
  });
  assert.equal(itemDetailRes.status, 200);
  assert.equal(itemDetailRes.data.status, 'ok');
  assert.equal(itemDetailRes.data.data.id, 'stone_fire_low');
  console.log(`    ✓ Chi tiết stone_fire_low: "${itemDetailRes.data.data.display_name}", rarity: ${itemDetailRes.data.data.rarity}, tags:`, itemDetailRes.data.data.tags);

  // 5. PUT /api/admin/items/[id]
  console.log('\n>>> [5] Test PUT /api/admin/items/[id] (Cập nhật 1 item) ...');
  const updateRes = await request('/api/admin/items/stone_fire_low', {
    method: 'PUT',
    headers: { Cookie: adminCookie },
    body: {
      display_name: 'Đá Hỏa Thô Sơ (Updated)',
      attributes: { test_bonus: 777 }
    }
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.data.status, 'ok');
  assert.equal(updateRes.data.data.display_name, 'Đá Hỏa Thô Sơ (Updated)');
  assert.equal(updateRes.data.data.attributes.test_bonus, 777);
  console.log(`    ✓ Cập nhật thành công: display_name="${updateRes.data.data.display_name}"`);

  // Phục hồi lại tên cũ
  await request('/api/admin/items/stone_fire_low', {
    method: 'PUT',
    headers: { Cookie: adminCookie },
    body: {
      display_name: 'Đá Hỏa Thô',
      attributes: {}
    }
  });
  console.log('    ✓ Đã hoàn nguyên lại tên ban đầu.');

  // 6. POST /api/admin/items/[id]/toggle
  console.log('\n>>> [6] Test POST /api/admin/items/[id]/toggle (Bật/tắt active) ...');
  const toggleOffRes = await request('/api/admin/items/stone_fire_low/toggle', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { active: false }
  });
  assert.equal(toggleOffRes.status, 200);
  assert.equal(toggleOffRes.data.data.active, false);
  console.log('    ✓ Đã vô hiệu hóa item stone_fire_low (active: false).');

  const toggleOnRes = await request('/api/admin/items/stone_fire_low/toggle', {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: { active: true }
  });
  assert.equal(toggleOnRes.status, 200);
  assert.equal(toggleOnRes.data.data.active, true);
  console.log('    ✓ Đã kích hoạt lại item stone_fire_low (active: true).');

  // 7. PUT /api/admin/items/group-update
  console.log('\n>>> [7] Test PUT /api/admin/items/group-update (Cập nhật theo nhóm) ...');
  const groupRes = await request('/api/admin/items/group-update', {
    method: 'PUT',
    headers: { Cookie: adminCookie },
    body: {
      filter: { ids: ['stone_fire_low', 'stone_earth_low'] },
      updates: { tags: ['fire', 'material', 'rune_material'] }
    }
  });
  console.log('    Group update response status:', groupRes.status, 'data:', groupRes.data);
  assert.equal(groupRes.status, 200);
  assert.equal(groupRes.data.status, 'ok');
  assert.equal(groupRes.data.data.affected_count, 2);
  console.log(`    ✓ Cập nhật nhóm thành công: ${groupRes.data.data.affected_count} items ảnh hưởng.`);

  // 8. POST /api/items/batch
  console.log('\n>>> [8] Test POST /api/items/batch (Cross-Module Batch Lookup cho Store/Mail/Inventory) ...');
  const batchRes = await request('/api/items/batch', {
    method: 'POST',
    body: {
      ids: ['stone_fire_low', 'reset_talisman', 'non_existing_sample_item']
    }
  });
  assert.equal(batchRes.status, 200);
  assert.equal(batchRes.data.status, 'ok');
  const foundItems = batchRes.data.data.items;
  const missingIds = batchRes.data.data.missing_ids;
  console.log(`    ✓ Tìm thấy ${foundItems.length} items:`, foundItems.map(i => i.id));
  console.log(`    ✓ Missing items (${missingIds.length}):`, missingIds);
  assert.ok(foundItems.some(i => i.id === 'stone_fire_low'));
  assert.ok(foundItems.some(i => i.id === 'reset_talisman'));
  assert.ok(missingIds.includes('non_existing_sample_item'));

  // Kiểm tra sprite atlas enriched cho batch items
  const fireItem = foundItems.find(i => i.id === 'stone_fire_low');
  assert.ok(fireItem.atlas_region, 'stone_fire_low must have atlas_region enriched');
  console.log(`    ✓ stone_fire_low atlas enriched for store preview:`, fireItem.atlas_region.path);

  console.log('\n================================================================');
  console.log('   TẤT CẢ 8/8 ADMIN ITEM MANAGEMENT APIS ĐẠT CHUẨN PASS 100%!   ');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

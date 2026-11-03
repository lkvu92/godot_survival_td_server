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
  console.log('================================================================');
  console.log('    TEST SUITE: NAKAMA ITEM MANAGEMENT & BATCH RPCS (LIVE)      ');
  console.log('================================================================\n');

  console.log('>>> [1] Đăng nhập Admin & Non-Admin ...');
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
  console.log('    ✓ Admin và User thường đã đăng nhập thành công.\n');

  // --- TEST 1: admin_item_list ---
  console.log('>>> [2] Test admin_item_list (Phân trang & Lọc) ...');
  // 1a: Non-admin gọi -> Kỳ vọng 403
  const nonAdminList = await callRpc(userToken, 'admin_item_list', { page: 1, limit: 10 });
  assert.equal(nonAdminList.status, 403, 'Non-admin must be 403 on admin_item_list');
  console.log('    ✓ Non-admin bị chặn 403 khi gọi admin_item_list');

  // 1b: Admin lấy trang 1 (limit 10)
  const adminList = await callRpc(adminToken, 'admin_item_list', { page: 1, limit: 10 });
  assert.equal(adminList.status, 200);
  assert.equal(adminList.payload.success, true);
  const { items, pagination } = adminList.payload.data;
  console.log(`    ✓ Admin lấy trang 1 thành công: ${items.length} items / Tổng số ${pagination.total_items} items (Trang ${pagination.page}/${pagination.total_pages})`);
  assert(items.length <= 10, 'Items per page must <= limit');
  assert(pagination.total_items > 0, 'Total items must > 0');

  // 1c: Lọc theo category và search
  const filterList = await callRpc(adminToken, 'admin_item_list', {
    page: 1,
    limit: 10,
    category: 'material',
    search: 'Hỏa'
  });
  assert.equal(filterList.status, 200);
  console.log(`    ✓ Lọc category=material & search='Hỏa': tìm thấy ${filterList.payload.data.items.length} items`);

  // --- TEST 2: admin_item_get ---
  console.log('\n>>> [3] Test admin_item_get (Chi tiết 1 item) ...');
  const getItem = await callRpc(adminToken, 'admin_item_get', { id: 'stone_fire_low' });
  assert.equal(getItem.status, 200);
  assert.equal(getItem.payload.success, true);
  assert.equal(getItem.payload.data.id, 'stone_fire_low');
  console.log('    ✓ Lấy chi tiết stone_fire_low:', getItem.payload.data.display_name, '| tags:', getItem.payload.data.tags);

  // --- TEST 3: admin_item_update ---
  console.log('\n>>> [4] Test admin_item_update (Cập nhật 1 item) ...');
  const updateRes = await callRpc(adminToken, 'admin_item_update', {
    id: 'stone_fire_low',
    display_name: 'Đá Hỏa Thô Sơ',
    attributes: { test_gold_cost: 999 }
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.payload.success, true);
  console.log('    ✓ Cập nhật thành công:', updateRes.payload.message);

  // Verify lại
  const checkUpdated = await callRpc(adminToken, 'admin_item_get', { id: 'stone_fire_low' });
  assert.equal(checkUpdated.payload.data.display_name, 'Đá Hỏa Thô Sơ');
  assert.equal(checkUpdated.payload.data.attributes.test_gold_cost, 999);

  // Phục hồi lại tên cũ
  await callRpc(adminToken, 'admin_item_update', {
    id: 'stone_fire_low',
    display_name: 'Đá Hỏa Thô',
    attributes: {}
  });

  // --- TEST 4: admin_item_toggle ---
  console.log('\n>>> [5] Test admin_item_toggle (Bật/tắt active 1 item) ...');
  const deactRes = await callRpc(adminToken, 'admin_item_toggle', { id: 'stone_fire_low', active: false });
  assert.equal(deactRes.status, 200);
  assert.equal(deactRes.payload.data.active, false);
  console.log('    ✓ Đã vô hiệu hóa item stone_fire_low (active: false)');

  const actRes = await callRpc(adminToken, 'admin_item_toggle', { id: 'stone_fire_low', active: true });
  assert.equal(actRes.status, 200);
  assert.equal(actRes.payload.data.active, true);
  console.log('    ✓ Đã kích hoạt lại item stone_fire_low (active: true)');

  // --- TEST 5: admin_item_group_update ---
  console.log('\n>>> [6] Test admin_item_group_update (Cập nhật theo nhóm) ...');
  const groupRes = await callRpc(adminToken, 'admin_item_group_update', {
    scope: {
      filter_type: 'ids',
      item_ids: ['stone_fire_low', 'stone_earth_low']
    },
    actions: {
      add_tags: ['tested_batch_tag']
    },
    reason: 'Test batch tag addition'
  });
  assert.equal(groupRes.status, 200);
  assert.equal(groupRes.payload.success, true);
  console.log(`    ✓ Cập nhật nhóm thành công cho ${groupRes.payload.data.affected_count} items:`, groupRes.payload.data.affected_ids);

  // Dọn dẹp tag test
  await callRpc(adminToken, 'admin_item_group_update', {
    scope: { filter_type: 'ids', item_ids: ['stone_fire_low', 'stone_earth_low'] },
    actions: { remove_tags: ['tested_batch_tag'] },
    reason: 'Cleanup'
  });

  // --- TEST 6: item_batch_get (Phục vụ nơi khác: Package, Mailbox, Shop, Inventory) ---
  console.log('\n>>> [7] Test item_batch_get (Lookup danh sách IDs cho Package/Mail/Inventory) ...');
  const batchRes = await callRpc(userToken, 'item_batch_get', {
    ids: ['stone_fire_low', 'stone_earth_low', 'reset_talisman', 'non_existing_item_999']
  });
  assert.equal(batchRes.status, 200);
  assert.equal(batchRes.payload.success, true);
  const { items_by_id, missing_ids } = batchRes.payload.data;
  console.log('    ✓ Tra cứu hàng loạt thành công:');
  console.log('      - Tìm thấy:', Object.keys(items_by_id));
  console.log('      - Không tìm thấy (missing):', missing_ids);
  assert.equal(Object.keys(items_by_id).length, 3, 'Must find 3 items');
  assert.equal(missing_ids.length, 1, 'Must report 1 missing');
  assert.equal(missing_ids[0], 'non_existing_item_999');

  console.log('\n================================================================');
  console.log('   TẤT CẢ 6/6 NAKAMA ITEM RPCS ĐÃ VƯỢT QUA TEST LIVE 100%!     ');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});

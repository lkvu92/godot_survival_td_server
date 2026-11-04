// Survival TD — Game Packs / Store Management RPCs
// Authoritative Store Catalog & Rewards Administration

function formatNumberWithDot(n: number): string {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

interface PackRewardLineInput {
    reward_type: string;
    reward_id: string;
    quantity: number;
    metadata?: any;
}

interface PackSaveRequest {
    product_id: string;
    pack_id?: string;
    tab_id?: string;
    display_name: string;
    description?: string;
    badge?: string;
    icon_type?: string;
    icon_key?: string;
    fallback_price?: string;
    fulfillment_type?: string;
    active?: boolean;
    unique_purchase?: boolean;
    purchase_limit?: number;
    purchase_limit_period?: string;
    rewards?: PackRewardLineInput[];
}

/**
 * RPC: admin_pack_list
 * Lấy toàn bộ danh sách gói kèm danh sách reward lines từ PostgreSQL
 */
function rpcAdminPackList(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any = {};
    try { req = JSON.parse(payload || '{}'); } catch (_e) { req = {}; }

    // 1. Query all packs
    const whereClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (req.tab_id && typeof req.tab_id === 'string' && req.tab_id !== 'all') {
        whereClauses.push(`tab_id = $${pIdx}`);
        params.push(req.tab_id);
        pIdx++;
    }

    if (req.search && typeof req.search === 'string' && req.search.trim()) {
        const term = `%${req.search.trim().toLowerCase()}%`;
        whereClauses.push(`(LOWER(product_id) LIKE $${pIdx} OR LOWER(display_name) LIKE $${pIdx} OR LOWER(description) LIKE $${pIdx})`);
        params.push(term);
        pIdx++;
    }

    if (req.active !== undefined && req.active !== 'all') {
        const activeBool = req.active === true || req.active === 'true';
        whereClauses.push(`active = $${pIdx}`);
        params.push(activeBool);
        pIdx++;
    }

    if (req.purchase_type && typeof req.purchase_type === 'string' && req.purchase_type !== 'all') {
        if (req.purchase_type === 'unique') {
            whereClauses.push(`(unique_purchase = TRUE OR fulfillment_type = 'non_consumable')`);
        } else if (req.purchase_type === 'limited') {
            whereClauses.push(`unique_purchase = FALSE AND fulfillment_type <> 'non_consumable' AND purchase_limit > 0`);
        } else if (req.purchase_type === 'unlimited') {
            whereClauses.push(`unique_purchase = FALSE AND fulfillment_type <> 'non_consumable' AND purchase_limit = 0`);
        }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const packsQuery = `
        SELECT product_id, pack_id, tab_id, display_name, description, badge,
               icon_type, icon_key, fallback_price, google_product_type,
               fulfillment_type, active, unique_purchase, purchase_limit,
               purchase_limit_period, ui,
               EXTRACT(EPOCH FROM created_at)*1000 AS created_at_ms,
               EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at_ms
        FROM game_store_products
        ${whereSql}
        ORDER BY tab_id ASC, product_id ASC
    `;

    const packRows = nk.sqlQuery(packsQuery, params);

    // 2. Query all rewards for these packs
    const rewardsQuery = `
        SELECT r.product_id, r.line_no, r.reward_type, r.reward_id, r.quantity, r.metadata,
               i.display_name AS item_display_name, i.rarity AS item_rarity, i.category AS item_category, i.icon_id AS item_icon_id
        FROM game_store_product_rewards r
        LEFT JOIN game_items i ON r.reward_id = i.id
        ORDER BY r.product_id ASC, r.line_no ASC
    `;
    const rewardRows = nk.sqlQuery(rewardsQuery, []);

    // Group rewards by product_id
    const rewardsByProduct: Record<string, any[]> = {};
    for (let i = 0; i < rewardRows.length; i++) {
        const r = rewardRows[i];
        const pid = String(r.product_id);
        if (!rewardsByProduct[pid]) rewardsByProduct[pid] = [];
        rewardsByProduct[pid].push({
            line_no: Number(r.line_no),
            reward_type: String(r.reward_type),
            reward_id: String(r.reward_id),
            quantity: Number(r.quantity),
            metadata: parseJsonbSafe(r.metadata),
            item_display_name: r.item_display_name ? String(r.item_display_name) : null,
            item_rarity: r.item_rarity ? String(r.item_rarity) : null,
            item_category: r.item_category ? String(r.item_category) : null,
            item_icon_id: r.item_icon_id ? String(r.item_icon_id) : null,
        });
    }

    // 3. Assemble complete packs
    let totalPacks = 0;
    let activePacks = 0;
    let inactivePacks = 0;
    let uniquePacks = 0;
    let limitedPacks = 0;
    let unlimitedPacks = 0;
    const tabCounts: Record<string, number> = {};

    const packs = packRows.map((row: any) => {
        const pid = String(row.product_id);
        const isActive = row.active === true;
        const tab = String(row.tab_id || 'supplemental');
        const isUnique = row.unique_purchase === true || String(row.fulfillment_type) === 'non_consumable';
        const isLimited = !isUnique && Number(row.purchase_limit || 0) > 0;

        totalPacks++;
        if (isActive) activePacks++; else inactivePacks++;
        if (isUnique) uniquePacks++;
        else if (isLimited) limitedPacks++;
        else unlimitedPacks++;

        tabCounts[tab] = (tabCounts[tab] || 0) + 1;

        return {
            product_id: pid,
            pack_id: String(row.pack_id),
            tab_id: tab,
            display_name: String(row.display_name),
            description: String(row.description || ''),
            badge: String(row.badge || ''),
            icon_type: String(row.icon_type || 'pack'),
            icon_key: String(row.icon_key || ''),
            fallback_price: String(row.fallback_price || '$0.99'),
            google_product_type: String(row.google_product_type || 'inapp'),
            fulfillment_type: isUnique ? 'non_consumable' : String(row.fulfillment_type || 'consumable'),
            active: isActive,
            unique_purchase: isUnique,
            purchase_limit: Number(row.purchase_limit) || 0,
            purchase_limit_period: String(row.purchase_limit_period || ''),
            ui: parseJsonbSafe(row.ui),
            created_at_ms: Number(row.created_at_ms) || 0,
            updated_at_ms: Number(row.updated_at_ms) || 0,
            rewards: rewardsByProduct[pid] || [],
        };
    });

    return JSON.stringify({
        success: true,
        data: {
            packs,
            stats: {
                total_packs: totalPacks,
                active_packs: activePacks,
                inactive_packs: inactivePacks,
                unique_packs: uniquePacks,
                limited_packs: limitedPacks,
                unlimited_packs: unlimitedPacks,
                tab_counts: tabCounts,
            }
        }
    });
}

/**
 * RPC: admin_pack_get
 * Xem chi tiết 1 gói theo product_id
 */
function rpcAdminPackGet(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any = {};
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }

    const productId = String(req.product_id || '').trim();
    if (!productId) return JSON.stringify({ success: false, code: 400, message: 'product_id is required' });

    const rows = nk.sqlQuery(`
        SELECT product_id, pack_id, tab_id, display_name, description, badge,
               icon_type, icon_key, fallback_price, google_product_type,
               fulfillment_type, active, unique_purchase, purchase_limit,
               purchase_limit_period, ui,
               EXTRACT(EPOCH FROM created_at)*1000 AS created_at_ms,
               EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at_ms
        FROM game_store_products WHERE product_id = $1
    `, [productId]);

    if (!rows.length) return JSON.stringify({ success: false, code: 404, message: 'Pack not found' });

    const pack = rows[0];
    const rewards = nk.sqlQuery(`
        SELECT r.line_no, r.reward_type, r.reward_id, r.quantity, r.metadata,
               i.display_name AS item_display_name, i.rarity AS item_rarity, i.category AS item_category, i.icon_id AS item_icon_id
        FROM game_store_product_rewards r
        LEFT JOIN game_items i ON r.reward_id = i.id
        WHERE r.product_id = $1
        ORDER BY r.line_no ASC
    `, [productId]).map((r: any) => ({
        line_no: Number(r.line_no),
        reward_type: String(r.reward_type),
        reward_id: String(r.reward_id),
        quantity: Number(r.quantity),
        metadata: parseJsonbSafe(r.metadata),
        item_display_name: r.item_display_name ? String(r.item_display_name) : null,
        item_rarity: r.item_rarity ? String(r.item_rarity) : null,
        item_category: r.item_category ? String(r.item_category) : null,
        item_icon_id: r.item_icon_id ? String(r.item_icon_id) : null,
    }));

    return JSON.stringify({
        success: true,
        data: {
            product_id: String(pack.product_id),
            pack_id: String(pack.pack_id),
            tab_id: String(pack.tab_id),
            display_name: String(pack.display_name),
            description: String(pack.description || ''),
            badge: String(pack.badge || ''),
            icon_type: String(pack.icon_type || 'pack'),
            icon_key: String(pack.icon_key || ''),
            fallback_price: String(pack.fallback_price || '$0.99'),
            google_product_type: String(pack.google_product_type || 'inapp'),
            fulfillment_type: String(pack.fulfillment_type || 'consumable'),
            active: pack.active === true,
            unique_purchase: pack.unique_purchase === true,
            purchase_limit: Number(pack.purchase_limit) || 0,
            purchase_limit_period: String(pack.purchase_limit_period || ''),
            ui: parseJsonbSafe(pack.ui),
            created_at_ms: Number(pack.created_at_ms) || 0,
            updated_at_ms: Number(pack.updated_at_ms) || 0,
            rewards,
        }
    });
}

/**
 * RPC: admin_pack_save
 * Tạo mới hoặc Cập nhật gói vật phẩm kèm toàn bộ danh sách reward lines
 */
function rpcAdminPackSave(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: PackSaveRequest;
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }

    const productId = String(req.product_id || '').trim().toLowerCase();
    if (!productId || !/^[a-z0-9_]{2,40}$/.test(productId)) {
        return JSON.stringify({ success: false, code: 400, message: 'product_id must be 2-40 lowercase alphanumeric chars or underscore' });
    }

    const displayName = String(req.display_name || '').trim();
    if (!displayName) return JSON.stringify({ success: false, code: 400, message: 'display_name is required' });

    const packId = String(req.pack_id || productId).trim().toLowerCase();
    const tabId = String(req.tab_id || 'resources').trim().toLowerCase();
    const description = String(req.description || '').trim();
    const badge = String(req.badge || '').trim();
    const iconType = String(req.icon_type || 'pack').trim();
    const iconKey = String(req.icon_key || productId).trim();
    const fallbackPrice = String(req.fallback_price || '$0.99').trim();
    const uniquePurchase = req.unique_purchase === true || String(req.fulfillment_type) === 'non_consumable';
    const fulfillmentType = uniquePurchase ? 'non_consumable' : String(req.fulfillment_type || 'consumable').trim();
    const active = req.active === true;
    const purchaseLimit = uniquePurchase ? 0 : Math.max(0, Number(req.purchase_limit) || 0);
    const purchaseLimitPeriod = uniquePurchase ? '' : String(req.purchase_limit_period || '').trim().toLowerCase();
    const rewards = Array.isArray(req.rewards) ? req.rewards : [];

    // Query existing UI to preserve presentation fields
    const existingRows = nk.sqlQuery('SELECT ui FROM game_store_products WHERE product_id = $1', [productId]);
    const existingUi = existingRows.length ? (parseJsonbSafe(existingRows[0].ui) || {}) : {};

    // Build unified UI config matching game client expectations
    const uiObj: any = {
        ...existingUi,
        id: packId,
        product_id: productId,
        name: displayName,
        title: displayName,
        desc: description,
        subtitle: description,
        badge: badge,
        price: fallbackPrice,
        display_price: fallbackPrice,
        tab_id: tabId,
        icon_type: iconType,
        icon_key: iconKey,
        fulfillment_type: fulfillmentType,
        unique_purchase: uniquePurchase,
        active: active,
        purchase_limit: purchaseLimit,
        purchase_limit_period: purchaseLimitPeriod,
        rewards: rewards.map(r => ({ reward_type: r.reward_type, reward_id: r.reward_id, quantity: r.quantity })),
    };

    if (tabId === 'first_topup') {
        const heroReward = rewards.find(r => r.reward_type === 'hero');
        const heroId = heroReward ? heroReward.reward_id : (uiObj.hero_id || 'hero_5');
        uiObj.hero_id = heroId;

        // Query hero display name
        const heroRows = nk.sqlQuery('SELECT display_name FROM game_heroes WHERE id = $1', [heroId]);
        const heroName = heroRows.length ? String(heroRows[0].display_name) : 'Vạn Tượng Quán Âm';
        uiObj.hero_name = heroName;
        uiObj.hero_role = 'Đại Thừa Cảnh • Trợ Chiến & Trị Liệu';

        // Tự động sinh presentation_rewards đồng bộ 1:1 với danh sách rewards thực tế
        const dynamicPresentation: any[] = [];
        for (const r of rewards) {
            const rType = String(r.reward_type || 'item').trim();
            const rId = String(r.reward_id || '').trim();
            const qty = Number(r.quantity) || 1;

            if (rType === 'hero') {
                dynamicPresentation.push({
                    id: rId,
                    name: `Tướng 5★: ${heroName}`,
                    desc: 'Sở hữu ngay nhân vật hỗ trợ tối thượng',
                    icon_type: 'hero',
                    icon_key: rId,
                    quantity: qty,
                    quantity_text: '1',
                    rarity: 'legendary',
                });
            } else if (rType === 'currency' && (rId === 'gems' || rId === 'gem')) {
                dynamicPresentation.push({
                    id: `gems_${qty}`,
                    name: `${formatNumberWithDot(qty)} Đá Quý`,
                    desc: 'Tài nguyên triệu hồi và mua sắm quý giá',
                    icon_type: 'pack',
                    icon_key: 'gem_sack',
                    quantity: qty,
                    quantity_text: qty >= 1000 ? `${qty / 1000}K` : String(qty),
                    rarity: 'epic',
                });
            } else if (rType === 'currency' && (rId === 'gold' || rId === 'coin')) {
                dynamicPresentation.push({
                    id: `gold_${qty}`,
                    name: `${formatNumberWithDot(qty)} Vàng`,
                    desc: 'Nâng cấp kỹ năng và cường hóa ngũ hành',
                    icon_type: 'pack',
                    icon_key: 'gold_chest',
                    quantity: qty,
                    quantity_text: qty >= 1000 ? `${qty / 1000}K` : String(qty),
                    rarity: 'epic',
                });
            } else if (rType === 'entitlement' && rId === 'no_ads_seconds') {
                const days = Math.round(qty / 86400);
                dynamicPresentation.push({
                    id: `no_ads_${days}d`,
                    name: `${days} Ngày Bỏ Quảng Cáo`,
                    desc: 'Trải nghiệm mượt mà không bị làm phiền',
                    icon_type: 'extra',
                    icon_key: 'no_ads',
                    quantity: days,
                    quantity_text: `${days}d`,
                    rarity: 'rare',
                });
            } else if (rType === 'stamina') {
                dynamicPresentation.push({
                    id: `stamina_${qty}`,
                    name: `${qty} Thể Lực`,
                    desc: 'Hồi phục thể lực tức thì',
                    icon_type: 'pack',
                    icon_key: 'stamina_pack',
                    quantity: qty,
                    quantity_text: String(qty),
                    rarity: 'rare',
                });
            } else {
                const itemRows = nk.sqlQuery('SELECT display_name, description, icon_id, rarity FROM game_items WHERE id = $1', [rId]);
                const item = itemRows.length ? itemRows[0] : null;
                const rarity = item ? String(item.rarity || 'common') : 'common';
                dynamicPresentation.push({
                    id: rId,
                    name: item ? String(item.display_name) : rId,
                    desc: item ? String(item.description || '') : '',
                    icon_type: 'item',
                    icon_key: item ? String(item.icon_id || rId) : rId,
                    quantity: qty,
                    quantity_text: qty > 1 ? `x${qty}` : '1',
                    rarity: rarity,
                });
            }
        }
        uiObj.presentation_rewards = dynamicPresentation;
    }

    // 1. Upsert game_store_products with UI JSON
    const upsertSql = `
        INSERT INTO game_store_products(
            product_id, pack_id, tab_id, display_name, description, badge,
            icon_type, icon_key, fallback_price, google_product_type, fulfillment_type,
            active, unique_purchase, purchase_limit, purchase_limit_period, ui, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 'inapp', $10, $11, $12, $13, $14, $15::jsonb, NOW()
        )
        ON CONFLICT (product_id) DO UPDATE SET
            pack_id = EXCLUDED.pack_id,
            tab_id = EXCLUDED.tab_id,
            display_name = EXCLUDED.display_name,
            description = EXCLUDED.description,
            badge = EXCLUDED.badge,
            icon_type = EXCLUDED.icon_type,
            icon_key = EXCLUDED.icon_key,
            fallback_price = EXCLUDED.fallback_price,
            fulfillment_type = EXCLUDED.fulfillment_type,
            active = EXCLUDED.active,
            unique_purchase = EXCLUDED.unique_purchase,
            purchase_limit = EXCLUDED.purchase_limit,
            purchase_limit_period = EXCLUDED.purchase_limit_period,
            ui = EXCLUDED.ui,
            updated_at = NOW()
        RETURNING product_id, pack_id, tab_id, display_name, active, fallback_price
    `;

    const saved = nk.sqlQuery(upsertSql, [
        productId, packId, tabId, displayName, description, badge,
        iconType, iconKey, fallbackPrice, fulfillmentType,
        active, uniquePurchase, purchaseLimit, purchaseLimitPeriod,
        JSON.stringify(uiObj)
    ]);

    if (!saved.length) {
        return JSON.stringify({ success: false, code: 500, message: 'Failed to save store product' });
    }

    // 2. Replace rewards
    nk.sqlExec('DELETE FROM game_store_product_rewards WHERE product_id = $1', [productId]);
    for (let i = 0; i < rewards.length; i++) {
        const line = rewards[i];
        const rType = String(line.reward_type || 'item').trim();
        const rId = String(line.reward_id || '').trim();
        const qty = Math.max(1, Number(line.quantity) || 1);
        const meta = typeof line.metadata === 'object' && line.metadata !== null ? JSON.stringify(line.metadata) : '{}';

        if (rId) {
            nk.sqlExec(`
                INSERT INTO game_store_product_rewards(product_id, line_no, reward_type, reward_id, quantity, metadata)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            `, [productId, i + 1, rType, rId, qty, meta]);
        }
    }

    return JSON.stringify({
        success: true,
        message: `Lưu gói '${displayName}' thành công!`,
        data: {
            product_id: productId,
            pack_id: packId,
            display_name: displayName,
            active,
            rewards_count: rewards.length,
        }
    });
}

/**
 * RPC: admin_pack_toggle
 * Bật hoặc tắt nhanh cờ active của gói
 */
function rpcAdminPackToggle(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any = {};
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }

    const productId = String(req.product_id || '').trim();
    if (!productId) return JSON.stringify({ success: false, code: 400, message: 'product_id is required' });

    const active = req.active === true || req.active === 'true';

    const rows = nk.sqlQuery(`
        UPDATE game_store_products
        SET active = $2,
            ui = jsonb_set(COALESCE(ui, '{}'::jsonb), '{active}', to_jsonb($2::bool), true),
            updated_at = NOW()
        WHERE product_id = $1
        RETURNING product_id, display_name, active
    `, [productId, active]);

    if (!rows.length) return JSON.stringify({ success: false, code: 404, message: 'Pack not found' });

    const updated = rows[0];
    const statusText = active ? 'Đang mở bán' : 'Tạm dừng bán';

    return JSON.stringify({
        success: true,
        message: `Đã chuyển trạng thái gói '${updated.display_name}' sang: ${statusText}`,
        data: {
            product_id: String(updated.product_id),
            display_name: String(updated.display_name),
            active: updated.active === true,
        }
    });
}

/**
 * RPC: admin_pack_delete
 * Xóa gói hoặc chuyển active = false nếu có ràng buộc khóa ngoại với đơn hàng
 */
function rpcAdminPackDelete(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any = {};
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }

    const productId = String(req.product_id || '').trim();
    if (!productId) return JSON.stringify({ success: false, code: 400, message: 'product_id is required' });

    // Kiểm tra xem có đơn hàng thanh toán nào tham chiếu tới gói này không
    const orderChecks = nk.sqlQuery('SELECT COUNT(*)::INT AS order_count FROM monetization_purchase_orders WHERE product_id = $1', [productId]);
    const hasOrders = orderChecks.length > 0 && Number(orderChecks[0].order_count) > 0;

    if (hasOrders) {
        // Nếu đã có lịch sử nạp tiền thực tế, chỉ tắt active để bảo tồn lịch sử đối soát tài chính
        nk.sqlExec('UPDATE game_store_products SET active = FALSE, updated_at = NOW() WHERE product_id = $1', [productId]);
        return JSON.stringify({
            success: true,
            message: `Gói '${productId}' đã có lịch sử giao dịch nên đã được chuyển sang trạng thái Vô hiệu hóa (Active = False) để bảo toàn đối soát.`,
            data: { product_id: productId, deleted: false, archived: true }
        });
    }

    // Nếu chưa có đơn hàng, xóa sạch reward lines và product
    nk.sqlExec('DELETE FROM game_store_product_rewards WHERE product_id = $1', [productId]);
    nk.sqlExec('DELETE FROM game_store_platform_products WHERE product_id = $1', [productId]);
    const del = nk.sqlQuery('DELETE FROM game_store_products WHERE product_id = $1 RETURNING product_id', [productId]);

    if (!del.length) return JSON.stringify({ success: false, code: 404, message: 'Pack not found' });

    return JSON.stringify({
        success: true,
        message: `Đã xóa hoàn toàn gói '${productId}'.`,
        data: { product_id: productId, deleted: true }
    });
}


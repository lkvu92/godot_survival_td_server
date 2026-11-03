// Survival TD — Item Management & Cross-Module Batch Lookup RPCs
// C258 / C256 — Authoritative Item Catalog Management

function parseJsonbSafe(val: any, fallback: any = {}): any {
    if (!val) return fallback;
    // Kiểm tra nếu là byte array hoặc TypedArray (Uint8Array từ Go runtime)
    if (typeof val === 'object' && val !== null && typeof val.length === 'number' && val.length > 0 && typeof val[0] === 'number') {
        try {
            let str = '';
            for (let i = 0; i < val.length; i++) {
                str += String.fromCharCode(val[i]);
            }
            return JSON.parse(str);
        } catch (_e) {
            return fallback;
        }
    }
    if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (_e) { return fallback; }
    }
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    if (Array.isArray(val)) return val;
    return fallback;
}

/**
 * RPC: admin_item_list
 * Hỗ trợ phân trang, tìm kiếm full-text, lọc theo tag/category/rarity/active.
 */
function rpcAdminItemList(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any = {};
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }

    const page = Math.max(1, Number(req.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Search query: id, display_name, description
    if (req.search && typeof req.search === 'string' && req.search.trim()) {
        const term = `%${req.search.trim().toLowerCase()}%`;
        whereClauses.push(`(LOWER(id) LIKE $${paramIndex} OR LOWER(display_name) LIKE $${paramIndex} OR LOWER(description) LIKE $${paramIndex})`);
        params.push(term);
        paramIndex++;
    }

    // Category
    if (req.category && typeof req.category === 'string' && req.category !== 'all') {
        whereClauses.push(`category = $${paramIndex}`);
        params.push(req.category);
        paramIndex++;
    }

    // Rarity
    if (req.rarity && typeof req.rarity === 'string' && req.rarity !== 'all') {
        whereClauses.push(`rarity = $${paramIndex}`);
        params.push(req.rarity);
        paramIndex++;
    }

    // Active
    if (req.active !== undefined && req.active !== 'all') {
        const isActive = req.active === true || req.active === 'true';
        whereClauses.push(`active = $${paramIndex}`);
        params.push(isActive);
        paramIndex++;
    }

    // Tag (dùng JSONB containment: tags @> '["tag"]')
    if (req.tag && typeof req.tag === 'string' && req.tag !== 'all') {
        whereClauses.push(`tags @> $${paramIndex}::jsonb`);
        params.push(JSON.stringify([req.tag.trim()]));
        paramIndex++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Validate Sort field
    const allowedSortFields: Record<string, string> = {
        sort_order: 'sort_order',
        id: 'id',
        display_name: 'display_name',
        rarity: 'rarity',
        category: 'category',
        created_at: 'created_at',
        updated_at: 'updated_at',
    };
    const sortField = allowedSortFields[req.sort_by] || 'sort_order';
    const sortDir = req.sort_dir === 'desc' ? 'DESC' : 'ASC';

    // 1. Đếm tổng số bản ghi
    const countQuery = `SELECT COUNT(*) AS total FROM game_items ${whereSql}`;
    const countRows = nk.sqlQuery(countQuery, params);
    const total = countRows.length > 0 ? Number(countRows[0].total || 0) : 0;

    // 2. Lấy trang dữ liệu
    const selectQuery = `
        SELECT id, display_name, description, category, rarity, icon_id,
               stackable, max_stack, sort_order, expires_after_hours,
               tags, attributes, active,
               EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at_ms,
               EXTRACT(EPOCH FROM created_at)*1000 AS created_at_ms
        FROM game_items
        ${whereSql}
        ORDER BY ${sortField} ${sortDir}, id ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const rows = nk.sqlQuery(selectQuery, [...params, limit, offset]);

    const items = rows.map((r: any) => ({
        id: String(r.id),
        display_name: String(r.display_name),
        description: String(r.description || ''),
        category: String(r.category || ''),
        rarity: String(r.rarity || 'common'),
        icon_id: String(r.icon_id || ''),
        stackable: Boolean(r.stackable),
        max_stack: Number(r.max_stack || 1),
        sort_order: Number(r.sort_order || 0),
        expires_after_hours: Number(r.expires_after_hours || 0),
        tags: parseJsonbSafe(r.tags, []),
        attributes: parseJsonbSafe(r.attributes, {}),
        active: Boolean(r.active),
        updated_at_ms: Number(r.updated_at_ms || 0),
        created_at_ms: Number(r.created_at_ms || 0),
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return JSON.stringify({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total_items: total,
                total_pages: totalPages,
                has_next: page < totalPages,
                has_prev: page > 1,
            },
        },
    });
}

/**
 * RPC: admin_item_get
 * Lấy chi tiết 1 item.
 */
function rpcAdminItemGet(ctx: nkruntime.Context, _l: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any = {};
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }
    if (!req.id || typeof req.id !== 'string') {
        return JSON.stringify({ success: false, code: 400, message: 'item id is required' });
    }

    const rows = nk.sqlQuery(`
        SELECT id, display_name, description, category, rarity, icon_id,
               stackable, max_stack, sort_order, expires_after_hours,
               tags, attributes, active,
               EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at_ms
        FROM game_items WHERE id = $1
    `, [req.id]);

    if (rows.length === 0) {
        return JSON.stringify({ success: false, code: 404, message: `Item '${req.id}' not found` });
    }

    const r = rows[0];
    const item = {
        id: String(r.id),
        display_name: String(r.display_name),
        description: String(r.description || ''),
        category: String(r.category || ''),
        rarity: String(r.rarity || 'common'),
        icon_id: String(r.icon_id || ''),
        stackable: Boolean(r.stackable),
        max_stack: Number(r.max_stack || 1),
        sort_order: Number(r.sort_order || 0),
        expires_after_hours: Number(r.expires_after_hours || 0),
        tags: parseJsonbSafe(r.tags, []),
        attributes: parseJsonbSafe(r.attributes, {}),
        active: Boolean(r.active),
        updated_at_ms: Number(r.updated_at_ms || 0),
    };

    return JSON.stringify({ success: true, data: item });
}

/**
 * RPC: admin_item_update
 * Cập nhật thông tin và thuộc tính 1 vật phẩm.
 */
function rpcAdminItemUpdate(ctx: nkruntime.Context, _l: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any;
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }
    if (!req.id || typeof req.id !== 'string') {
        return JSON.stringify({ success: false, code: 400, message: 'Item id is required' });
    }

    const existing = nk.sqlQuery("SELECT * FROM game_items WHERE id = $1", [req.id]);
    if (existing.length === 0) {
        return JSON.stringify({ success: false, code: 404, message: `Item '${req.id}' not found` });
    }
    const current = existing[0];

    const displayName = req.display_name !== undefined ? String(req.display_name) : String(current.display_name);
    const description = req.description !== undefined ? String(req.description) : String(current.description || '');
    const category = req.category !== undefined ? String(req.category) : String(current.category || '');
    const rarity = req.rarity !== undefined ? String(req.rarity) : String(current.rarity || 'common');
    const iconId = req.icon_id !== undefined ? String(req.icon_id) : String(current.icon_id || '');
    const stackable = req.stackable !== undefined ? Boolean(req.stackable) : Boolean(current.stackable);
    const maxStack = req.max_stack !== undefined ? Number(req.max_stack) : Number(current.max_stack || 1);
    const sortOrder = req.sort_order !== undefined ? Number(req.sort_order) : Number(current.sort_order || 0);
    const expiresAfterHours = req.expires_after_hours !== undefined ? Number(req.expires_after_hours) : Number(current.expires_after_hours || 0);
    const active = req.active !== undefined ? Boolean(req.active) : Boolean(current.active);

    const tagsJson = req.tags !== undefined ? JSON.stringify(Array.isArray(req.tags) ? req.tags : []) : (typeof current.tags === 'string' ? current.tags : JSON.stringify(parseJsonbSafe(current.tags, [])));
    const attributesJson = req.attributes !== undefined ? JSON.stringify(typeof req.attributes === 'object' ? req.attributes : {}) : (typeof current.attributes === 'string' ? current.attributes : JSON.stringify(parseJsonbSafe(current.attributes, {})));

    nk.sqlExec(`
        UPDATE game_items
        SET display_name = $1, description = $2, category = $3, rarity = $4, icon_id = $5,
            stackable = $6, max_stack = $7, sort_order = $8, expires_after_hours = $9,
            tags = $10::jsonb, attributes = $11::jsonb, active = $12, updated_at = NOW()
        WHERE id = $13
    `, [
        displayName, description, category, rarity, iconId,
        stackable, maxStack, sortOrder, expiresAfterHours,
        tagsJson, attributesJson, active, req.id
    ]);

    const updatedRows = nk.sqlQuery(`
        SELECT id, display_name, description, category, rarity, icon_id,
               stackable, max_stack, sort_order, expires_after_hours,
               tags, attributes, active,
               EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at_ms
        FROM game_items WHERE id = $1
    `, [req.id]);

    let updatedItem: any = { id: req.id, active };
    if (updatedRows.length > 0) {
        const u = updatedRows[0];
        updatedItem = {
            id: String(u.id),
            display_name: String(u.display_name),
            description: String(u.description || ''),
            category: String(u.category || ''),
            rarity: String(u.rarity || 'common'),
            icon_id: String(u.icon_id || ''),
            stackable: Boolean(u.stackable),
            max_stack: Number(u.max_stack || 1),
            sort_order: Number(u.sort_order || 0),
            expires_after_hours: Number(u.expires_after_hours || 0),
            tags: parseJsonbSafe(u.tags, []),
            attributes: parseJsonbSafe(u.attributes, {}),
            active: Boolean(u.active),
            updated_at_ms: Number(u.updated_at_ms || 0),
        };
    }

    return JSON.stringify({
        success: true,
        message: `Updated item '${req.id}' successfully`,
        data: updatedItem
    });
}

/**
 * RPC: admin_item_toggle
 * Bật hoặc tắt trạng thái active của 1 item.
 */
function rpcAdminItemToggle(ctx: nkruntime.Context, _l: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any;
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }
    if (!req.id || typeof req.id !== 'string' || typeof req.active !== 'boolean') {
        return JSON.stringify({ success: false, code: 400, message: 'id and active (boolean) are required' });
    }

    nk.sqlExec("UPDATE game_items SET active = $1, updated_at = NOW() WHERE id = $2", [req.active, req.id]);

    return JSON.stringify({
        success: true,
        message: `${req.active ? 'Activated' : 'Deactivated'} item '${req.id}'`,
        data: { id: req.id, active: req.active }
    });
}

/**
 * RPC: admin_item_group_update
 * Cập nhật thuộc tính hàng loạt theo nhóm (scope: category/tag hoặc danh sách item_ids).
 */
function rpcAdminItemGroupUpdate(ctx: nkruntime.Context, _l: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!isConfigAdmin(ctx)) throw { message: 'Forbidden', code: 7 };

    let req: any;
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }
    if (!req.scope || !req.actions) {
        return JSON.stringify({ success: false, code: 400, message: 'scope and actions are required' });
    }

    const { scope, actions } = req;
    const whereClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (scope.filter_type === 'ids' && Array.isArray(scope.item_ids) && scope.item_ids.length > 0) {
        whereClauses.push(`id = ANY($${pIdx})`);
        params.push(scope.item_ids);
        pIdx++;
    } else {
        if (scope.category && typeof scope.category === 'string') {
            whereClauses.push(`category = $${pIdx}`);
            params.push(scope.category);
            pIdx++;
        }
        if (scope.tag && typeof scope.tag === 'string') {
            whereClauses.push(`tags @> $${pIdx}::jsonb`);
            params.push(JSON.stringify([scope.tag]));
            pIdx++;
        }
    }

    if (whereClauses.length === 0) {
        return JSON.stringify({ success: false, code: 400, message: 'Target scope cannot be empty' });
    }

    // Lấy danh sách item mục tiêu
    const targetRows = nk.sqlQuery(`SELECT id, tags, attributes FROM game_items WHERE ${whereClauses.join(' AND ')}`, params);
    if (targetRows.length === 0) {
        return JSON.stringify({ success: true, message: 'No items matched the scope', data: { affected_count: 0, affected_ids: [] } });
    }

    const affectedIds: string[] = [];
    for (const row of targetRows) {
        const id = String(row.id);
        let tags: string[] = parseJsonbSafe(row.tags, []);
        let attributes: Record<string, unknown> = parseJsonbSafe(row.attributes, {});

        // Add tags
        if (Array.isArray(actions.add_tags) && actions.add_tags.length > 0) {
            const set = new Set([...tags, ...actions.add_tags]);
            tags = Array.from(set);
        }

        // Remove tags
        if (Array.isArray(actions.remove_tags) && actions.remove_tags.length > 0) {
            const removeSet = new Set(actions.remove_tags);
            tags = tags.filter((t: string) => !removeSet.has(t));
        }

        // Patch attributes
        if (actions.attribute_patches && typeof actions.attribute_patches === 'object') {
            attributes = Object.assign({}, attributes, actions.attribute_patches);
        }

        const updates: string[] = ['updated_at = NOW()'];
        const uParams: any[] = [];
        let uIdx = 1;

        if (actions.set_active !== undefined) {
            updates.push(`active = $${uIdx}`);
            uParams.push(Boolean(actions.set_active));
            uIdx++;
        }
        if (actions.rarity && typeof actions.rarity === 'string') {
            updates.push(`rarity = $${uIdx}`);
            uParams.push(actions.rarity);
            uIdx++;
        }

        updates.push(`tags = $${uIdx}::jsonb`);
        uParams.push(JSON.stringify(tags));
        uIdx++;

        updates.push(`attributes = $${uIdx}::jsonb`);
        uParams.push(JSON.stringify(attributes));
        uIdx++;

        uParams.push(id);
        nk.sqlExec(`UPDATE game_items SET ${updates.join(', ')} WHERE id = $${uIdx}`, uParams);
        affectedIds.push(id);
    }

    return JSON.stringify({
        success: true,
        message: `Group update applied to ${affectedIds.length} item(s)`,
        data: {
            affected_count: affectedIds.length,
            affected_ids: affectedIds,
        },
    });
}

/**
 * RPC: item_batch_get (Public / Authenticated Lookup)
 * Tra cứu thông tin metadata của một danh sách IDs để hiển thị ở Package, Mailbox, Shop, Kho đồ.
 */
function rpcItemBatchGet(_ctx: nkruntime.Context, _l: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    let req: any = {};
    try { req = JSON.parse(payload || '{}'); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: 'Invalid JSON' }); }

    const ids = Array.isArray(req.ids) ? req.ids.filter((id: any) => typeof id === 'string' && id.trim()) : [];
    if (ids.length === 0) {
        return JSON.stringify({ success: true, data: { items: [], items_by_id: {}, missing_ids: [] } });
    }

    // Giới hạn tra cứu tối đa 200 items mỗi lượt
    const safeIds = ids.slice(0, 200);

    const rows = nk.sqlQuery(`
        SELECT id, display_name, category, rarity, icon_id,
               stackable, max_stack, sort_order, tags, active
        FROM game_items
        WHERE id = ANY($1)
    `, [safeIds]);

    const itemsById: Record<string, any> = {};
    const itemsList: any[] = [];
    const foundSet = new Set<string>();

    for (const r of rows) {
        const it = {
            id: String(r.id),
            display_name: String(r.display_name),
            category: String(r.category || ''),
            rarity: String(r.rarity || 'common'),
            icon_id: String(r.icon_id || ''),
            stackable: Boolean(r.stackable),
            max_stack: Number(r.max_stack || 1),
            sort_order: Number(r.sort_order || 0),
            tags: parseJsonbSafe(r.tags, []),
            active: Boolean(r.active),
        };
        itemsById[it.id] = it;
        itemsList.push(it);
        foundSet.add(it.id);
    }

    const missingIds = safeIds.filter((id: string) => !foundSet.has(id));

    return JSON.stringify({
        success: true,
        data: {
            items: itemsList,
            items_by_id: itemsById,
            missing_ids: missingIds,
        },
    });
}

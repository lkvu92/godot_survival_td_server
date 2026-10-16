interface StoreRewardLine {
    reward_type: string;
    reward_id: string;
    quantity: number;
    metadata?: any;
}

const MONETIZATION_PRODUCTS: { [key: string]: number } = {
    remove_ads_1d: 24 * 60 * 60,
    remove_ads_3d: 3 * 24 * 60 * 60,
    remove_ads_7d: 7 * 24 * 60 * 60,
    remove_ads_30d: 30 * 24 * 60 * 60,
    remove_ads_permanent: 100 * 365 * 24 * 60 * 60,
};

const DEFAULT_REWARDED_PLACEMENTS: { [key: string]: any } = {
    main_menu_stamina: { type: "stamina", amount: 5 },
    stamina_dialog_ad: { type: "stamina", amount: 5 },
    card_reroll_ad: { type: "card_reroll", amount: 1 },
    talisman_enhance_charm_ad: { type: "item", amount: 1, item_id: "talisman_enhance_charm", daily_limit: 1 },
    element_enlightenment_charm_ad: { type: "item", amount: 1, item_id: "element_enlightenment_charm", daily_limit: 1 },
};

function rewardedAdsConfig(nk: nkruntime.Nakama): any {
    const rows = nk.sqlQuery("SELECT payload FROM game_content_configs WHERE id='rewarded_ads' AND active=TRUE", []);
    const config = rows.length ? objectValue(parseJsonb(rows[0].payload)) : {};
    const placements = objectValue(config.placements);
    for (const id of Object.keys(placements)) {
        const entry = placements[id];
        if (!entry || !Number.isSafeInteger(entry.amount) || entry.amount <= 0
            || (entry.daily_limit !== undefined && (!Number.isSafeInteger(entry.daily_limit) || entry.daily_limit <= 0))) return {};
    }
    const mission = placements.daily_mission_talisman_fragment_ad;
    if (mission && (!config.daily_mission || config.daily_mission.completion_count !== mission.daily_limit)) return {};
    return config;
}

function canonicalRewardPlacement(id: string): string {
    return id === "main_menu_stamina" ? "stamina_dialog_ad" : id;
}

const MAX_CARD_REROLLS_PER_RUN = 3;
let vipRuntimeMode = "production";

function objectValue(value: any): any {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readActiveRun(nk: nkruntime.Nakama, userId: string, runId: string): any {
    const objects = nk.storageRead([{ collection: "player_stage_runs", key: "active", userId }]);
    if (objects.length === 0) return null;
    const object = objects[0];
    const run = objectValue(object.value);
    if (String(run.run_id || "") !== runId || String(run.status || "") !== "active" || Date.now() > Number(run.expires_at_ms || 0)) {
        return null;
    }
    return { object, run };
}

function reserveDailyRewardClaim(nk: nkruntime.Nakama, userId: string, placementId: string, adSessionId: string, limit: number): any {
    placementId = canonicalRewardPlacement(placementId);
    const existing = nk.sqlQuery("SELECT claim_slot, reward_date::TEXT AS reward_date FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
    if (existing.length) return existing[0];
    // Concurrent requests can select the same slot. The primary key wins;
    // retry a bounded number of times to claim another still-free slot.
    for (let attempt = 0; attempt < limit; attempt++) {
        const rows = nk.sqlQuery(`INSERT INTO monetization_daily_reward_claims
            (user_id, placement_id, ad_session_id, reward_date, claim_slot)
            SELECT $1,$2,$3,(NOW() AT TIME ZONE 'UTC')::DATE, slot
            FROM generate_series(1,$4::INT) slot
            WHERE NOT EXISTS (SELECT 1 FROM monetization_daily_reward_claims c
                WHERE c.user_id=$1 AND c.placement_id=$2 AND c.reward_date=(NOW() AT TIME ZONE 'UTC')::DATE AND c.claim_slot=slot)
            ORDER BY slot LIMIT 1 ON CONFLICT DO NOTHING
            RETURNING claim_slot, reward_date::TEXT AS reward_date`, [userId, placementId, adSessionId, limit]);
        if (rows.length) return rows[0];
        const raced = nk.sqlQuery("SELECT claim_slot, reward_date::TEXT AS reward_date FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
        if (raced.length) return raced[0];
    }
    return null;
}

function monetizationMode(ctx: nkruntime.Context): string {
    const environment = String(ctx.env.APP_ENVIRONMENT || ctx.env.MONETIZATION_MODE || "develop").toLowerCase();
    if (environment === "production") return "production";
    if (environment === "mock") return "mock";
    return "sandbox";
}

function environmentValue(ctx: nkruntime.Context, baseName: string): string {
    const suffix = monetizationMode(ctx) === "production" ? "PRODUCTION" : "DEVELOP";
    return String(ctx.env[`${baseName}_${suffix}`] || "");
}

function monetizationError(code: number, message: string): string {
    return JSON.stringify({ status: "error", code, message });
}

function readEntitlementRow(nk: nkruntime.Nakama, userId: string): any {
    const rows = nk.sqlQuery(
        `SELECT user_id,
                COALESCE(EXTRACT(EPOCH FROM no_ads_expires_at)::BIGINT, 0) AS no_ads_expires_at,
                source, last_product_id,
                (EXTRACT(EPOCH FROM updated_at) * 1000000)::BIGINT AS revision,
                EXTRACT(EPOCH FROM NOW())::BIGINT AS server_time
         FROM player_monetization_entitlements
         WHERE user_id = $1`,
        [userId]
    );
    if (rows.length > 0) return rows[0];
    const nowRows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM NOW())::BIGINT AS server_time", []);
    return {
        user_id: userId,
        no_ads_expires_at: 0,
        revision: 0,
        source: "",
        last_product_id: "",
        server_time: nowRows.length > 0 ? Number(nowRows[0].server_time || 0) : Math.floor(Date.now() / 1000),
    };
}

function buildDailyRewardStatus(nk: nkruntime.Nakama, userId: string): any {
    const interrupted = nk.sqlQuery(`SELECT ad_session_id FROM monetization_ad_rewards
        WHERE user_id=$1 AND status='verified' AND reward_type IN ('stamina','item','daily_fragment')
        ORDER BY created_at LIMIT 32`, [userId]);
    for (const session of interrupted) {
        try { grantPreparedReward(nk, userId, String(session.ad_session_id), ""); }
        catch (_e) { /* A storage-version conflict is retried on the next sync. */ }
    }
    const claims = nk.sqlQuery(
        `SELECT placement_id, ad_session_id FROM monetization_daily_reward_claims
         WHERE user_id = $1 AND reward_date = (NOW() AT TIME ZONE 'UTC')::DATE`, [userId]);
    const claimed: { [key: string]: number } = {};
    for (const claim of claims) {
        const id = canonicalRewardPlacement(String(claim.placement_id || ""));
        claimed[id] = (claimed[id] || 0) + 1;
    }
    const dailyRewards: any = {};
    const definitions = objectValue(rewardedAdsConfig(nk).placements);
    for (const placementId in definitions) {
        const limit = Math.max(0, Number(definitions[placementId].daily_limit || 0));
        if (limit <= 0) continue;
        const used = Math.min(limit, claimed[placementId] || 0);
        dailyRewards[placementId] = { limit, claimed: used, remaining: Math.max(0, limit - used) };
        if (claims.some(c => canonicalRewardPlacement(String(c.placement_id)) === placementId && String(c.ad_session_id || "").indexOf("merge:") === 0)) {
            dailyRewards[placementId].blocked_by_account_link = true;
        }
    }
    const mission = nk.sqlQuery("SELECT item_id, granted_at IS NOT NULL AS completed FROM monetization_daily_fragment_rewards WHERE user_id=$1 AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE", [userId]);
    if (dailyRewards.daily_mission_talisman_fragment_ad) Object.assign(dailyRewards.daily_mission_talisman_fragment_ad,
        { completed: mission.length > 0 && mission[0].completed === true, item_id: mission.length ? String(mission[0].item_id) : "" });
    return dailyRewards;
}

function vipConfig(nk: nkruntime.Nakama): any {
    const rows = nk.sqlQuery("SELECT payload FROM game_content_configs WHERE id='vip' AND active=TRUE", []);
    if (rows.length === 0) return null;
    const config = objectValue(parseJsonb(rows[0].payload));
    const levels = Array.isArray(config.levels) ? config.levels : [];
    let previous = 0;
    if (levels.length !== Number(config.max_level) || levels.length === 0) return null;
    for (let i = 0; i < levels.length; i++) {
        const threshold = Number(levels[i].min_exp);
        if (Number(levels[i].level) !== i + 1 || !Number.isSafeInteger(threshold) || threshold <= previous) return null;
        previous = threshold;
    }
    const products = objectValue(config.product_exp);
    for (const id of Object.keys(products)) {
        if (!Number.isSafeInteger(Number(products[id])) || Number(products[id]) <= 0) return null;
    }
    return config;
}

function vipProgress(exp: number, config: any, environment: string): any {
    exp = Math.max(0, Math.floor(exp));
    let level = 0, minimum = 0, next = 0;
    const levels: any[] = config && Array.isArray(config.levels) ? config.levels : [];
    for (const entry of levels) {
        if (exp >= Number(entry.min_exp)) { level = Number(entry.level); minimum = Number(entry.min_exp); }
        else { next = Number(entry.min_exp); break; }
    }
    const maxed = levels.length > 0 && level === levels.length;
    return { level, exp, level_min_exp: minimum, next_level_exp: next,
        remaining_exp: maxed ? 0 : Math.max(0, next - exp), maxed, environment, configured: !!config };
}

function readVipProgress(nk: nkruntime.Nakama, userId: string, mode: string): any {
    const config = vipConfig(nk);
    if (!config) return vipProgress(0, null, mode);
    // Durable reconciliation recovers a crash after fulfillment, and safely
    // backfills classified history. Unknown legacy environments are quarantined.
    nk.sqlExec(`INSERT INTO player_vip_credits (purchase_id, user_id, environment, exp)
        SELECT p.id, p.user_id,
            CASE WHEN COALESCE(o.vip_environment,'') <> '' THEN o.vip_environment
                 WHEN p.purchase_token_hash LIKE 'mock:%' THEN 'mock' ELSE 'legacy' END,
            COALESCE(o.vip_exp, ($2::jsonb ->> p.product_id)::BIGINT, 0)
        FROM monetization_purchases p
        LEFT JOIN monetization_purchase_orders o ON o.id = COALESCE(NULLIF(p.purchase_order_id,''), p.request_id)
        WHERE p.user_id=$1 AND p.verified_at IS NOT NULL AND p.status IN ('verified','consumed')
          AND (o.id IS NULL OR o.status='fulfilled')
        ON CONFLICT (purchase_id) DO NOTHING`, [userId, JSON.stringify(config.product_exp || {})]);
    const rows = nk.sqlQuery(`SELECT COALESCE(SUM(CASE WHEN p.status IN ('verified','consumed') THEN c.exp ELSE 0 END),0)::BIGINT AS exp,
        (COUNT(*) * 2 + COUNT(*) FILTER (WHERE p.status='voided'))::BIGINT AS revision
        FROM player_vip_credits c JOIN monetization_purchases p ON p.id=c.purchase_id
        WHERE c.user_id=$1 AND c.environment=$2`, [userId, mode]);
    return Object.assign(vipProgress(Number(rows.length ? rows[0].exp : 0), config, mode), { user_id: userId, revision: Number(rows.length ? rows[0].revision : 0) });
}

function auditLegacyVipOrder(ctx: nkruntime.Context, nk: nkruntime.Nakama, order: any, receipt: string): void {
    if (order.vip_environment || !receipt) return;
    const mode = monetizationMode(ctx);
    if (mode === "mock") return;
    const validation = nk.purchaseValidateGoogle(ctx.userId, receipt, true);
    const purchase = (validation.validatedPurchases || []).find((p: any) => p.productId === order.product_id && isLinkedReceiptOwner(nk,p.userId,ctx.userId));
    if (!purchase || !purchase.transactionId || Number(purchase.refundTime || 0) > 0) throw new Error("Legacy purchase could not be verified");
    if (mode === "production" && String(purchase.environment).toLowerCase() !== "production") throw new Error("Legacy test purchase cannot grant production VIP");
    const wire = JSON.parse(receipt);
    const token = String(wire.purchaseToken || wire.purchase_token || "");
    if (!token) throw new Error("Legacy receipt has no purchase token");
    const hashes = nk.sqlQuery("SELECT encode(sha256(convert_to($1, 'UTF8')), 'hex') AS token_hash", [token]);
    if (!hashes.length || String(hashes[0].token_hash) !== String(order.purchase_token_hash)) throw new Error("Legacy receipt does not match order");
    const config = vipConfig(nk);
    const exp = Number(config && config.product_exp ? config.product_exp[order.product_id] : NaN);
    if (!Number.isSafeInteger(exp) || exp <= 0) throw new Error("Legacy VIP product mapping is missing");
    nk.sqlExec("UPDATE monetization_purchase_orders SET vip_exp=COALESCE(vip_exp,$2), vip_environment=$3 WHERE id=$1 AND vip_environment='' AND status='fulfilled'", [order.id, exp, mode]);
    nk.sqlExec(`UPDATE player_vip_credits c SET environment=$2
        FROM monetization_purchases p WHERE p.id=c.purchase_id AND p.user_id=$1
          AND p.purchase_token_hash=$3 AND c.environment='legacy'`, [ctx.userId, mode, String(hashes[0].token_hash)]);
}

function buildMonetizationResponse(nk: nkruntime.Nakama, userId: string, mode: string): any {
    const row = readEntitlementRow(nk, userId);
    const serverTime = Number(row.server_time || Math.floor(Date.now() / 1000));
    const expiresAt = Number(row.no_ads_expires_at || 0);
    return {
        mode,
        user_id: userId,
        vip: readVipProgress(nk, userId, mode),
        server_time: serverTime,
        no_ads: {
            active: expiresAt > serverTime,
            expires_at: expiresAt,
            remaining_seconds: Math.max(0, expiresAt - serverTime),
            source: String(row.source || ""),
            last_product_id: String(row.last_product_id || ""),
            revision: Number(row.revision || 0),
        },
        ads: {
            rewarded_enabled: true,
            interstitial_enabled: true,
            interstitial_min_interval_seconds: 120,
        },
        daily_rewards: buildDailyRewardStatus(nk, userId),
        daily_rewards_date: new Date(serverTime * 1000).toISOString().slice(0, 10),
    };
}

function mirrorEntitlementStorage(nk: nkruntime.Nakama, userId: string, value: any): void {
    const existing = nk.storageRead([{ collection: "player_entitlements", key: "ads", userId }]);
    const write: nkruntime.StorageWriteRequest = {
        collection: "player_entitlements",
        key: "ads",
        userId,
        value,
        permissionRead: 1,
        permissionWrite: 0,
    };
    if (existing.length > 0) write.version = existing[0].version;
    nk.storageWrite([write]);
}

function applyNoAdsGrant(
    nk: nkruntime.Nakama,
    userId: string,
    requestId: string,
    platform: string,
    productId: string,
    tokenHash: string,
    orderId: string,
    grantedSeconds: number,
    source: string,
    purchaseOrderId: string
): any {
    if (tokenHash) {
        const duplicateToken = nk.sqlQuery(
            "SELECT user_id FROM monetization_purchases WHERE purchase_token_hash = $1",
            [tokenHash]
        );
        if (duplicateToken.length > 0) {
            if (String(duplicateToken[0].user_id) !== userId) throw new Error("Purchase token belongs to another account");
            return { applied: false, monetization: buildMonetizationResponse(nk, userId, source === "debug" ? "mock" : "production") };
        }
    }
    const rows = nk.sqlQuery(
        `WITH inserted AS (
            INSERT INTO monetization_purchases
                (request_id, user_id, platform, product_id, purchase_token_hash, order_id,
                 status, granted_seconds, purchased_at, verified_at, consumed_at, purchase_order_id)
            VALUES ($1, $2, $3, $4, $5, $6, 'consumed', $7, NOW(), NOW(), NOW(), $9)
            ON CONFLICT (request_id) DO NOTHING
            RETURNING granted_seconds
        ), entitlement AS (
            INSERT INTO player_monetization_entitlements
                (user_id, no_ads_expires_at, source, last_product_id, updated_at)
            SELECT $2, NOW() + make_interval(secs => granted_seconds), $8, $4, NOW()
            FROM inserted
            ON CONFLICT (user_id) DO UPDATE SET
                no_ads_expires_at = GREATEST(
                    NOW(),
                    COALESCE(player_monetization_entitlements.no_ads_expires_at, NOW())
                ) + ($7 * INTERVAL '1 second'),
                source = EXCLUDED.source,
                last_product_id = EXCLUDED.last_product_id,
                updated_at = NOW()
            RETURNING EXTRACT(EPOCH FROM no_ads_expires_at)::BIGINT AS expires_at
        )
        SELECT expires_at FROM entitlement`,
        [requestId, userId, platform, productId, tokenHash, orderId, grantedSeconds, source, purchaseOrderId]
    );

    const response = buildMonetizationResponse(nk, userId, source === "debug" ? "mock" : "production");
    mirrorEntitlementStorage(nk, userId, {
        no_ads_expires_at: response.no_ads.expires_at,
        source: response.no_ads.source,
        last_product_id: response.no_ads.last_product_id,
        updated_at: response.server_time,
    });
    return { applied: rows.length > 0, monetization: response };
}

const getMonetizationStatus: nkruntime.RpcFunction = (ctx, _logger, nk, _payload) => {
    if (!ctx.userId) return monetizationError(401, "Authentication required");
    return JSON.stringify({ status: "success", data: buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx)) });
};

function addStoreInventoryItem(nk: nkruntime.Nakama, inventory: any[], itemId: string, quantity: number): void {
    const definitions = nk.sqlQuery("SELECT stackable, max_stack FROM game_items WHERE id = $1", [itemId]);
    if (definitions.length === 0) throw new Error(`Unknown catalog item: ${itemId}`);
    const definition = definitions[0];
    if (definition.stackable === false) {
        for (let i = 0; i < quantity; i++) inventory.push({ item_id: itemId, quantity: 1, acquired_at: new Date().toISOString() });
        return;
    }
    let remaining = quantity;
    const maxStack = Math.max(1, Number(definition.max_stack || 999));
    for (const entry of inventory) {
        if (remaining <= 0) break;
        if (!entry || String(entry.item_id || "") !== itemId) continue;
        const added = Math.min(Math.max(0, maxStack - Number(entry.quantity || 0)), remaining);
        entry.quantity = Number(entry.quantity || 0) + added;
        remaining -= added;
    }
    while (remaining > 0) {
        const amount = Math.min(maxStack, remaining);
        inventory.push({ item_id: itemId, quantity: amount, acquired_at: new Date().toISOString() });
        remaining -= amount;
    }
}

function applyPurchaseStorageRewards(
    nk: nkruntime.Nakama, userId: string, grantId: string, productId: string,
    fulfillmentType: string, rewards: StoreRewardLine[]
): any {
    const profileObjects = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
    if (profileObjects.length === 0) throw new Error("Player profile does not exist");
    const profile = profileObjects[0].value || {};
    const profileGrants: string[] = Array.isArray(profile._iap_reward_ids)
        ? profile._iap_reward_ids.map((value: any) => String(value)) : [];
    if (profileGrants.indexOf(grantId) < 0) {
        const resources = profile.resources || {};
        rewards.filter(line => line.reward_type === "currency").forEach(line => {
            resources[line.reward_id] = Math.max(0, Number(resources[line.reward_id] || 0)) + Number(line.quantity);
        });
        profile.resources = resources;
        rewards.filter(line => line.reward_type === "stamina").forEach(line => {
            profile.stamina = Math.min(30, Math.max(0, Number(profile.stamina || 0)) + Number(line.quantity));
        });
        const entitlements = profile.iap_entitlements || {};
        rewards.filter(line => line.reward_type === "entitlement" && line.reward_id !== "no_ads_seconds").forEach(line => {
            entitlements[line.reward_id] = Math.max(0, Number(entitlements[line.reward_id] || 0)) + Number(line.quantity);
        });
        profile.iap_entitlements = entitlements;
        if (fulfillmentType === "non_consumable") {
            const owned: string[] = Array.isArray(profile.owned_iap_products)
                ? profile.owned_iap_products.map((value: any) => String(value)) : [];
            if (owned.indexOf(productId) < 0) owned.push(productId);
            profile.owned_iap_products = owned;
        }
        profileGrants.push(grantId);
        profile._iap_reward_ids = profileGrants.slice(-200);
        nk.storageWrite([{
            collection: "player_profiles", key: "main", userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: profileObjects[0].version,
        }]);
    }

    const heroRewards = rewards.filter(line => line.reward_type === "hero");
    if (heroRewards.length > 0) {
        const heroObjects = nk.storageRead([{ collection: "player_heroes", key: "states", userId }]);
        if (heroObjects.length === 0) throw new Error("Player heroes do not exist");
        const heroValue = heroObjects[0].value || {};
        const heroGrants: string[] = Array.isArray(heroValue._iap_reward_ids)
            ? heroValue._iap_reward_ids.map((value: any) => String(value)) : [];
        if (heroGrants.indexOf(grantId) < 0) {
            const heroes: any[] = Array.isArray(heroValue.heroes) ? heroValue.heroes : [];
            heroRewards.forEach(line => {
                const hero = heroes.find((value: any) => value && String(value.hero_id || "") === line.reward_id);
                if (hero) hero.owned = true;
                else heroes.push({ hero_id: line.reward_id, level: 1, exp: 0, next_level_exp: 1000, owned: true, current_attribute: {} });
            });
            heroValue.heroes = heroes;
            heroGrants.push(grantId);
            heroValue._iap_reward_ids = heroGrants.slice(-200);
            nk.storageWrite([{
                collection: "player_heroes", key: "states", userId, value: heroValue,
                permissionRead: 1, permissionWrite: 0, version: heroObjects[0].version,
            }]);
        }
    }

    const itemRewards = rewards.filter(line => line.reward_type === "item");
    if (itemRewards.length > 0) {
        const objects = nk.storageRead([{ collection: "player_inventory", key: "items", userId }]);
        if (objects.length === 0) throw new Error("Player inventory does not exist");
        const value = objects[0].value || {};
        const grants: string[] = Array.isArray(value._iap_reward_ids) ? value._iap_reward_ids.map((v: any) => String(v)) : [];
        if (grants.indexOf(grantId) < 0) {
            const inventory: any[] = Array.isArray(value.items) ? value.items : [];
            itemRewards.forEach(line => addStoreInventoryItem(nk, inventory, line.reward_id, Number(line.quantity)));
            value.items = inventory;
            grants.push(grantId);
            value._iap_reward_ids = grants.slice(-200);
            nk.storageWrite([{ collection: "player_inventory", key: "items", userId, value,
                permissionRead: 1, permissionWrite: 0, version: objects[0].version }]);
        }
    }
    return { resources: profile.resources || {}, stamina: Number(profile.stamina || 0), rewards };
}

const createPurchaseOrder: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return monetizationError(401, "Authentication required");
    if (!isRemoteFlagEnabled(nk, "payment_enabled")) return monetizationError(403, "Payments are disabled");
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return monetizationError(400, "Invalid JSON"); }
    const productId = String(req.product_id || "");
    const products = nk.sqlQuery("SELECT * FROM game_store_products WHERE product_id = $1 AND active = TRUE", [productId]);
    if (products.length === 0) return monetizationError(404, "Product is unavailable");
    const product = products[0];

    const previous = nk.sqlQuery(
        "SELECT id, status, fulfillment_type FROM monetization_purchase_orders WHERE user_id = $1 AND product_id = $2 AND status IN ('pending','fulfilled') ORDER BY created_at DESC",
        [ctx.userId, productId]
    );
    const fulfilled = previous.filter((row: any) => String(row.status) === "fulfilled");
    if (product.unique_purchase === true && fulfilled.length > 0) {
        return JSON.stringify({ status: "success", data: { purchase_order_id: String(fulfilled[0].id),
            product_id: productId, fulfillment_type: String(product.fulfillment_type), already_fulfilled: true }, idempotent: true });
    }
    if (product.unique_purchase === true) {
        const legacy = nk.sqlQuery(
            "SELECT id FROM monetization_purchases WHERE user_id = $1 AND product_id = $2 AND status <> 'voided' LIMIT 1",
            [ctx.userId, productId]
        );
        if (legacy.length > 0) return JSON.stringify({ status: "success", data: {
            purchase_order_id: "", product_id: productId, fulfillment_type: String(product.fulfillment_type),
            already_fulfilled: true }, idempotent: true });
    }
    const pending = previous.find((row: any) => String(row.status) === "pending");
    if (pending) {
        return JSON.stringify({ status: "success", data: { purchase_order_id: String(pending.id),
            product_id: productId, fulfillment_type: String(product.fulfillment_type) }, idempotent: true });
    }
    if (Number(product.purchase_limit || 0) > 0 && String(product.purchase_limit_period) === "day") {
        const today = nk.sqlQuery(`SELECT COUNT(*)::INT AS count FROM monetization_purchase_orders
            WHERE user_id = $1 AND product_id = $2 AND status = 'fulfilled'
              AND fulfilled_at >= DATE_TRUNC('day', NOW())`, [ctx.userId, productId]);
        if (Number(today[0].count || 0) >= Number(product.purchase_limit)) return monetizationError(409, "Daily purchase limit reached");
    }

    const rewardRows = nk.sqlQuery(
        "SELECT reward_type, reward_id, quantity, metadata FROM game_store_product_rewards WHERE product_id = $1 ORDER BY line_no",
        [productId]
    );
    const rewards: StoreRewardLine[] = rewardRows.map((row: any) => ({ reward_type: String(row.reward_type),
        reward_id: String(row.reward_id), quantity: Number(row.quantity), metadata: parseJsonb(row.metadata) || {} }))
        .filter((line: StoreRewardLine) => !line.metadata || line.metadata.condition !== "first_purchase" || fulfilled.length === 0);
    if (rewards.length === 0) return monetizationError(409, "Product has no fulfillment lines");
    const vip = vipConfig(nk);
    const vipExp = Number(vip && vip.product_exp ? vip.product_exp[productId] : NaN);
    if (!Number.isSafeInteger(vipExp) || vipExp <= 0) return monetizationError(409, "VIP product config is missing; seed vip config before selling this pack");
    const orderId = nk.uuidv4();
    nk.sqlExec(`INSERT INTO monetization_purchase_orders
        (id, user_id, product_id, status, reward_snapshot, fulfillment_type, vip_exp, vip_environment)
        VALUES ($1,$2,$3,'pending',$4::jsonb,$5,$6,$7)`,
        [orderId, ctx.userId, productId, JSON.stringify(rewards), String(product.fulfillment_type), vipExp, monetizationMode(ctx)]);
    return JSON.stringify({ status: "success", data: { purchase_order_id: orderId, product_id: productId,
        fulfillment_type: String(product.fulfillment_type), rewards } });
};

const iapGoogleClaim: nkruntime.RpcFunction = (ctx, logger, nk, payload) => {
    if (!ctx.userId) return monetizationError(401, "Authentication required");
    if (!isRemoteFlagEnabled(nk, "payment_enabled")) return monetizationError(403, "Payments are disabled");
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return monetizationError(400, "Invalid JSON"); }
    const purchaseOrderId = String(req.purchase_order_id || "");
    const receipt = String(req.receipt || "");
    if (!purchaseOrderId) return monetizationError(400, "purchase_order_id is required");
    const orders = nk.sqlQuery("SELECT * FROM monetization_purchase_orders WHERE id = $1 AND user_id = $2", [purchaseOrderId, ctx.userId]);
    if (orders.length === 0) return monetizationError(404, "Purchase order not found");
    const order = orders[0];
    const productId = String(order.product_id);
    const fulfillmentType = String(order.fulfillment_type);
    const rewardSnapshot: StoreRewardLine[] = parseJsonb(order.reward_snapshot) || [];
    if (String(order.status) === "fulfilled") {
        try { auditLegacyVipOrder(ctx, nk, order, receipt); }
        catch (e) { return monetizationError(409, "Legacy VIP receipt audit failed: " + String(e)); }
        const data = buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx));
        data.reward = { product_id: productId, purchase_order_id: purchaseOrderId, fulfillment_type: fulfillmentType };
        return JSON.stringify({ status: "success", data, idempotent: true });
    }
    if (String(order.status) !== "pending") return monetizationError(409, "Purchase order is not claimable");

    const mode = monetizationMode(ctx);
    let transactionId = "";
    let purchaseTokenHash = "";
    let seenBefore = false;
    let receiptOwner = ctx.userId;
    if (order.vip_environment && String(order.vip_environment) !== mode) return monetizationError(409, "Purchase order environment does not match server");
    // Pending orders created before C115 receive their snapshot before any
    // rewards are granted. Already-fulfilled legacy orders remain auditable.
    if (order.vip_exp === null || order.vip_exp === undefined || !order.vip_environment) {
        const config = vipConfig(nk);
        const exp = Number(config && config.product_exp ? config.product_exp[productId] : NaN);
        if (!Number.isSafeInteger(exp) || exp <= 0) return monetizationError(409, "VIP config is missing");
        nk.sqlExec("UPDATE monetization_purchase_orders SET vip_exp=$2, vip_environment=$3 WHERE id=$1 AND status='pending' AND vip_exp IS NULL", [purchaseOrderId, exp, mode]);
    }
    if (mode === "mock") {
        transactionId = purchaseOrderId;
    } else {
        if (!receipt) return monetizationError(400, "receipt is required");
        let validation: nkruntime.ValidatePurchaseResponse;
        try {
            validation = nk.purchaseValidateGoogle(ctx.userId, receipt, true);
        } catch (e) {
            logger.warn("Google purchase validation failed user=%s product=%s error=%s", ctx.userId, productId, String(e));
            return monetizationError(409, "Purchase is not valid");
        }
        const purchases = validation.validatedPurchases || [];
        const purchase = purchases.find((value: nkruntime.ValidatedPurchase) =>
            value && value.productId === productId && isLinkedReceiptOwner(nk,value.userId,ctx.userId));
        if (!purchase || !purchase.transactionId) return monetizationError(409, "Validated product does not match claim");
        receiptOwner = String(purchase.userId);
        if (mode === "production" && String(purchase.environment).toLowerCase() !== "production") return monetizationError(409, "Test purchase cannot grant production rewards");
        transactionId = String(purchase.transactionId);
        seenBefore = Boolean(purchase.seenBefore);
        let receiptData: any;
        try { receiptData = JSON.parse(receipt); } catch (_e) { return monetizationError(400, "Invalid Google receipt JSON"); }
        const validatedToken = String(receiptData.purchaseToken || receiptData.purchase_token || "");
        if (!validatedToken) return monetizationError(409, "Validated receipt has no purchase token");
        const hashRows = nk.sqlQuery(
            "SELECT encode(sha256(convert_to($1, 'UTF8')), 'hex') AS token_hash",
            [validatedToken]
        );
        purchaseTokenHash = hashRows.length > 0 ? String(hashRows[0].token_hash || "") : "";
        if (!purchaseTokenHash) return monetizationError(500, "Could not fingerprint purchase");
    }

    try {
        const grantId = mode === "mock" ? `mock:${transactionId}` : purchaseTokenHash;
        const existing = nk.sqlQuery(
            "SELECT user_id, product_id, COALESCE(NULLIF(purchase_order_id,''),request_id) AS original_order_id FROM monetization_purchases WHERE purchase_token_hash = $1 OR request_id = $2",
            [grantId, purchaseOrderId]
        );
        if (existing.length > 0) {
            if (String(existing[0].user_id) !== ctx.userId || String(existing[0].product_id) !== productId) {
                return monetizationError(409, "Purchase belongs to another claim");
            }
            const originalOrderId=String(existing[0].original_order_id||purchaseOrderId);
            if (originalOrderId!==purchaseOrderId) {
                // A restored token is already attached to its original order.
                // Do not collide with purchase_orders_token_uq or mint a second order credit.
                nk.sqlExec("UPDATE monetization_purchase_orders SET status='superseded',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='pending'",[purchaseOrderId,ctx.userId]);
                const data=buildMonetizationResponse(nk,ctx.userId,mode);
                data.reward={product_id:productId,purchase_order_id:originalOrderId,fulfillment_type:fulfillmentType};
                return JSON.stringify({status:"success",data,idempotent:true});
            }
            nk.sqlExec(`UPDATE monetization_purchase_orders SET status='fulfilled', transaction_id=$2,
                purchase_token_hash=$3, validated_at=COALESCE(validated_at, NOW()),
                fulfilled_at=COALESCE(fulfilled_at, NOW()), updated_at=NOW() WHERE id=$1`,
                [purchaseOrderId, transactionId, grantId]);
            const data = buildMonetizationResponse(nk, ctx.userId, mode);
            data.reward = { product_id: productId, purchase_order_id: purchaseOrderId,
                fulfillment_type: fulfillmentType, lines: rewardSnapshot };
            return JSON.stringify({ status: "success", data, idempotent: true });
        }
        if (receiptOwner !== ctx.userId) return monetizationError(409, "Historical linked-account receipt requires support audit; rewards were not replayed");
        const granted = applyPurchaseStorageRewards(nk, ctx.userId, grantId, productId, fulfillmentType, rewardSnapshot);
        const noAdsSeconds = rewardSnapshot.filter(line => line.reward_type === "entitlement" && line.reward_id === "no_ads_seconds")
            .reduce((total, line) => total + Number(line.quantity), 0);
        if (noAdsSeconds > 0) {
            applyNoAdsGrant(nk, ctx.userId, purchaseOrderId, "android", productId, grantId, transactionId,
                noAdsSeconds, mode === "mock" ? "debug" : "google_play", purchaseOrderId);
        } else {
            nk.sqlExec(
                `INSERT INTO monetization_purchases
                    (request_id, user_id, platform, product_id, purchase_token_hash, order_id,
                     status, granted_seconds, purchased_at, verified_at, purchase_order_id)
                 VALUES ($1, $2, 'android', $3, $4, $5, 'verified', 0, NOW(), NOW(), $1)
                 ON CONFLICT DO NOTHING`,
                [purchaseOrderId, ctx.userId, productId, grantId, transactionId]
            );
        }
        nk.sqlExec(`UPDATE monetization_purchase_orders SET status='fulfilled', transaction_id=$2,
            purchase_token_hash=$3, validated_at=NOW(), fulfilled_at=NOW(), updated_at=NOW()
            WHERE id=$1 AND status='pending'`, [purchaseOrderId, transactionId, grantId]);
        const data = buildMonetizationResponse(nk, ctx.userId, mode);
        data.reward = { product_id: productId, purchase_order_id: purchaseOrderId,
            fulfillment_type: fulfillmentType, profile: granted, lines: rewardSnapshot };
        return JSON.stringify({ status: "success", data, idempotent: seenBefore });
    } catch (e) {
        logger.error("iap_google_claim failed user=%s product=%s: %s", ctx.userId, productId, String(e));
        return monetizationError(500, "Could not grant purchase");
    }
};

// Keep the previous RPC available during rolling client deployments.
const syncPlayPurchase: nkruntime.RpcFunction = iapGoogleClaim;

const prepareRewardedAd: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return monetizationError(401, "Authentication required");
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return monetizationError(400, "Invalid JSON"); }
    const placementId = canonicalRewardPlacement(String(req.placement_id || ""));
    const reward = objectValue(rewardedAdsConfig(nk).placements)[placementId];
    if (!reward) return monetizationError(400, "Unknown rewarded placement or missing rewarded_ads config");
    const requestId = String(req.request_id || nk.uuidv4());
    if (requestId.length > 128) return monetizationError(400, "Invalid reward request ID");
    let sessions = nk.sqlQuery("SELECT * FROM monetization_ad_rewards WHERE user_id=$1 AND client_request_id=$2", [ctx.userId, requestId]);
    if (sessions.length && canonicalRewardPlacement(String(sessions[0].placement_id)) !== placementId) return monetizationError(409, "Reward request already belongs to another placement");
    const entitlement = readEntitlementRow(nk, ctx.userId);
    const noAds = Number(entitlement.no_ads_expires_at || 0) > Number(entitlement.server_time || 0);
    if (!noAds && !isRemoteFlagEnabled(nk, "ads_enabled") && monetizationMode(ctx) === "production") return monetizationError(403, "Ads are disabled");
    const dailyLimit = Math.max(0, Number(reward.daily_limit || 0));
    if (dailyLimit > 0 && !sessions.length) {
        const dailyStatus = buildDailyRewardStatus(nk, ctx.userId)[placementId] || {};
        if (Number(dailyStatus.remaining || 0) <= 0) {
            return monetizationError(409, "Daily reward quota reached");
        }
    }
    let rewardContext: any = {};
    if (placementId === "card_reroll_ad") {
        rewardContext = objectValue(req.context);
        const runId = String(rewardContext.run_id || "");
        const offerSeq = Math.floor(Number(rewardContext.offer_seq || 0));
        if (!runId || !Number.isSafeInteger(offerSeq) || offerSeq <= 0) {
            return monetizationError(400, "Card reroll requires an active run and offer sequence");
        }
        const activeRun = readActiveRun(nk, ctx.userId, runId);
        if (!activeRun) return monetizationError(409, "Run is not active");
        if (Math.max(0, Number(activeRun.run.ad_card_rerolls_used || 0)) >= MAX_CARD_REROLLS_PER_RUN) {
            return monetizationError(409, "Card reroll quota reached");
        }
        rewardContext = { run_id: runId, offer_seq: offerSeq };
    }
    if (sessions.length && placementId === "card_reroll_ad") {
        const oldContext = objectValue(parseJsonb(sessions[0].context));
        if (oldContext.run_id !== rewardContext.run_id || Number(oldContext.offer_seq) !== Number(rewardContext.offer_seq)) return monetizationError(409, "Reward request belongs to another card offer");
    }
    let adSessionId = sessions.length ? String(sessions[0].ad_session_id) : nk.uuidv4();
    const customData = JSON.stringify({ ad_session_id: adSessionId, user_id: ctx.userId });
    if (!sessions.length) {
        nk.sqlExec(
        `INSERT INTO monetization_ad_rewards
            (ad_session_id, user_id, placement_id, reward_type, reward_amount, custom_data, context, delivery_source, client_request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) ON CONFLICT DO NOTHING`,
        [adSessionId, ctx.userId, placementId, reward.type, reward.amount, customData, JSON.stringify(rewardContext), noAds ? "no_ads" : "ad", requestId]);
        sessions = nk.sqlQuery("SELECT * FROM monetization_ad_rewards WHERE user_id=$1 AND client_request_id=$2", [ctx.userId, requestId]);
        if (!sessions.length) return monetizationError(409, "Could not reserve reward session");
        adSessionId = String(sessions[0].ad_session_id);
        if (String(sessions[0].placement_id) !== placementId) return monetizationError(409, "Reward request collision");
    }
    if (noAds && String(sessions[0].status) === "prepared") {
        nk.sqlExec("UPDATE monetization_ad_rewards SET delivery_source='no_ads' WHERE ad_session_id=$1 AND user_id=$2 AND status='prepared'", [adSessionId, ctx.userId]);
        sessions[0].delivery_source = "no_ads";
    }
    if (placementId === "card_reroll_ad") {
        const saved = objectValue(parseJsonb(sessions[0].context));
        if (saved.run_id !== rewardContext.run_id || Number(saved.offer_seq) !== Number(rewardContext.offer_seq)) return monetizationError(409, "Reward request belongs to another card offer");
    }
    const skipAd = String(sessions[0].delivery_source) === "no_ads" || String(sessions[0].status) === "verified" || String(sessions[0].status) === "granted";
    const granted = skipAd ? grantPreparedReward(nk, ctx.userId, adSessionId, "") : {};
    if (skipAd && !granted.granted) return monetizationError(409, String(granted.message || "Reward is not available"));
    return JSON.stringify({
        status: "success",
        data: Object.assign({
            ad_session_id: adSessionId,
            custom_data: String(sessions[0].custom_data || customData),
            placement_id: placementId,
            reward_type: reward.type,
            reward_amount: reward.amount,
            context: rewardContext,
            skip_ad: skipAd,
            monetization: buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx)),
        }, granted),
    });
};

function grantDailyMissionFragment(nk: nkruntime.Nakama, userId: string, adSessionId: string, claim: any): any {
    const config = rewardedAdsConfig(nk);
    const mission = objectValue(config.daily_mission);
    const quantity = Number(objectValue(config.placements).daily_mission_talisman_fragment_ad?.amount || 0);
    const completionCount = Number(mission.completion_count || 0);
    if (!claim || completionCount <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return { granted: false, message: "Missing daily mission configuration" };
    let itemId = "";
    let inventory: any[] | undefined;
    if (Number(claim.claim_slot) >= completionCount) {
        nk.sqlExec(`INSERT INTO monetization_daily_fragment_rewards (user_id,reward_date,item_id)
            SELECT $1,$2::DATE,id FROM game_items WHERE category='talisman_fragment'
                AND attributes->>'quality'=$3 ORDER BY RANDOM() LIMIT 1
            ON CONFLICT (user_id,reward_date) DO NOTHING`, [userId, String(claim.reward_date), String(mission.fragment_quality || "")]);
        const selected = nk.sqlQuery("SELECT item_id,granted_at FROM monetization_daily_fragment_rewards WHERE user_id=$1 AND reward_date=$2::DATE", [userId, String(claim.reward_date)]);
        if (!selected.length) return { granted: false, message: "Daily fragment catalog is missing" };
        itemId = String(selected[0].item_id);
        if (!selected[0].granted_at) {
            const objects = nk.storageRead([{ collection: "player_inventory", key: "items", userId }]);
            if (!objects.length) return { granted: false, message: "Player inventory does not exist" };
            const value = objects[0].value || {};
            const markers: string[] = Array.isArray(value._monetization_reward_ids) ? value._monetization_reward_ids : [];
            const marker = `daily-fragment:${String(claim.reward_date)}`;
            inventory = Array.isArray(value.items) ? value.items : [];
            if (markers.indexOf(marker) < 0) {
                addStoreInventoryItem(nk, inventory, itemId, quantity);
                markers.push(marker);
                value.items = inventory;
                value._monetization_reward_ids = markers.slice(-200);
                nk.storageWrite([{ collection: "player_inventory", key: "items", userId, value, permissionRead: 1, permissionWrite: 0, version: objects[0].version }]);
            }
            nk.sqlExec("UPDATE monetization_daily_fragment_rewards SET granted_at=COALESCE(granted_at,NOW()) WHERE user_id=$1 AND reward_date=$2::DATE", [userId, String(claim.reward_date)]);
        }
    }
    nk.sqlExec("UPDATE monetization_ad_rewards SET status='granted', granted_at=NOW() WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
    return { granted: true, reward_type: "daily_fragment", reward_amount: itemId ? quantity : 0, reward_id: itemId,
        daily_progress: Number(claim.claim_slot), daily_target: completionCount, inventory };
}

function grantPreparedReward(nk: nkruntime.Nakama, userId: string, adSessionId: string, transactionId: string): any {
    const rows = nk.sqlQuery(
        `UPDATE monetization_ad_rewards SET
            status = 'verified', admob_transaction_id = NULLIF($3, ''), verified_at = NOW()
         WHERE ad_session_id = $1 AND user_id = $2
           AND status = 'prepared' AND expires_at > NOW()
         RETURNING placement_id, reward_type, reward_amount`,
        [adSessionId, userId, transactionId]
    );
    if (rows.length === 0) {
        const existing = nk.sqlQuery(
            "SELECT status, placement_id, reward_type, reward_amount FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2",
            [adSessionId, userId]
        );
        if (existing.length === 0) return { granted: false };
        if (existing[0].status === "granted") {
            return {
                granted: true,
                reward_type: String(existing[0].reward_type),
                reward_amount: Number(existing[0].reward_amount),
            };
        }
        // A previous attempt may have verified the callback but failed between
        // storageWrite and the final SQL update. Resume it idempotently.
        if (existing[0].status !== "verified") return { granted: false };
        rows.push(existing[0]);
    }

    const reward = rows[0];
    const placementId = String(reward.placement_id || "");
    const rewardDefinition = objectValue(rewardedAdsConfig(nk).placements)[canonicalRewardPlacement(placementId)];
    if (!rewardDefinition) return { granted: false, message: "Unknown rewarded placement" };
    const limit = Number(rewardDefinition.daily_limit || 0);
    const dailyClaim = limit > 0 ? reserveDailyRewardClaim(nk, userId, placementId, adSessionId, limit) : null;
    if (limit > 0 && !dailyClaim) {
        nk.sqlExec("UPDATE monetization_ad_rewards SET status='rejected' WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
        return { granted: false, message: "Daily reward quota reached" };
    }
    if (String(reward.reward_type) === "daily_fragment") return grantDailyMissionFragment(nk, userId, adSessionId, dailyClaim);
    if (String(reward.reward_type) === "card_reroll") {
        nk.sqlExec(
            "UPDATE monetization_ad_rewards SET status = 'granted', granted_at = NOW() WHERE ad_session_id = $1 AND status = 'verified'",
            [adSessionId]
        );
        return { granted: true, reward_type: "card_reroll", reward_amount: 1 };
    }
    if (String(reward.reward_type) === "item") {
        const itemId = String(rewardDefinition.item_id || "");
        if (!itemId) return { granted: false, message: "Reward item is missing" };
        const inventoryObjects = nk.storageRead([{ collection: "player_inventory", key: "items", userId }]);
        if (inventoryObjects.length === 0) return { granted: false, message: "Player inventory does not exist" };
        const inventoryValue = inventoryObjects[0].value || {};
        const grantIds: string[] = Array.isArray(inventoryValue._monetization_reward_ids)
            ? inventoryValue._monetization_reward_ids.map((value: any) => String(value)) : [];
        const inventory: any[] = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
        if (grantIds.indexOf(adSessionId) < 0) {
            addStoreInventoryItem(nk, inventory, itemId, Number(reward.reward_amount || 0));
            inventoryValue.items = inventory;
            grantIds.push(adSessionId);
            inventoryValue._monetization_reward_ids = grantIds.slice(-200);
            nk.storageWrite([{
                collection: "player_inventory", key: "items", userId, value: inventoryValue,
                permissionRead: 1, permissionWrite: 0, version: inventoryObjects[0].version,
            }]);
        }
        nk.sqlExec(
            "UPDATE monetization_ad_rewards SET status = 'granted', granted_at = NOW() WHERE ad_session_id = $1 AND status = 'verified'",
            [adSessionId]
        );
        return { granted: true, reward_type: "item", reward_id: itemId,
            reward_amount: Number(reward.reward_amount || 0), inventory };
    }
    const profiles = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
    if (profiles.length === 0) return { granted: false };
    const profile = profiles[0].value || {};
    const rewardIds: string[] = Array.isArray(profile._monetization_reward_ids)
        ? profile._monetization_reward_ids.map((value: any) => String(value))
        : [];
    if (rewardIds.indexOf(adSessionId) < 0) {
        if (String(reward.reward_type) === "stamina") {
            profile.stamina = Math.min(30, Math.max(0, Number(profile.stamina || 0)) + Number(reward.reward_amount || 0));
        } else {
            const resources = profile.resources || {};
            resources[String(reward.reward_type)] = Math.max(0, Number(resources[String(reward.reward_type)] || 0)) + Number(reward.reward_amount || 0);
            profile.resources = resources;
        }
        rewardIds.push(adSessionId);
        profile._monetization_reward_ids = rewardIds.slice(-100);
        nk.storageWrite([{
            collection: "player_profiles", key: "main", userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: profiles[0].version,
        }]);
    }
    nk.sqlExec(
        "UPDATE monetization_ad_rewards SET status = 'granted', granted_at = NOW() WHERE ad_session_id = $1 AND status = 'verified'",
        [adSessionId]
    );
    return {
        granted: true,
        reward_type: String(reward.reward_type),
        reward_amount: Number(reward.reward_amount),
        stamina: Number(profile.stamina || 0),
        resources: profile.resources || {},
    };
}

const confirmRewardedAd: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return monetizationError(401, "Authentication required");
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return monetizationError(400, "Invalid JSON"); }
    const adSessionId = String(req.ad_session_id || "");
    if (!adSessionId) return monetizationError(400, "ad_session_id is required");
    const mode = monetizationMode(ctx);
    const delivery = nk.sqlQuery("SELECT delivery_source FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, ctx.userId]);
    const noAdsDelivery = delivery.length && String(delivery[0].delivery_source) === "no_ads";
    if (noAdsDelivery || mode === "mock" || mode === "sandbox") {
        const reward = grantPreparedReward(nk, ctx.userId, adSessionId, noAdsDelivery ? "" : `${mode}:${adSessionId}`);
        return JSON.stringify({ status: reward.granted ? "success" : "error", data: reward, code: reward.granted ? undefined : 409 });
    }
    const rows = nk.sqlQuery(
        `SELECT status, reward_type, reward_amount, EXTRACT(EPOCH FROM created_at)::BIGINT AS created_at
         FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2`,
        [adSessionId, ctx.userId]
    );
    if (rows.length === 0) return monetizationError(404, "Reward session not found");
    return JSON.stringify({ status: "success", data: rows[0] });
};

const consumeAdGameplayReward: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return monetizationError(401, "Authentication required");
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return monetizationError(400, "Invalid JSON"); }
    const adSessionId = String(req.ad_session_id || "");
    const runId = String(req.run_id || "");
    const rewardType = String(req.reward_type || "");
    if (!adSessionId || !runId || rewardType !== "card_reroll") {
        return monetizationError(400, "Invalid gameplay reward request");
    }
    const rows = nk.sqlQuery(
        `SELECT placement_id, reward_type, status, consumed_at, context
         FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2`,
        [adSessionId, ctx.userId]
    );
    if (rows.length === 0) return monetizationError(404, "Reward session not found");
    const ledger = rows[0];
    const storedContext = objectValue(parseJsonb(ledger.context));
    const offerSeq = Math.floor(Number(req.offer_seq || 0));
    if (String(ledger.placement_id) !== "card_reroll_ad" || String(ledger.reward_type) !== "card_reroll"
        || String(ledger.status) !== "granted" || ledger.consumed_at
        || String(storedContext.run_id || "") !== runId
        || Number(storedContext.offer_seq || 0) !== offerSeq) {
        return monetizationError(409, "Card reroll credit is invalid or already used");
    }
    const activeRun = readActiveRun(nk, ctx.userId, runId);
    if (!activeRun) return monetizationError(409, "Run is not active");
    const used = Math.max(0, Math.floor(Number(activeRun.run.ad_card_rerolls_used || 0)));
    if (used >= MAX_CARD_REROLLS_PER_RUN) return monetizationError(409, "Card reroll quota reached");
    activeRun.run.ad_card_rerolls_used = used + 1;
    nk.storageWrite([{
        collection: "player_stage_runs", key: "active", userId: ctx.userId, value: activeRun.run,
        permissionRead: 1, permissionWrite: 0, version: activeRun.object.version,
    }]);
    const consumed = nk.sqlQuery(
        `UPDATE monetization_ad_rewards SET consumed_at = NOW()
         WHERE ad_session_id = $1 AND user_id = $2 AND status = 'granted' AND consumed_at IS NULL
         RETURNING ad_session_id`,
        [adSessionId, ctx.userId]
    );
    if (consumed.length === 0) return monetizationError(409, "Card reroll credit is already used");
    return JSON.stringify({ status: "success", data: {
        consumed: true, run_id: runId, offer_seq: offerSeq,
        rerolls_used: used + 1, rerolls_remaining: MAX_CARD_REROLLS_PER_RUN - used - 1,
    }});
};

const admobSsvConfirm: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return monetizationError(400, "Invalid JSON"); }
    const expectedSecret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
    if (!expectedSecret || String(req.verifier_secret || "") !== expectedSecret) return monetizationError(403, "Verifier authorization failed");
    const adSessionId = String(req.ad_session_id || "");
    const userId = String(req.user_id || "");
    const transactionId = String(req.transaction_id || "");
    const adUnit = String(req.ad_unit || "");
    const expectedAdUnit = environmentValue(ctx, "ADMOB_REWARDED_UNIT_ID");
    const expectedAdUnitNumericId = expectedAdUnit.indexOf("/") >= 0
        ? expectedAdUnit.substring(expectedAdUnit.lastIndexOf("/") + 1)
        : expectedAdUnit;
    if (!adSessionId || !userId || !transactionId || !adUnit) return monetizationError(400, "Missing SSV fields");
    if (!expectedAdUnit || (adUnit !== expectedAdUnit && adUnit !== expectedAdUnitNumericId)) {
        return monetizationError(403, "Unexpected AdMob ad unit");
    }
    const reward = grantPreparedReward(nk, userId, adSessionId, transactionId);
    return JSON.stringify({ status: reward.granted ? "success" : "error", data: reward });
};

const googlePlayRtdnConfirm: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return monetizationError(400, "Invalid JSON"); }
    const expectedSecret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
    if (!expectedSecret || String(req.verifier_secret || "") !== expectedSecret) return monetizationError(403, "Verifier authorization failed");
    const tokenHash = String(req.purchase_token_hash || "");
    if (!tokenHash) return monetizationError(400, "purchase_token_hash is required");
    const rows = nk.sqlQuery(
        `UPDATE monetization_purchases
         SET status = 'voided', updated_at = NOW()
         WHERE purchase_token_hash = $1 AND status <> 'voided'
         RETURNING user_id, granted_seconds`,
        [tokenHash]
    );
    if (rows.length === 0) return JSON.stringify({ status: "success", data: { changed: false } });
    const row = rows[0];
    nk.sqlExec(
        `UPDATE player_monetization_entitlements
         SET no_ads_expires_at = GREATEST(NOW(), no_ads_expires_at - ($2 * INTERVAL '1 second')),
             source = 'google_play_voided', updated_at = NOW()
         WHERE user_id = $1`,
        [String(row.user_id), Number(row.granted_seconds || 0)]
    );
    const response = buildMonetizationResponse(nk, String(row.user_id), "production");
    mirrorEntitlementStorage(nk, String(row.user_id), {
        no_ads_expires_at: response.no_ads.expires_at,
        source: response.no_ads.source,
        last_product_id: response.no_ads.last_product_id,
        updated_at: response.server_time,
    });
    return JSON.stringify({ status: "success", data: { changed: true, monetization: response } });
};

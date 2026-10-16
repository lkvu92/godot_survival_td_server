const MONETIZATION_PRODUCTS = {
  remove_ads_1d: 24 * 60 * 60,
  remove_ads_3d: 3 * 24 * 60 * 60,
  remove_ads_7d: 7 * 24 * 60 * 60,
  remove_ads_30d: 30 * 24 * 60 * 60,
  remove_ads_permanent: 100 * 365 * 24 * 60 * 60
};
const MONETIZATION_REWARDS = {
  main_menu_stamina: { type: "stamina", amount: 5 },
  stamina_dialog_ad: { type: "stamina", amount: 5 }
};
function monetizationMode(ctx) {
  return String(ctx.env.MONETIZATION_MODE || "mock").toLowerCase();
}
function monetizationError(code, message) {
  return JSON.stringify({ status: "error", code, message });
}
function readEntitlementRow(nk, userId) {
  const rows = nk.sqlQuery(
    `SELECT user_id,
                COALESCE(EXTRACT(EPOCH FROM no_ads_expires_at)::BIGINT, 0) AS no_ads_expires_at,
                source, last_product_id,
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
    source: "",
    last_product_id: "",
    server_time: nowRows.length > 0 ? Number(nowRows[0].server_time || 0) : Math.floor(Date.now() / 1e3)
  };
}
function buildMonetizationResponse(nk, userId, mode) {
  const row = readEntitlementRow(nk, userId);
  const serverTime = Number(row.server_time || Math.floor(Date.now() / 1e3));
  const expiresAt = Number(row.no_ads_expires_at || 0);
  return {
    mode,
    server_time: serverTime,
    no_ads: {
      active: expiresAt > serverTime,
      expires_at: expiresAt,
      remaining_seconds: Math.max(0, expiresAt - serverTime),
      source: String(row.source || ""),
      last_product_id: String(row.last_product_id || "")
    },
    ads: {
      rewarded_enabled: true,
      interstitial_enabled: true,
      interstitial_min_interval_seconds: 120
    }
  };
}
function mirrorEntitlementStorage(nk, userId, value) {
  const existing = nk.storageRead([{ collection: "player_entitlements", key: "ads", userId }]);
  const write = {
    collection: "player_entitlements",
    key: "ads",
    userId,
    value,
    permissionRead: 1,
    permissionWrite: 0
  };
  if (existing.length > 0) write.version = existing[0].version;
  nk.storageWrite([write]);
}
function applyNoAdsGrant(nk, userId, requestId, platform, productId, tokenHash, orderId, grantedSeconds, source, purchaseOrderId) {
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
    updated_at: response.server_time
  });
  return { applied: rows.length > 0, monetization: response };
}
const getMonetizationStatus = (ctx, _logger, nk, _payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  return JSON.stringify({ status: "success", data: buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx)) });
};
function addStoreInventoryItem(nk, inventory, itemId, quantity) {
  const definitions = nk.sqlQuery("SELECT stackable, max_stack FROM game_items WHERE id = $1", [itemId]);
  if (definitions.length === 0) throw new Error(`Unknown catalog item: ${itemId}`);
  const definition = definitions[0];
  if (definition.stackable === false) {
    for (let i = 0; i < quantity; i++) inventory.push({ item_id: itemId, quantity: 1, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
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
    inventory.push({ item_id: itemId, quantity: amount, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
    remaining -= amount;
  }
}
function applyPurchaseStorageRewards(nk, userId, grantId, productId, fulfillmentType, rewards) {
  const profileObjects = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
  if (profileObjects.length === 0) throw new Error("Player profile does not exist");
  const profile = profileObjects[0].value || {};
  const profileGrants = Array.isArray(profile._iap_reward_ids) ? profile._iap_reward_ids.map((value) => String(value)) : [];
  if (profileGrants.indexOf(grantId) < 0) {
    const resources = profile.resources || {};
    rewards.filter((line) => line.reward_type === "currency").forEach((line) => {
      resources[line.reward_id] = Math.max(0, Number(resources[line.reward_id] || 0)) + Number(line.quantity);
    });
    profile.resources = resources;
    rewards.filter((line) => line.reward_type === "stamina").forEach((line) => {
      profile.stamina = Math.min(30, Math.max(0, Number(profile.stamina || 0)) + Number(line.quantity));
    });
    const entitlements = profile.iap_entitlements || {};
    rewards.filter((line) => line.reward_type === "entitlement" && line.reward_id !== "no_ads_seconds").forEach((line) => {
      entitlements[line.reward_id] = Math.max(0, Number(entitlements[line.reward_id] || 0)) + Number(line.quantity);
    });
    profile.iap_entitlements = entitlements;
    if (fulfillmentType === "non_consumable") {
      const owned = Array.isArray(profile.owned_iap_products) ? profile.owned_iap_products.map((value) => String(value)) : [];
      if (owned.indexOf(productId) < 0) owned.push(productId);
      profile.owned_iap_products = owned;
    }
    profileGrants.push(grantId);
    profile._iap_reward_ids = profileGrants.slice(-200);
    nk.storageWrite([{
      collection: "player_profiles",
      key: "main",
      userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObjects[0].version
    }]);
  }
  const heroRewards = rewards.filter((line) => line.reward_type === "hero");
  if (heroRewards.length > 0) {
    const heroObjects = nk.storageRead([{ collection: "player_heroes", key: "states", userId }]);
    if (heroObjects.length === 0) throw new Error("Player heroes do not exist");
    const heroValue = heroObjects[0].value || {};
    const heroGrants = Array.isArray(heroValue._iap_reward_ids) ? heroValue._iap_reward_ids.map((value) => String(value)) : [];
    if (heroGrants.indexOf(grantId) < 0) {
      const heroes = Array.isArray(heroValue.heroes) ? heroValue.heroes : [];
      heroRewards.forEach((line) => {
        const hero = heroes.find((value) => value && String(value.hero_id || "") === line.reward_id);
        if (hero) hero.owned = true;
        else heroes.push({ hero_id: line.reward_id, level: 1, exp: 0, next_level_exp: 1e3, owned: true, current_attribute: {} });
      });
      heroValue.heroes = heroes;
      heroGrants.push(grantId);
      heroValue._iap_reward_ids = heroGrants.slice(-200);
      nk.storageWrite([{
        collection: "player_heroes",
        key: "states",
        userId,
        value: heroValue,
        permissionRead: 1,
        permissionWrite: 0,
        version: heroObjects[0].version
      }]);
    }
  }
  const itemRewards = rewards.filter((line) => line.reward_type === "item");
  if (itemRewards.length > 0) {
    const objects = nk.storageRead([{ collection: "player_inventory", key: "items", userId }]);
    if (objects.length === 0) throw new Error("Player inventory does not exist");
    const value = objects[0].value || {};
    const grants = Array.isArray(value._iap_reward_ids) ? value._iap_reward_ids.map((v) => String(v)) : [];
    if (grants.indexOf(grantId) < 0) {
      const inventory = Array.isArray(value.items) ? value.items : [];
      itemRewards.forEach((line) => addStoreInventoryItem(nk, inventory, line.reward_id, Number(line.quantity)));
      value.items = inventory;
      grants.push(grantId);
      value._iap_reward_ids = grants.slice(-200);
      nk.storageWrite([{
        collection: "player_inventory",
        key: "items",
        userId,
        value,
        permissionRead: 1,
        permissionWrite: 0,
        version: objects[0].version
      }]);
    }
  }
  return { resources: profile.resources || {}, stamina: Number(profile.stamina || 0), rewards };
}
const createPurchaseOrder = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  if (!isRemoteFlagEnabled(nk, "payment_enabled")) return monetizationError(403, "Payments are disabled");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const productId = String(req.product_id || "");
  const products = nk.sqlQuery("SELECT * FROM game_store_products WHERE product_id = $1 AND active = TRUE", [productId]);
  if (products.length === 0) return monetizationError(404, "Product is unavailable");
  const product = products[0];
  const previous = nk.sqlQuery(
    "SELECT id, status, fulfillment_type FROM monetization_purchase_orders WHERE user_id = $1 AND product_id = $2 AND status IN ('pending','fulfilled') ORDER BY created_at DESC",
    [ctx.userId, productId]
  );
  const fulfilled = previous.filter((row) => String(row.status) === "fulfilled");
  if (product.unique_purchase === true && fulfilled.length > 0) {
    return JSON.stringify({ status: "success", data: {
      purchase_order_id: String(fulfilled[0].id),
      product_id: productId,
      fulfillment_type: String(product.fulfillment_type),
      already_fulfilled: true
    }, idempotent: true });
  }
  if (product.unique_purchase === true) {
    const legacy = nk.sqlQuery(
      "SELECT id FROM monetization_purchases WHERE user_id = $1 AND product_id = $2 AND status <> 'voided' LIMIT 1",
      [ctx.userId, productId]
    );
    if (legacy.length > 0) return JSON.stringify({ status: "success", data: {
      purchase_order_id: "",
      product_id: productId,
      fulfillment_type: String(product.fulfillment_type),
      already_fulfilled: true
    }, idempotent: true });
  }
  const pending = previous.find((row) => String(row.status) === "pending");
  if (pending) {
    return JSON.stringify({ status: "success", data: {
      purchase_order_id: String(pending.id),
      product_id: productId,
      fulfillment_type: String(product.fulfillment_type)
    }, idempotent: true });
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
  const rewards = rewardRows.map((row) => ({
    reward_type: String(row.reward_type),
    reward_id: String(row.reward_id),
    quantity: Number(row.quantity),
    metadata: parseJsonb(row.metadata) || {}
  })).filter((line) => !line.metadata || line.metadata.condition !== "first_purchase" || fulfilled.length === 0);
  if (rewards.length === 0) return monetizationError(409, "Product has no fulfillment lines");
  const orderId = nk.uuidv4();
  nk.sqlExec(
    `INSERT INTO monetization_purchase_orders
        (id, user_id, product_id, status, reward_snapshot, fulfillment_type)
        VALUES ($1,$2,$3,'pending',$4::jsonb,$5)`,
    [orderId, ctx.userId, productId, JSON.stringify(rewards), String(product.fulfillment_type)]
  );
  return JSON.stringify({ status: "success", data: {
    purchase_order_id: orderId,
    product_id: productId,
    fulfillment_type: String(product.fulfillment_type),
    rewards
  } });
};
const iapGoogleClaim = (ctx, logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  if (!isRemoteFlagEnabled(nk, "payment_enabled")) return monetizationError(403, "Payments are disabled");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const purchaseOrderId = String(req.purchase_order_id || "");
  const receipt = String(req.receipt || "");
  if (!purchaseOrderId) return monetizationError(400, "purchase_order_id is required");
  const orders = nk.sqlQuery("SELECT * FROM monetization_purchase_orders WHERE id = $1 AND user_id = $2", [purchaseOrderId, ctx.userId]);
  if (orders.length === 0) return monetizationError(404, "Purchase order not found");
  const order = orders[0];
  const productId = String(order.product_id);
  const fulfillmentType = String(order.fulfillment_type);
  const rewardSnapshot = parseJsonb(order.reward_snapshot) || [];
  if (String(order.status) === "fulfilled") {
    const data = buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx));
    data.reward = { product_id: productId, purchase_order_id: purchaseOrderId, fulfillment_type: fulfillmentType };
    return JSON.stringify({ status: "success", data, idempotent: true });
  }
  if (String(order.status) !== "pending") return monetizationError(409, "Purchase order is not claimable");
  const mode = monetizationMode(ctx);
  let transactionId = "";
  let purchaseTokenHash = "";
  let seenBefore = false;
  if (mode === "mock") {
    transactionId = purchaseOrderId;
  } else {
    if (!receipt) return monetizationError(400, "receipt is required");
    let validation;
    try {
      validation = nk.purchaseValidateGoogle(ctx.userId, receipt, true);
    } catch (e) {
      logger.warn("Google purchase validation failed user=%s product=%s error=%s", ctx.userId, productId, String(e));
      return monetizationError(409, "Purchase is not valid");
    }
    const purchases = validation.validatedPurchases || [];
    const purchase = purchases.find((value) => value && value.productId === productId && value.userId === ctx.userId);
    if (!purchase || !purchase.transactionId) return monetizationError(409, "Validated product does not match claim");
    transactionId = String(purchase.transactionId);
    seenBefore = Boolean(purchase.seenBefore);
    let receiptData;
    try {
      receiptData = JSON.parse(receipt);
    } catch (_e) {
      return monetizationError(400, "Invalid Google receipt JSON");
    }
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
      "SELECT user_id, product_id FROM monetization_purchases WHERE purchase_token_hash = $1 OR request_id = $2",
      [grantId, purchaseOrderId]
    );
    if (existing.length > 0) {
      if (String(existing[0].user_id) !== ctx.userId || String(existing[0].product_id) !== productId) {
        return monetizationError(409, "Purchase belongs to another claim");
      }
      nk.sqlExec(
        `UPDATE monetization_purchase_orders SET status='fulfilled', transaction_id=$2,
                purchase_token_hash=$3, validated_at=COALESCE(validated_at, NOW()),
                fulfilled_at=COALESCE(fulfilled_at, NOW()), updated_at=NOW() WHERE id=$1`,
        [purchaseOrderId, transactionId, grantId]
      );
      const data2 = buildMonetizationResponse(nk, ctx.userId, mode);
      data2.reward = {
        product_id: productId,
        purchase_order_id: purchaseOrderId,
        fulfillment_type: fulfillmentType,
        lines: rewardSnapshot
      };
      return JSON.stringify({ status: "success", data: data2, idempotent: true });
    }
    const granted = applyPurchaseStorageRewards(nk, ctx.userId, grantId, productId, fulfillmentType, rewardSnapshot);
    const noAdsSeconds = rewardSnapshot.filter((line) => line.reward_type === "entitlement" && line.reward_id === "no_ads_seconds").reduce((total, line) => total + Number(line.quantity), 0);
    if (noAdsSeconds > 0) {
      applyNoAdsGrant(
        nk,
        ctx.userId,
        purchaseOrderId,
        "android",
        productId,
        grantId,
        transactionId,
        noAdsSeconds,
        mode === "mock" ? "debug" : "google_play",
        purchaseOrderId
      );
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
    data.reward = {
      product_id: productId,
      purchase_order_id: purchaseOrderId,
      fulfillment_type: fulfillmentType,
      profile: granted,
      lines: rewardSnapshot
    };
    return JSON.stringify({ status: "success", data, idempotent: seenBefore });
  } catch (e) {
    logger.error("iap_google_claim failed user=%s product=%s: %s", ctx.userId, productId, String(e));
    return monetizationError(500, "Could not grant purchase");
  }
};
const syncPlayPurchase = iapGoogleClaim;
const prepareRewardedAd = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  if (!isRemoteFlagEnabled(nk, "ads_enabled")) return monetizationError(403, "Ads are disabled");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const placementId = String(req.placement_id || "");
  const reward = MONETIZATION_REWARDS[placementId];
  if (!reward) return monetizationError(400, "Unknown rewarded placement");
  const adSessionId = nk.uuidv4();
  const customData = JSON.stringify({ ad_session_id: adSessionId, user_id: ctx.userId });
  nk.sqlExec(
    `INSERT INTO monetization_ad_rewards
            (ad_session_id, user_id, placement_id, reward_type, reward_amount, custom_data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
    [adSessionId, ctx.userId, placementId, reward.type, reward.amount, customData]
  );
  return JSON.stringify({
    status: "success",
    data: {
      ad_session_id: adSessionId,
      custom_data: customData,
      placement_id: placementId,
      reward_type: reward.type,
      reward_amount: reward.amount
    }
  });
};
function grantPreparedReward(nk, userId, adSessionId, transactionId) {
  const rows = nk.sqlQuery(
    `UPDATE monetization_ad_rewards SET
            status = 'verified', admob_transaction_id = NULLIF($3, ''), verified_at = NOW()
         WHERE ad_session_id = $1 AND user_id = $2
           AND status = 'prepared' AND expires_at > NOW()
         RETURNING reward_type, reward_amount`,
    [adSessionId, userId, transactionId]
  );
  if (rows.length === 0) {
    const existing = nk.sqlQuery(
      "SELECT status, reward_type, reward_amount FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2",
      [adSessionId, userId]
    );
    if (existing.length === 0) return { granted: false };
    if (existing[0].status === "granted") {
      return {
        granted: true,
        reward_type: String(existing[0].reward_type),
        reward_amount: Number(existing[0].reward_amount)
      };
    }
    if (existing[0].status !== "verified") return { granted: false };
    rows.push(existing[0]);
  }
  const reward = rows[0];
  const profiles = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
  if (profiles.length === 0) return { granted: false };
  const profile = profiles[0].value || {};
  const rewardIds = Array.isArray(profile._monetization_reward_ids) ? profile._monetization_reward_ids.map((value) => String(value)) : [];
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
      collection: "player_profiles",
      key: "main",
      userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profiles[0].version
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
    resources: profile.resources || {}
  };
}
const confirmRewardedAd = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const adSessionId = String(req.ad_session_id || "");
  if (!adSessionId) return monetizationError(400, "ad_session_id is required");
  if (monetizationMode(ctx) === "mock") {
    const reward = grantPreparedReward(nk, ctx.userId, adSessionId, `mock:${adSessionId}`);
    return JSON.stringify({ status: reward.granted ? "success" : "error", data: reward, code: reward.granted ? void 0 : 409 });
  }
  const rows = nk.sqlQuery(
    `SELECT status, reward_type, reward_amount, EXTRACT(EPOCH FROM created_at)::BIGINT AS created_at
         FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2`,
    [adSessionId, ctx.userId]
  );
  if (rows.length === 0) return monetizationError(404, "Reward session not found");
  return JSON.stringify({ status: "success", data: rows[0] });
};
const admobSsvConfirm = (ctx, _logger, nk, payload) => {
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const expectedSecret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
  if (!expectedSecret || String(req.verifier_secret || "") !== expectedSecret) return monetizationError(403, "Verifier authorization failed");
  const adSessionId = String(req.ad_session_id || "");
  const userId = String(req.user_id || "");
  const transactionId = String(req.transaction_id || "");
  if (!adSessionId || !userId || !transactionId) return monetizationError(400, "Missing SSV fields");
  const reward = grantPreparedReward(nk, userId, adSessionId, transactionId);
  return JSON.stringify({ status: reward.granted ? "success" : "error", data: reward });
};
const googlePlayRtdnConfirm = (ctx, _logger, nk, payload) => {
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
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
    updated_at: response.server_time
  });
  return JSON.stringify({ status: "success", data: { changed: true, monetization: response } });
};

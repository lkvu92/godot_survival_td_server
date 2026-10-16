const updateInventory = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload);
  const action = req.action;
  const itemId = req.item_id;
  const quantity = req.quantity || 0;
  if (!itemId || quantity <= 0) {
    throw new Error("Invalid item_id or quantity");
  }
  const itemRows = nk.sqlQuery("SELECT * FROM game_items WHERE id = $1", [itemId]);
  if (itemRows.length === 0) {
    throw new Error(`Unknown item: ${itemId}`);
  }
  const itemDef = itemRows[0];
  const stored = nk.storageRead([
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  let inventory = [];
  let iapRewardIds = [];
  if (stored.length > 0 && stored[0].value && stored[0].value.items) {
    inventory = stored[0].value.items;
    iapRewardIds = Array.isArray(stored[0].value._iap_reward_ids) ? stored[0].value._iap_reward_ids : [];
  }
  if (action === "add") {
    return JSON.stringify({ success: false, message: "Client item grants are forbidden" });
  } else if (action === "remove") {
    let remaining = quantity;
    let total = 0;
    for (const entry of inventory) {
      if (entry.item_id === itemId) total += entry.quantity || 0;
    }
    if (total < quantity) {
      return JSON.stringify({ success: false, message: "Not enough items" });
    }
    for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
      if (inventory[i].item_id !== itemId) continue;
      const current = inventory[i].quantity || 0;
      const taken = Math.min(current, remaining);
      remaining -= taken;
      if (taken >= current) {
        inventory.splice(i, 1);
      } else {
        inventory[i].quantity = current - taken;
      }
    }
  }
  nk.storageWrite([{
    collection: "player_inventory",
    key: "items",
    userId: ctx.userId,
    value: { items: inventory, _iap_reward_ids: iapRewardIds },
    permissionRead: 1,
    permissionWrite: 0
  }]);
  return JSON.stringify({ success: true, inventory });
};
function talismanJsonObject(value) {
  const decoded = parseJsonb(value);
  if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) return decoded;
  if (typeof decoded === "string") {
    try {
      const parsed = JSON.parse(decoded);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_e) {
      return {};
    }
  }
  return {};
}
function talismanItemQuantity(items, itemId) {
  return items.filter((entry) => entry && String(entry.item_id || "") === itemId).reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
}
function talismanRemoveItems(items, itemId, quantity) {
  if (!itemId || quantity <= 0 || talismanItemQuantity(items, itemId) < quantity) return false;
  let remaining = quantity;
  for (let i = items.length - 1; i >= 0 && remaining > 0; i--) {
    const entry = items[i];
    if (!entry || String(entry.item_id || "") !== itemId) continue;
    const current = Math.max(0, Number(entry.quantity || 0));
    const taken = Math.min(current, remaining);
    remaining -= taken;
    entry.quantity = current - taken;
    if (entry.quantity <= 0) items.splice(i, 1);
  }
  return remaining === 0;
}
function serverGrantInventoryItem(nk, items, itemId, quantity) {
  if (!itemId || quantity <= 0) return false;
  const rows = nk.sqlQuery("SELECT stackable, max_stack FROM game_items WHERE id = $1", [itemId]);
  const isFragment = /^talisman_fragment_([1-9]|[12][0-9]|30)$/.test(itemId);
  if (rows.length === 0 && !isFragment) return false;
  const stackable = isFragment || rows[0].stackable !== false;
  const maxStack = isFragment ? 999999 : Math.max(1, Math.floor(Number(rows[0].max_stack || 999)));
  if (!stackable) {
    for (let i = 0; i < quantity; i++) items.push({ item_id: itemId, quantity: 1, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
    return true;
  }
  let remaining = quantity;
  for (const entry of items) {
    if (remaining <= 0) break;
    if (!entry || String(entry.item_id || "") !== itemId) continue;
    const current = Math.max(0, Math.floor(Number(entry.quantity || 0)));
    const added = Math.min(Math.max(0, maxStack - current), remaining);
    entry.quantity = current + added;
    remaining -= added;
  }
  while (remaining > 0) {
    const added = Math.min(maxStack, remaining);
    items.push({ item_id: itemId, quantity: added, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
    remaining -= added;
  }
  return true;
}
function talismanConfig(nk) {
  const rows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
  if (rows.length === 0) return {};
  return talismanJsonObject(talismanJsonObject(rows[0].value).talisman_system);
}
function talismanUpgradeSuccessRate(upgrade, currentLevel) {
  const configured = Array.isArray(upgrade.success_rates_by_current_level) ? upgrade.success_rates_by_current_level : [];
  if (currentLevel >= 0 && currentLevel < configured.length) {
    return Math.max(0, Math.min(100, Math.floor(Number(configured[currentLevel] || 0))));
  }
  if (currentLevel < 5) return 100;
  if (currentLevel < 10) return 80 - (currentLevel - 5) * 5;
  if (currentLevel < 15) return 50 - (currentLevel - 10) * 2;
  if (currentLevel < 20) return 40 - (currentLevel - 15) * 2;
  if (currentLevel < 25) return 25 - (currentLevel - 20) * 2;
  return Math.max(0, 15 - (currentLevel - 25) * 3);
}
function talismanUpgradeQuote(nk, level, items, resources, talismanId = 0) {
  const upgrade = talismanJsonObject(talismanConfig(nk).upgrade);
  const maxLevel = Math.max(1, Math.floor(Number(upgrade.max_level || 30)));
  const currentLevel = Math.max(1, Math.floor(Number(level || 1)));
  if (currentLevel >= maxLevel) return { maxed: true, current_level: currentLevel, target_level: maxLevel };
  const targetLevel = currentLevel + 1;
  const tiers = Array.isArray(upgrade.tiers) ? upgrade.tiers : [];
  const tier = tiers.find((entry) => entry && targetLevel >= Number(entry.target_level_min || 0) && targetLevel <= Number(entry.target_level_max || 0));
  if (!tier) return { error: "Missing talisman upgrade tier", current_level: currentLevel, target_level: targetLevel };
  const tierMin = Math.max(1, Math.floor(Number(tier.target_level_min || targetLevel)));
  const baseQuantity = Math.max(1, Math.floor(Number(tier.base_quantity || 2)));
  const multiplier = Math.max(1, Number(tier.quantity_multiplier || 2));
  const materialQuantity = Math.max(1, Math.floor(baseQuantity * Math.pow(multiplier, targetLevel - tierMin)));
  const gold = talismanJsonObject(upgrade.gold);
  let goldCost = Number(gold.low_base || 10) + currentLevel * Number(gold.low_growth || 4);
  if (targetLevel >= 21) goldCost = Number(gold.high_base || 200) + (currentLevel - 20) * Number(gold.high_growth || 20);
  else if (targetLevel >= 11) goldCost = Number(gold.medium_base || 50) + (currentLevel - 10) * Number(gold.medium_growth || 10);
  const materialId = String(tier.material_id || "");
  const milestones = talismanJsonObject(upgrade.fragment_milestones);
  const fallbackMilestone = [10, 20, 30].indexOf(targetLevel) >= 0 ? targetLevel : 0;
  const fragmentQuantity = Math.max(0, Math.floor(Number(milestones[String(targetLevel)] || fallbackMilestone)));
  const fragmentId = talismanId > 0 ? `talisman_fragment_${talismanId}` : "";
  const successRate = talismanUpgradeSuccessRate(upgrade, currentLevel);
  return {
    maxed: false,
    current_level: currentLevel,
    target_level: targetLevel,
    material_id: materialId,
    material_quantity: materialQuantity,
    material_owned: talismanItemQuantity(items, materialId),
    gold_cost: Math.max(0, Math.floor(goldCost)),
    gold_owned: Math.max(0, Number(resources.gold || 0)),
    success_rate: successRate,
    fragment_id: fragmentId,
    fragment_quantity: fragmentQuantity,
    fragment_owned: fragmentId ? talismanItemQuantity(items, fragmentId) : 0
  };
}
function talismanServerNowMs() {
  return Date.now();
}
function talismanCreateStageRun(nk, userId, stageId, difficultyId) {
  const objects = nk.storageRead([
    { collection: "player_inventory", key: "items", userId },
    { collection: "player_stage_runs", key: "active", userId }
  ]);
  const inventoryObject = objects.find((entry) => entry.collection === "player_inventory");
  const previousRun = objects.find((entry) => entry.collection === "player_stage_runs");
  const inventoryValue = inventoryObject ? talismanJsonObject(inventoryObject.value) : { items: [] };
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const equipped = items.find((entry) => entry && entry.is_equipped === true && /^talisman_[0-9]+$/.test(String(entry.item_id || "")));
  let talisman = null;
  if (equipped) {
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1 AND category = 'talisman'", [String(equipped.item_id)]);
    if (rows.length > 0) {
      const attrs = talismanJsonObject(rows[0].attributes);
      talisman = {
        instance_id: String(equipped.instance_id || ""),
        item_id: String(equipped.item_id || ""),
        skill_id: String(equipped.skill_id || attrs.skill_id || ""),
        level: Math.max(1, Math.floor(Number(equipped.level || 1))),
        durability: Math.max(0, Math.floor(Number(equipped.durability === void 0 ? 100 : equipped.durability))),
        max_uses: Math.max(0, Math.floor(Number(equipped.max_battle_uses || attrs.max_battle_uses || 0))),
        durability_cost_per_cast: Math.max(0, Math.floor(Number(attrs.durability_cost_per_cast || 0))),
        durability_cost_per_battle: Math.max(0, Math.floor(Number(attrs.durability_cost_per_battle || 0)))
      };
    }
  }
  const now = talismanServerNowMs();
  const waveRows = nk.sqlQuery("SELECT COUNT(*) AS wave_count FROM game_stage_waves WHERE stage_id = $1", [stageId]);
  const waveCount = waveRows.length > 0 ? Math.max(1, Math.floor(Number(waveRows[0].wave_count || 1))) : 1;
  const run = {
    run_id: nk.uuidv4(),
    stage_id: stageId,
    difficulty_id: difficultyId,
    status: "active",
    started_at_ms: now,
    expires_at_ms: now + 2 * 60 * 60 * 1e3,
    // A victory cannot be settled immediately after start. This is not a
    // replacement for a fully authoritative combat simulation, but it
    // rejects impossible instant-win reports using server-owned stage data.
    min_win_duration_ms: Math.min(12e4, Math.max(3e3, waveCount * 1500)),
    cast_seq: 0,
    talisman_uses: 0,
    last_talisman_cast_at_ms: 0,
    talisman
  };
  return { run, version: previousRun ? previousRun.version : "*" };
}
const talismanCast = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const runId = String(req.run_id || "");
  const skillId = String(req.skill_id || "");
  const castSeq = Math.floor(Number(req.cast_seq || 0));
  if (!runId || !skillId || !Number.isSafeInteger(castSeq) || castSeq <= 0) {
    return JSON.stringify({ success: false, message: "Invalid talisman cast request" });
  }
  const objects = nk.storageRead([
    { collection: "player_stage_runs", key: "active", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  const runObject = objects.find((entry) => entry.collection === "player_stage_runs");
  const inventoryObject = objects.find((entry) => entry.collection === "player_inventory");
  if (!runObject || !inventoryObject) return JSON.stringify({ success: false, message: "No active server run" });
  const run = talismanJsonObject(runObject.value);
  const inventoryValue = talismanJsonObject(inventoryObject.value);
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const snapshot = run.talisman && typeof run.talisman === "object" ? run.talisman : null;
  const now = talismanServerNowMs();
  if (String(run.run_id || "") !== runId || String(run.status || "") !== "active" || now > Number(run.expires_at_ms || 0)) {
    return JSON.stringify({ success: false, message: "Run is not active" });
  }
  if (!snapshot || String(snapshot.skill_id || "") !== skillId) {
    return JSON.stringify({ success: false, message: "Skill is not provided by the equipped talisman" });
  }
  const currentSeq = Math.max(0, Math.floor(Number(run.cast_seq || 0)));
  if (castSeq === currentSeq) {
    const equippedRetry = items.find((entry) => entry && String(entry.instance_id || "") === String(snapshot.instance_id || ""));
    return JSON.stringify({
      success: true,
      duplicate: true,
      cast_seq: currentSeq,
      uses_left: Math.max(0, Number(snapshot.max_uses || 0) - Number(run.talisman_uses || 0)),
      durability: equippedRetry ? Number(equippedRetry.durability || 0) : 0,
      inventory: items
    });
  }
  if (castSeq !== currentSeq + 1) return JSON.stringify({ success: false, message: "Invalid cast sequence", expected_seq: currentSeq + 1 });
  const equipped = items.find((entry) => entry && entry.is_equipped === true && String(entry.instance_id || "") === String(snapshot.instance_id || "") && String(entry.item_id || "") === String(snapshot.item_id || ""));
  if (!equipped) return JSON.stringify({ success: false, message: "Equipped talisman changed during run" });
  const durability = Math.max(0, Math.floor(Number(equipped.durability === void 0 ? 100 : equipped.durability)));
  if (durability <= 0) return JSON.stringify({ success: false, message: "Talisman is broken" });
  const uses = Math.max(0, Math.floor(Number(run.talisman_uses || 0)));
  const maxUses = Math.max(0, Math.floor(Number(snapshot.max_uses || 0)));
  if (maxUses > 0 && uses >= maxUses) return JSON.stringify({ success: false, message: "Talisman battle-use limit reached" });
  const skillRows = nk.sqlQuery("SELECT levels FROM game_skills WHERE id = $1", [skillId]);
  if (skillRows.length === 0) return JSON.stringify({ success: false, message: "Unknown talisman skill" });
  const levels = parseJsonb(skillRows[0].levels) || [];
  const stats = levels.length > 0 ? talismanJsonObject(levels[0].stats) : {};
  const baseCooldownMs = Math.max(0, Number(stats.cooldown || 0) * 1e3);
  const minimumCooldownMs = Math.floor(baseCooldownMs * 0.35);
  const lastCastAt = Math.max(0, Number(run.last_talisman_cast_at_ms || 0));
  if (lastCastAt > 0 && now - lastCastAt < minimumCooldownMs) {
    return JSON.stringify({ success: false, message: "Talisman skill is on cooldown", retry_after_ms: minimumCooldownMs - (now - lastCastAt) });
  }
  const durabilityCost = Math.max(0, Math.floor(Number(snapshot.durability_cost_per_cast || 0)));
  equipped.durability = Math.max(0, durability - durabilityCost);
  run.cast_seq = castSeq;
  run.talisman_uses = uses + 1;
  run.last_talisman_cast_at_ms = now;
  inventoryValue.items = items;
  nk.storageWrite([
    {
      collection: "player_stage_runs",
      key: "active",
      userId: ctx.userId,
      value: run,
      permissionRead: 1,
      permissionWrite: 0,
      version: runObject.version
    },
    {
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: inventoryValue,
      permissionRead: 1,
      permissionWrite: 0,
      version: inventoryObject.version
    }
  ]);
  return JSON.stringify({
    success: true,
    duplicate: false,
    cast_seq: castSeq,
    uses_left: maxUses > 0 ? Math.max(0, maxUses - uses - 1) : -1,
    durability: equipped.durability,
    inventory: items
  });
};
const talismanAction = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const action = String(req.action || "");
  if (["equip", "upgrade", "repair", "quote_upgrade", "quote_craft", "craft", "buy_fragment"].indexOf(action) < 0) {
    return JSON.stringify({ success: false, message: "Unsupported talisman action" });
  }
  const stored = nk.storageRead([
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_profiles", key: "main", userId: ctx.userId }
  ]);
  const inventoryObject = stored.find((entry) => entry.collection === "player_inventory");
  const profileObject = stored.find((entry) => entry.collection === "player_profiles");
  if (!inventoryObject || !profileObject) {
    return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  }
  const inventoryValue = talismanJsonObject(inventoryObject.value);
  const profile = talismanJsonObject(profileObject.value);
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const resources = talismanJsonObject(profile.resources);
  let upgradeAttempted = false;
  let upgradeSucceeded = true;
  let upgradeSuccessRate = 0;
  const talismanId = Math.max(0, Math.floor(Number(req.talisman_id || 0)));
  const itemId = `talisman_${talismanId}`;
  let target = items.find((entry) => entry && String(entry.item_id || "") === itemId);
  const requestId = String(req.request_id || "");
  const handledRequestIds = Array.isArray(inventoryValue._talisman_request_ids) ? inventoryValue._talisman_request_ids : [];
  if ((action === "craft" || action === "buy_fragment") && requestId && handledRequestIds.indexOf(requestId) >= 0) {
    return JSON.stringify({ success: true, duplicate: true, inventory: items, resources });
  }
  if (action === "buy_fragment") {
    const quantity = Math.max(1, Math.floor(Number(req.quantity || 1)));
    if (talismanId < 26 || talismanId > 30) return JSON.stringify({ success: false, message: "Only high-quality fragments are sold for gems" });
    const cost = 100 * quantity;
    if (Number(resources.gems || 0) < cost) return JSON.stringify({ success: false, message: "Not enough gems" });
    if (!serverGrantInventoryItem(nk, items, `talisman_fragment_${talismanId}`, quantity)) return JSON.stringify({ success: false, message: "Fragment grant failed" });
    resources.gems = Number(resources.gems || 0) - cost;
    if (requestId) handledRequestIds.push(requestId);
  } else if (action === "quote_craft" || action === "craft") {
    if (target) return JSON.stringify({ success: false, message: "Talisman is already owned" });
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1 AND category = 'talisman'", [itemId]);
    if (rows.length === 0) return JSON.stringify({ success: false, message: "Unknown talisman catalog item" });
    const attrs = talismanJsonObject(rows[0].attributes);
    const quality = String(attrs.quality || (talismanId <= 15 ? "low" : talismanId <= 25 ? "mid" : "high"));
    const qualities = talismanJsonObject(talismanConfig(nk).qualities);
    const qualityCfg = talismanJsonObject(qualities[quality]);
    const fragmentId = `talisman_fragment_${talismanId}`;
    const fragmentQuantity = Math.max(1, Number(qualityCfg.craft_fragments || 100));
    const goldCost = Math.max(0, Number(qualityCfg.craft_gold || 0));
    const quote = {
      fragment_id: fragmentId,
      fragment_quantity: fragmentQuantity,
      fragment_owned: talismanItemQuantity(items, fragmentId),
      gold_cost: goldCost,
      gold_owned: Number(resources.gold || 0)
    };
    if (action === "quote_craft") return JSON.stringify({ success: true, quote });
    if (quote.fragment_owned < fragmentQuantity) return JSON.stringify({ success: false, message: "Not enough talisman fragments", quote });
    if (quote.gold_owned < goldCost) return JSON.stringify({ success: false, message: "Not enough gold", quote });
    if (!talismanRemoveItems(items, fragmentId, fragmentQuantity)) return JSON.stringify({ success: false, message: "Fragment debit failed" });
    resources.gold = quote.gold_owned - goldCost;
    const baseStats = talismanJsonObject(attrs.base_stats);
    target = {
      instance_id: `talisman_${ctx.userId}_${Date.now()}`,
      item_id: itemId,
      category: "talisman",
      quantity: 1,
      acquired_at: (/* @__PURE__ */ new Date()).toISOString(),
      level: 1,
      exp: 0,
      max_exp: 1,
      durability: Number(attrs.base_durability || 100),
      max_durability: Number(attrs.max_durability || 100),
      is_equipped: false,
      is_repairable: attrs.is_repairable !== false,
      skill_id: String(attrs.skill_id || `skill_talisman_${talismanId}`),
      tier_name: String(attrs.tier_name || ""),
      base_rolled_stats: baseStats,
      current_stats: baseStats,
      reforge_affixes: []
    };
    items.push(target);
    if (requestId) handledRequestIds.push(requestId);
  } else if (action === "equip") {
    if (talismanId > 0 && !target) return JSON.stringify({ success: false, message: "Talisman is not owned" });
    for (const entry of items) {
      if (entry && /^talisman_[0-9]+$/.test(String(entry.item_id || ""))) {
        entry.is_equipped = talismanId > 0 && String(entry.item_id) === itemId;
      }
    }
  } else {
    if (!target) return JSON.stringify({ success: false, message: "Talisman is not owned" });
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1 AND category = 'talisman'", [itemId]);
    if (rows.length === 0) return JSON.stringify({ success: false, message: "Unknown talisman catalog item" });
    const attrs = talismanJsonObject(rows[0].attributes);
    const durability = Math.max(0, Number(target.durability === void 0 ? 100 : target.durability));
    const maxDurability = Math.max(1, Number(target.max_durability || attrs.max_durability || 100));
    if (action === "quote_upgrade") {
      return JSON.stringify({ success: true, quote: talismanUpgradeQuote(nk, Number(target.level || 1), items, resources, talismanId) });
    }
    if (action === "upgrade") {
      if (durability <= 0) return JSON.stringify({ success: false, message: "Repair the talisman before upgrading" });
      let level = Math.max(1, Math.floor(Number(target.level || 1)));
      const quote = talismanUpgradeQuote(nk, level, items, resources, talismanId);
      if (quote.maxed === true) return JSON.stringify({ success: false, message: "Talisman is already max level", quote });
      if (quote.error) return JSON.stringify({ success: false, message: String(quote.error) });
      if (Number(resources.gold || 0) < Number(quote.gold_cost || 0)) {
        return JSON.stringify({ success: false, message: `Not enough gold (need ${quote.gold_cost})`, quote });
      }
      if (Number(quote.material_owned || 0) < Number(quote.material_quantity || 0)) {
        return JSON.stringify({ success: false, message: `Not enough ${quote.material_id} (need ${quote.material_quantity})`, quote });
      }
      const fragmentQuantity = Number(quote.fragment_quantity || 0);
      const fragmentId = `talisman_fragment_${talismanId}`;
      if (fragmentQuantity > 0 && talismanItemQuantity(items, fragmentId) < fragmentQuantity) {
        return JSON.stringify({ success: false, message: `Not enough ${fragmentId} (need ${fragmentQuantity})`, quote });
      }
      if (!talismanRemoveItems(items, String(quote.material_id), Number(quote.material_quantity))) {
        return JSON.stringify({ success: false, message: "Material debit failed" });
      }
      if (fragmentQuantity > 0 && !talismanRemoveItems(items, fragmentId, fragmentQuantity)) {
        return JSON.stringify({ success: false, message: "Fragment debit failed", quote });
      }
      resources.gold = Number(resources.gold || 0) - Number(quote.gold_cost || 0);
      upgradeAttempted = true;
      upgradeSuccessRate = Math.max(0, Math.min(100, Math.floor(Number(quote.success_rate || 0))));
      upgradeSucceeded = Math.random() <= upgradeSuccessRate * 0.01;
      if (!upgradeSucceeded) {
      } else {
        const growth = talismanJsonObject(attrs.stat_growth);
        const currentStats = talismanJsonObject(target.current_stats);
        for (const key of Object.keys(growth)) currentStats[key] = Number(currentStats[key] || 0) + Number(growth[key] || 0);
        level = Number(quote.target_level);
        target.level = level;
        target.exp = 0;
        target.max_exp = 1;
        target.current_stats = currentStats;
      }
    } else {
      if (target.is_repairable === false || attrs.is_repairable === false) return JSON.stringify({ success: false, message: "Talisman cannot be repaired" });
      if (durability >= maxDurability) return JSON.stringify({ success: false, message: "Talisman does not need repair" });
      const costPerPoint = Math.max(0, Number(attrs.repair_cost_per_point || 50));
      let goldCost = (maxDurability - durability) * costPerPoint;
      if (durability <= 0) goldCost = maxDurability * costPerPoint * Math.max(1, Number(talismanConfig(nk).severe_break_gold_multiplier || 2));
      if (Number(resources.gold || 0) < goldCost) return JSON.stringify({ success: false, message: `Not enough gold (need ${goldCost})` });
      if (durability <= 0) {
        const repairItemId = String(attrs.severe_repair_item_id || "");
        const repairItemQuantity = Math.max(0, Math.floor(Number(attrs.severe_repair_item_quantity || 0)));
        if (!(repairItemId && repairItemQuantity > 0 && talismanRemoveItems(items, repairItemId, repairItemQuantity))) {
          const gemCost = Math.max(0, Math.floor(Number(talismanConfig(nk).severe_break_gem_cost || 10)));
          if (Number(resources.gems || 0) < gemCost) return JSON.stringify({ success: false, message: `Not enough gems (need ${gemCost})` });
          resources.gems = Number(resources.gems || 0) - gemCost;
        }
      }
      resources.gold = Number(resources.gold || 0) - goldCost;
      target.durability = maxDurability;
    }
  }
  inventoryValue.items = items;
  inventoryValue._talisman_request_ids = handledRequestIds.slice(-100);
  profile.resources = resources;
  nk.storageWrite([
    {
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: inventoryValue,
      permissionRead: 1,
      permissionWrite: 0,
      version: inventoryObject.version
    },
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObject.version
    }
  ]);
  return JSON.stringify({
    success: action === "upgrade" ? upgradeSucceeded : true,
    attempted: upgradeAttempted,
    consumed: upgradeAttempted,
    success_rate: upgradeSuccessRate,
    message: action === "upgrade" && !upgradeSucceeded ? "Talisman enhancement failed" : "",
    inventory: items,
    resources,
    level: target ? Number(target.level || 1) : 0,
    exp: target ? Number(target.exp || 0) : 0,
    max_exp: target ? Number(target.max_exp || 20) : 0,
    durability: target ? Number(target.durability || 0) : 0,
    quote: target ? talismanUpgradeQuote(nk, Number(target.level || 1), items, resources, talismanId) : {}
  });
};

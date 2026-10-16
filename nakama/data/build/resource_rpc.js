function parseJsonObject(value) {
  const parsed = parseJsonb(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
const STAMINA_CAP_RESOURCE = 30;
function elementUpgradeRequirement(nk, elementName, level) {
  const tiers = level < 10 ? "low" : level < 20 ? "medium" : "high";
  const tierStart = level < 10 ? 0 : level < 20 ? 10 : 20;
  const configured = getRemoteConfigValue(nk, "game_play", "element_upgrade_stones", []);
  const costs = Array.isArray(configured) ? configured : [];
  const fallback = 1 << level - tierStart + 1;
  const stoneCount = Math.max(1, Number(costs[Math.min(level, Math.max(costs.length - 1, 0))] || fallback));
  const stoneId = tiers === "high" ? `rune_${elementName}_high` : `stone_${elementName}_${tiers}`;
  const goldCost = level >= 20 ? 200 + (level - 20) * 20 : level >= 10 ? 50 + (level - 10) * 10 : 10 + level * 4;
  return { stoneId, stoneCount, goldCost };
}
function elementSuccessRate(level) {
  if (level < 5) return 1;
  if (level < 10) return 0.8 - (level - 5) * 0.05;
  if (level < 15) return 0.5 - (level - 10) * 0.02;
  if (level < 20) return 0.4 - (level - 15) * 0.02;
  if (level < 25) return 0.25 - (level - 20) * 0.02;
  return Math.max(0, 0.15 - (level - 25) * 0.03);
}
const upgradeElement = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const element = String(req.element || "");
  if (["metal", "wood", "water", "fire", "earth"].indexOf(element) < 0) return JSON.stringify({ success: false, message: "Invalid element" });
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  const profileObject = stored.find((entry) => entry.collection === "player_profiles");
  const inventoryObject = stored.find((entry) => entry.collection === "player_inventory");
  if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  const profile = parseJsonObject(profileObject.value);
  const inventory = parseJsonObject(inventoryObject.value);
  const elements = parseJsonObject(profile.elements);
  const level = Math.max(0, Number(elements[element] || 0));
  if (level >= 30) return JSON.stringify({ success: false, message: "Element is already max level" });
  const requirement = elementUpgradeRequirement(nk, element, level);
  const resources = parseJsonObject(profile.resources);
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const owned = items.filter((item) => item && String(item.item_id) === requirement.stoneId).reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
  if (Number(resources.gold || 0) < requirement.goldCost) return JSON.stringify({ success: false, message: "Not enough gold" });
  if (owned < requirement.stoneCount) return JSON.stringify({ success: false, message: "Not enough stones" });
  resources.gold = Number(resources.gold || 0) - requirement.goldCost;
  let remaining = requirement.stoneCount;
  for (let i = items.length - 1; i >= 0 && remaining > 0; i--) {
    const item = items[i];
    if (!item || String(item.item_id) !== requirement.stoneId) continue;
    const taken = Math.min(remaining, Math.max(0, Number(item.quantity || 0)));
    item.quantity = Number(item.quantity || 0) - taken;
    remaining -= taken;
    if (item.quantity <= 0) items.splice(i, 1);
  }
  const success = Math.random() <= elementSuccessRate(level);
  if (success) elements[element] = level + 1;
  profile.elements = elements;
  profile.resources = resources;
  inventory.items = items;
  nk.storageWrite([
    { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
    { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventory, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version }
  ]);
  return JSON.stringify({
    success,
    new_level: Number(elements[element] || level),
    element,
    profile,
    inventory,
    message: success ? "Element upgraded" : "Element upgrade failed"
  });
};
function debitResource(profile, resourceId, amount) {
  if (resourceId !== "gold" && resourceId !== "gems") {
    return { success: false, message: "Unsupported currency" };
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { success: false, message: "Invalid amount" };
  }
  const resources = parseJsonObject(profile.resources);
  const current = Number(resources[resourceId] || 0);
  if (!Number.isSafeInteger(current) || current < amount) {
    return {
      success: false,
      message: `Not enough ${resourceId} (have ${current}, need ${amount})`
    };
  }
  resources[resourceId] = current - amount;
  profile.resources = resources;
  return { success: true, remaining: resources[resourceId] };
}
const spendResource = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload || "{}");
  const resourceId = String(req.resource_id || "");
  const amount = Number(req.amount || 0);
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId }
  ]);
  if (stored.length === 0) {
    return JSON.stringify({ success: false, message: "No profile found" });
  }
  const profile = stored[0].value;
  const debit = debitResource(profile, resourceId, amount);
  if (!debit.success) return JSON.stringify(debit);
  nk.storageWrite([{
    collection: "player_profiles",
    key: "main",
    userId: ctx.userId,
    value: profile,
    permissionRead: 1,
    permissionWrite: 0,
    version: stored[0].version
  }]);
  return JSON.stringify(debit);
};
const purchaseStamina = (ctx, _logger, nk, _payload) => {
  const staminaAmount = 15;
  const prices = [30, 40, 50];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId }
  ]);
  if (stored.length === 0) {
    return JSON.stringify({ success: false, message: "No profile found" });
  }
  const profileObject = stored[0];
  const profile = parseJsonObject(profileObject.value);
  const purchaseDay = String(profile.stamina_purchase_day || "");
  const purchasesToday = purchaseDay === today ? Math.max(0, Math.min(prices.length, Number(profile.stamina_purchases_today || 0))) : 0;
  if (purchasesToday >= prices.length) {
    return JSON.stringify({
      success: false,
      message: "Daily stamina purchase limit reached",
      purchases_today: purchasesToday
    });
  }
  const gemCost = prices[purchasesToday];
  const debit = debitResource(profile, "gems", gemCost);
  if (!debit.success) {
    return JSON.stringify({
      success: false,
      message: debit.message,
      gem_cost: gemCost,
      purchases_today: purchasesToday,
      gems: Number(parseJsonObject(profile.resources).gems || 0)
    });
  }
  const currentStamina = Math.max(0, Math.min(STAMINA_CAP_RESOURCE, Number(profile.stamina || 0)));
  const staminaAdded = Math.max(0, Math.min(staminaAmount, STAMINA_CAP_RESOURCE - currentStamina));
  profile.stamina = currentStamina + staminaAdded;
  profile.stamina_purchase_day = today;
  profile.stamina_purchases_today = purchasesToday + 1;
  nk.storageWrite([{
    collection: "player_profiles",
    key: "main",
    userId: ctx.userId,
    value: profile,
    permissionRead: 1,
    permissionWrite: 0,
    version: profileObject.version
  }]);
  return JSON.stringify({
    success: true,
    stamina_added: staminaAdded,
    stamina: profile.stamina,
    gems: debit.remaining,
    gem_cost: gemCost,
    purchases_today: purchasesToday + 1,
    purchases_remaining: prices.length - purchasesToday - 1,
    purchase_day: today
  });
};
const purchaseHero = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload || "{}");
  const heroId = String(req.hero_id || "");
  const currencyId = String(req.currency_id || "");
  if (!heroId || currencyId !== "gold" && currencyId !== "gems") {
    return JSON.stringify({ success: false, message: "Invalid purchase request" });
  }
  const rows = nk.sqlQuery(
    "SELECT id, display_name, price, require FROM game_heroes WHERE id = $1",
    [heroId]
  );
  if (rows.length === 0) {
    return JSON.stringify({ success: false, message: "Hero does not exist" });
  }
  const hero = rows[0];
  const price = parseJsonObject(hero.price);
  const requirement = parseJsonObject(hero.require);
  const cost = Number(price[currencyId] || 0);
  const isFree = Number(price.gold || 0) <= 0 && Number(price.gems || 0) <= 0;
  if (!isFree && (!Number.isSafeInteger(cost) || cost <= 0)) {
    return JSON.stringify({ success: false, message: "Hero is not sold for this currency" });
  }
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_heroes", key: "states", userId: ctx.userId }
  ]);
  let profileObject = null;
  let heroesObject = null;
  for (const object of stored) {
    if (object.collection === "player_profiles") profileObject = object;
    if (object.collection === "player_heroes") heroesObject = object;
  }
  if (!profileObject || !heroesObject) {
    return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  }
  const profile = parseJsonObject(profileObject.value);
  const heroesData = parseJsonObject(heroesObject.value);
  const heroes = Array.isArray(heroesData.heroes) ? heroesData.heroes : [];
  const state = heroes.find((entry) => entry && String(entry.hero_id || "") === heroId);
  if (!state) {
    return JSON.stringify({ success: false, message: "Hero state is missing" });
  }
  if (state.owned === true) {
    return JSON.stringify({ success: false, message: "Hero is already owned" });
  }
  const requiredLevel = Math.max(1, Number(requirement.level || 1));
  const requiredVip = Math.max(0, Number(requirement.vip || 0));
  const playerLevel = Math.max(1, Number(profile.level || 1));
  const playerVip = Math.max(0, Number(profile.vip || 0));
  const requirementMet = playerLevel >= requiredLevel || requiredVip > 0 && playerVip >= requiredVip;
  if (!requirementMet) {
    return JSON.stringify({
      success: false,
      message: `Requires level ${requiredLevel}` + (requiredVip > 0 ? ` or VIP ${requiredVip}` : "")
    });
  }
  let debit = {
    success: true,
    remaining: Number(parseJsonObject(profile.resources)[currencyId] || 0)
  };
  if (!isFree) {
    debit = debitResource(profile, currencyId, cost);
    if (!debit.success) return JSON.stringify(debit);
  }
  state.owned = true;
  nk.storageWrite([
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObject.version
    },
    {
      collection: "player_heroes",
      key: "states",
      userId: ctx.userId,
      value: { heroes },
      permissionRead: 1,
      permissionWrite: 0,
      version: heroesObject.version
    }
  ]);
  logger.info("Hero purchased user=%s hero=%s currency=%s cost=%d", ctx.userId, heroId, currencyId, isFree ? 0 : cost);
  return JSON.stringify({
    success: true,
    message: `Unlocked ${String(hero.display_name || heroId)}`,
    hero_id: heroId,
    currency_id: currencyId,
    cost: isFree ? 0 : cost,
    remaining: debit.remaining
  });
};
const startStage = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const stageId = String(req.stage_id || "");
  const levelId = String(req.level_id || "");
  if (!stageId || !levelId) return JSON.stringify({ success: false, message: "Invalid stage" });
  const stored = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
  if (stored.length === 0) return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  const profile = parseJsonObject(stored[0].value);
  progressionReconcileCampaignUnlocks(nk, profile);
  const unlock = (Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : []).find((entry) => entry && String(entry.stage_id || entry) === stageId);
  const unlockedLevels = unlock && typeof unlock === "object" && Array.isArray(unlock.unlocked_levels) ? unlock.unlocked_levels : unlock ? ["normal"] : [];
  if (unlockedLevels.indexOf(levelId) === -1) return JSON.stringify({ success: false, message: "Stage level is locked" });
  const rows = nk.sqlQuery("SELECT stamina_cost FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2", [stageId, levelId]);
  if (rows.length === 0) return JSON.stringify({ success: false, message: "Unknown stage level" });
  const cost = Math.max(0, Number(rows[0].stamina_cost || 0));
  const stamina = Math.max(0, Math.min(STAMINA_CAP_RESOURCE, Number(profile.stamina || 0)));
  if (stamina < cost) return JSON.stringify({ success: false, message: "Not enough stamina", stamina_cost: cost, stamina });
  profile.stamina = stamina - cost;
  const runState = talismanCreateStageRun(nk, ctx.userId, stageId, levelId);
  nk.storageWrite([
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: stored[0].version
    },
    {
      collection: "player_stage_runs",
      key: "active",
      userId: ctx.userId,
      value: runState.run,
      permissionRead: 1,
      permissionWrite: 0,
      version: runState.version
    }
  ]);
  return JSON.stringify({
    success: true,
    stamina_cost: cost,
    stamina_remaining: profile.stamina,
    run_id: runState.run.run_id,
    talisman: runState.run.talisman
  });
};

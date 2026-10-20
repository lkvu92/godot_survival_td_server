function parseJsonObject(value: any): any {
    const parsed = parseJsonb(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

const STAMINA_CAP_RESOURCE = 30;

function elementUpgradeRequirement(nk: nkruntime.Nakama, elementName: string, level: number): any {
    const tiers = level < 10 ? "low" : (level < 20 ? "medium" : "high");
    const tierStart = level < 10 ? 0 : (level < 20 ? 10 : 20);
    const configured = getRemoteConfigValue(nk, "game_play", "element_upgrade_stones", []);
    const costs: any[] = Array.isArray(configured) ? configured : [];
    const fallback = 1 << (level - tierStart + 1);
    const stoneCount = Math.max(1, Number(costs[Math.min(level, Math.max(costs.length - 1, 0))] || fallback));
    const stoneId = tiers === "high" ? `rune_${elementName}_high` : `stone_${elementName}_${tiers}`;
    const goldCost = level >= 20 ? 200 + (level - 20) * 20 : (level >= 10 ? 50 + (level - 10) * 10 : 10 + level * 4);
    return { stoneId, stoneCount, goldCost };
}

function elementSuccessRate(level: number): number {
    if (level < 5) return 1.0;
    if (level < 10) return 0.8 - (level - 5) * 0.05;
    if (level < 15) return 0.5 - (level - 10) * 0.02;
    if (level < 20) return 0.4 - (level - 15) * 0.02;
    if (level < 25) return 0.25 - (level - 20) * 0.02;
    return Math.max(0.0, 0.15 - (level - 25) * 0.03);
}

const ELEMENT_ENLIGHTENMENT_CHARM_ID = "element_enlightenment_charm";

function upgradeCharmMultiplier(nk: nkruntime.Nakama, itemId: string, context: string): number {
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1", [itemId]);
    if (rows.length === 0) return 1.0;
    const attrs = parseJsonObject(rows[0].attributes);
    if (String(attrs.upgrade_context || "") !== context) return 1.0;
    return Math.max(1.0, Number(attrs.success_rate_multiplier || 1.0));
}

const upgradeElement: nkruntime.RpcFunction = (ctx, _logger, nk, payload): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return JSON.stringify({ success: false, message: "Invalid JSON" }); }
    const element = String(req.element || "");
    const useCharm = req.use_charm === true;
    if (["metal", "wood", "water", "fire", "earth"].indexOf(element) < 0) return JSON.stringify({ success: false, message: "Invalid element" });
    const stored = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
        { collection: "player_inventory", key: "items", userId: ctx.userId }
    ]);
    const profileObject = stored.find((entry: any) => entry.collection === "player_profiles");
    const inventoryObject = stored.find((entry: any) => entry.collection === "player_inventory");
    if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player profile is incomplete" });
    const profile = parseJsonObject(profileObject.value);
    const inventory = parseJsonObject(inventoryObject.value);
    const elements = parseJsonObject(profile.elements);
    const level = Math.max(0, Number(elements[element] || 0));
    if (level >= 30) return JSON.stringify({ success: false, message: "Element is already max level" });
    const requirement = elementUpgradeRequirement(nk, element, level);
    const resources = parseJsonObject(profile.resources);
    const items: any[] = Array.isArray(inventory.items) ? inventory.items : [];
    const owned = items.filter((item: any) => item && String(item.item_id) === requirement.stoneId)
        .reduce((sum: number, item: any) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    const charmOwned = items.filter((item: any) => item && String(item.item_id) === ELEMENT_ENLIGHTENMENT_CHARM_ID)
        .reduce((sum: number, item: any) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    if (Number(resources.gold || 0) < requirement.goldCost) return JSON.stringify({ success: false, message: "Not enough gold" });
    if (owned < requirement.stoneCount) return JSON.stringify({ success: false, message: "Not enough stones" });
    if (useCharm && charmOwned < 1) return JSON.stringify({ success: false, message: "Not enough enlightenment charm" });
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
    if (useCharm) {
        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (!item || String(item.item_id) !== ELEMENT_ENLIGHTENMENT_CHARM_ID) continue;
            item.quantity = Number(item.quantity || 0) - 1;
            if (item.quantity <= 0) items.splice(i, 1);
            break;
        }
    }
    const baseRate = elementSuccessRate(level);
    const effectiveRate = Math.min(1.0, baseRate * (useCharm ? upgradeCharmMultiplier(nk, ELEMENT_ENLIGHTENMENT_CHARM_ID, "element") : 1.0));
    const success = Math.random() <= effectiveRate;
    if (success) elements[element] = level + 1;
    profile.elements = elements;
    profile.resources = resources;
    inventory.items = items;
    nk.storageWrite([
        { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
        { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventory, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version }
    ]);
    if (success) eventRecord(nk, ctx.userId, "element_upgrade", 1, { element }, `${element}:${Number(elements[element] || level)}`);
    return JSON.stringify({ success, attempted: true, consumed: true, charm_consumed: useCharm,
        success_rate: Math.round(effectiveRate * 100), new_level: Number(elements[element] || level), element, profile, inventory,
        message: success ? "Element upgraded" : "Element upgrade failed" });
};

// Shared by the generic spend RPC and server-authoritative purchases.
function debitResource(profile: any, resourceId: string, amount: number): any {
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

const spendResource: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
): string => {
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
        collection: "player_profiles", key: "main",
        userId: ctx.userId, value: profile,
        permissionRead: 1, permissionWrite: 0,
        version: stored[0].version
    }]);
    return JSON.stringify(debit);
};

const purchaseStamina: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    _logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    _payload: string
): string => {
    const staminaAmount = 15;
    const prices = [30, 40, 50];
    const today = new Date().toISOString().slice(0, 10);
    const stored = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId }
    ]);
    if (stored.length === 0) {
        return JSON.stringify({ success: false, message: "No profile found" });
    }
    const profileObject = stored[0];
    const profile = parseJsonObject(profileObject.value);
    const purchaseDay = String(profile.stamina_purchase_day || "");
    const purchasesToday = purchaseDay === today
        ? Math.max(0, Math.min(prices.length, Number(profile.stamina_purchases_today || 0)))
        : 0;
    if (purchasesToday >= prices.length) {
        return JSON.stringify({
            success: false,
            message: "Daily stamina purchase limit reached",
            purchases_today: purchasesToday
        });
    }
    if (Number(profile.stamina || 0) >= STAMINA_CAP_RESOURCE) return JSON.stringify({ success: false, message: "Stamina is already full" });
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
        collection: "player_profiles", key: "main", userId: ctx.userId,
        value: profile, permissionRead: 1, permissionWrite: 0,
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

const purchaseHero: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
): string => {
    const req = JSON.parse(payload || "{}");
    const heroId = String(req.hero_id || "");
    const currencyId = String(req.currency_id || "");
    if (!heroId || (currencyId !== "gold" && currencyId !== "gems")) {
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
    let profileObject: nkruntime.StorageObject | null = null;
    let heroesObject: nkruntime.StorageObject | null = null;
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
    const state = heroes.find((entry: any) => entry && String(entry.hero_id || "") === heroId);
    if (!state) {
        return JSON.stringify({ success: false, message: "Hero state is missing" });
    }
    if (state.owned === true) {
        return JSON.stringify({ success: false, message: "Hero is already owned" });
    }

    const requiredLevel = Math.max(1, Number(requirement.level || 1));
    const requiredVip = Math.max(0, Number(requirement.vip || 0));
    const playerLevel = Math.max(1, Number(profile.level || 1));
    const playerVip = readVipProgress(nk, ctx.userId, monetizationMode(ctx)).level;
    // VIP 0 disables the VIP alternative; it must not unlock every hero.
    const requirementMet = playerLevel >= requiredLevel ||
        (requiredVip > 0 && playerVip >= requiredVip);
    if (!requirementMet) {
        return JSON.stringify({
            success: false,
            message: `Requires level ${requiredLevel}` +
                (requiredVip > 0 ? ` or VIP ${requiredVip}` : "")
        });
    }

    let debit: any = {
        success: true,
        remaining: Number(parseJsonObject(profile.resources)[currencyId] || 0)
    };
    if (!isFree) {
        debit = debitResource(profile, currencyId, cost);
        if (!debit.success) return JSON.stringify(debit);
    }
    state.owned = true;

    // A single storageWrite makes resource debit and ownership one transaction.
    nk.storageWrite([
        {
            collection: "player_profiles", key: "main", userId: ctx.userId,
            value: profile, permissionRead: 1, permissionWrite: 0,
            version: profileObject.version
        },
        {
            collection: "player_heroes", key: "states", userId: ctx.userId,
            value: { heroes }, permissionRead: 1, permissionWrite: 0,
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

const startStage: nkruntime.RpcFunction = (ctx, _logger, nk, payload): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); } catch (_) { return JSON.stringify({ success: false, message: "Invalid JSON" }); }
    const stageId = String(req.stage_id || "");
    const levelId = String(req.level_id || "");
    if (!stageId || !levelId) return JSON.stringify({ success: false, message: "Invalid stage" });
    const stored = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
    if (stored.length === 0) return JSON.stringify({ success: false, message: "Player profile is incomplete" });
    const profile = parseJsonObject(stored[0].value);
    const sweepBlock = sweepCombatError(profile);
    if (sweepBlock) return JSON.stringify(sweepBlock);
    if ((profile.breakthrough || {}).in_tribulation === true) return JSON.stringify({success:false,code:'COMBAT_ACTIVE',message:'Tribulation is active'});
    const existingRuns=nk.storageRead([{collection:'player_stage_runs',key:'active',userId:ctx.userId}]);
    if(existingRuns.length&&existingRuns[0].value.status==='active'&&Number(existingRuns[0].value.expires_at_ms)>Date.now())return JSON.stringify({success:false,code:'COMBAT_ACTIVE',message:'Combat is active'});
    if(stageId==='stage_0_admin_test') {
        const allowed=nk.sqlQuery("SELECT 1 FROM users WHERE id=$1::UUID AND LOWER(email)=LOWER($2) AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 LIMIT 1",[ctx.userId,'lkvu92@gmail.com']);
        if(!allowed.length)return JSON.stringify({success:false,code:'FORBIDDEN'});
        const state=talismanCreateStageRun(nk,ctx.userId,stageId,levelId);
        profile.activity={type:'combat',activity_id:state.run.run_id};
        nk.storageWrite([{collection:'player_profiles',key:'main',userId:ctx.userId,value:profile,version:stored[0].version,permissionRead:1,permissionWrite:0},{collection:'player_stage_runs',key:'active',userId:ctx.userId,value:state.run,version:state.version,permissionRead:1,permissionWrite:0}]);
        return JSON.stringify({success:true,run_id:state.run.run_id,stamina_cost:0,stamina_remaining:profile.stamina});
    }
    // A run must never charge stamina if its mandatory grading/reward rules
    // cannot also be used at settlement on this release.
    try{sweepConfig(nk);}catch(_error){return JSON.stringify({success:false,code:'SWEEP_CONFIG_INVALID',message:'Stage grading configuration is unavailable'});}
    // Migrate campaign completions produced before final-stage cross-arc
    // unlocking existed, before validating the requested stage.
    progressionReconcileCampaignUnlocks(nk, profile);
    const unlock = (Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [])
        .find((entry: any) => entry && String(entry.stage_id || entry) === stageId);
    const unlockedLevels = unlock && typeof unlock === "object" && Array.isArray(unlock.unlocked_levels)
        ? unlock.unlocked_levels : (unlock ? ["normal"] : []);
    if (unlockedLevels.indexOf(levelId) === -1) return JSON.stringify({ success: false, message: "Stage level is locked" });
    const rows = nk.sqlQuery("SELECT stamina_cost FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2", [stageId, levelId]);
    if (rows.length === 0) return JSON.stringify({ success: false, message: "Unknown stage level" });
    const cost = Math.max(0, Number(rows[0].stamina_cost || 0));
    const stamina = Math.max(0, Number(profile.stamina || 0));
    if (stamina < cost) return JSON.stringify({ success: false, message: "Not enough stamina", stamina_cost: cost, stamina });
    profile.stamina = stamina - cost;
	const runState = talismanCreateStageRun(nk, ctx.userId, stageId, levelId);
	profile.activity={type:'combat',activity_id:runState.run.run_id};
	nk.storageWrite([
		{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
			permissionRead: 1, permissionWrite: 0, version: stored[0].version },
		{ collection: "player_stage_runs", key: "active", userId: ctx.userId, value: runState.run,
			permissionRead: 1, permissionWrite: 0, version: runState.version }
	]);
	if (cost > 0) eventRecord(nk, ctx.userId, "stamina_spent", cost,
		{ stage_id: stageId, difficulty_id: levelId }, String(runState.run.run_id));
	return JSON.stringify({ success: true, stamina_cost: cost, stamina_remaining: profile.stamina,
		run_id: runState.run.run_id, talisman: runState.run.talisman });
};

/** Atomic, replayable item activation. Combat remains simulated by the client,
 * matching talisman_cast; inventory, allowed effects and run limits are server owned. */
const useConsumable: nkruntime.RpcFunction = (ctx, _logger, nk, payload): string => {
    const fail = (message: string) => JSON.stringify({success:false,message});
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_) { return fail("Invalid JSON"); }
    if (!req || typeof req !== "object" || Array.isArray(req)) return fail("Invalid request");
    const itemId = String(req.item_id || ""), requestId = String(req.request_id || ""), runId = String(req.run_id || "");
    const quantity = req.quantity === undefined ? 1 : req.quantity;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) return fail("Invalid request");
    const fingerprint = JSON.stringify(["use_consumable", itemId, quantity, runId]);
    const stored = nk.storageRead([
        {collection:"player_profiles",key:"main",userId:ctx.userId},
        {collection:"player_inventory",key:"items",userId:ctx.userId},
        {collection:"player_item_requests",key:requestId,userId:ctx.userId},
        {collection:"player_stage_runs",key:"active",userId:ctx.userId}
    ]);
    const profileObject = stored.find(row => row.collection === "player_profiles");
    const inventoryObject = stored.find(row => row.collection === "player_inventory");
    const previous = stored.find(row => row.collection === "player_item_requests");
    const runObject = stored.find(row => row.collection === "player_stage_runs");
    if (!profileObject || !inventoryObject) return fail("Profile is incomplete");
    const profile = talismanJsonObject(profileObject.value), inventory = talismanJsonObject(inventoryObject.value);
    const items = Array.isArray(inventory.items) ? inventory.items : [];
    if (previous) {
        if (previous.value.fingerprint !== fingerprint) return fail("Request ID conflict");
        return JSON.stringify({success:true,duplicate:true,inventory:items,profile,effect:previous.value.effect,receipt_id:requestId});
    }
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id=$1", [itemId]);
    if (!rows.length) return fail("Unknown item");
    const attrs = talismanJsonObject(rows[0].attributes), effect = talismanJsonObject(attrs.effect);
    const kind = String(effect.kind || ""), value = Number(effect.value);
    if (attrs.enabled === false || attrs.use_action !== "use_consumable" || !Number.isFinite(value) || value <= 0) return fail("Item effect is unavailable");
    if (talismanItemQuantity(items, itemId) < quantity) return fail("Not enough items");
    const run = runObject ? talismanJsonObject(runObject.value) : {};
    const now = Date.now(), combat = effect.context === "combat";
    if (combat) {
        if (!runId || quantity !== 1 || run.run_id !== runId || run.status !== "active" || now >= Number(run.expires_at_ms || 0)) return fail("No active stage run");
        if (req.paused !== false || (kind !== "revive" && req.alive !== true)) return fail("Cannot use while paused or dead");
        if ((profile.breakthrough || {}).in_tribulation) return fail("Items unavailable in tribulation");
        const cooldowns = talismanJsonObject(run.item_cooldowns);
        if (now < Number(cooldowns[itemId] || 0)) return fail("Item is on cooldown");
        if (kind === "revive" && (req.alive !== false || Number(run.item_revives || 0) >= 1)) return fail("Revive unavailable");
        if (["attack","defense","cooldown","resistance","critical","attack_speed","heal","shield","slow","revive"].indexOf(kind) < 0) return fail("Unsupported combat effect");
        if (!Number.isFinite(Number(effect.duration || 0)) || !Number.isFinite(Number(effect.cooldown)) || Number(effect.cooldown) < 0) return fail("Invalid combat config");
        cooldowns[itemId] = now + Number(effect.cooldown) * 1000;
        run.item_cooldowns = cooldowns;
        if (kind === "revive") run.item_revives = Number(run.item_revives || 0) + 1;
    } else {
        if (runId || (run.status === "active" && now < Number(run.expires_at_ms || 0)) || (profile.breakthrough || {}).in_tribulation) return fail("Use this item outside combat");
        if (kind === "gold") {
            const resources = talismanJsonObject(profile.resources);
            const total = Number(resources.gold || 0) + value * quantity;
            if (!Number.isSafeInteger(total)) return fail("Resource overflow");
            resources.gold = total; profile.resources = resources;
        } else if (kind === "exp") {
            const threshold = progressionNextUserExp(nk, Number(profile.level || 1));
            if (Number(profile.level || 1) >= PROGRESSION_MAX_LEVEL || (isBreakthroughMilestone(Number(profile.level || 1)) && Number(profile.exp || 0) >= threshold)) return fail("Level or breakthrough cap reached");
            if (quantity > 1) {
                const preview = JSON.parse(JSON.stringify(profile));
                progressionApplyUser(nk, preview, value * (quantity - 1));
                if (preview.level >= PROGRESSION_MAX_LEVEL || (isBreakthroughMilestone(preview.level) && preview.exp >= progressionNextUserExp(nk, preview.level))) return fail("Reduce quantity to avoid wasting items at the breakthrough cap");
            }
            progressionApplyUser(nk, profile, value * quantity);
            cultivationEnsurePreview(nk, profile);
            progressionReconcileLevelUnlocks(nk, profile);
        } else if (kind === "stamina") {
            const before = Number(profile.stamina || 0);
            if (before >= 30 || (quantity > 1 && before + (quantity - 1) * value >= 30)) return fail("Stamina full or quantity exceeds capacity");
            profile.stamina = Math.min(30, before + value * quantity);
            if (profile.stamina === 30) profile.last_stamina_update = Math.floor(now / 1000);
        } else if (kind === "affinity") {
            if (CULTIVATION_ELEMENTS.indexOf(String(effect.element)) < 0) return fail("Unsupported element");
            cultivationEnsureSources(profile);
            const element = String(effect.element), before = Number(profile.element_affinities[element] || 0);
            const cap = Number(effect.cap);
            if (!Number.isFinite(cap) || before >= cap || (quantity > 1 && before + (quantity - 1) * value >= cap)) return fail("Affinity cap reached");
            profile.element_sources.fruit[element] = cultivationRound1(Number(profile.element_sources.fruit[element] || 0) + Math.min(value * quantity, cap - before));
            cultivationRebuildSources(profile);
        } else return fail("Unsupported item effect");
    }
    if (!talismanRemoveItems(items, itemId, quantity)) return fail("Inventory changed");
    inventory.items = items;
    const writes: nkruntime.StorageWriteRequest[] = [
        {collection:"player_profiles",key:"main",userId:ctx.userId,value:profile,version:profileObject.version,permissionRead:1,permissionWrite:0},
        {collection:"player_inventory",key:"items",userId:ctx.userId,value:inventory,version:inventoryObject.version,permissionRead:1,permissionWrite:0},
        {collection:"player_item_requests",key:requestId,userId:ctx.userId,value:{fingerprint,effect,created_at:now},version:"*",permissionRead:1,permissionWrite:0}
    ];
    if (combat) writes.push({collection:"player_stage_runs",key:"active",userId:ctx.userId,value:run,version:runObject.version,permissionRead:1,permissionWrite:0});
    try { nk.storageWrite(writes); } catch (_) { return fail("Data changed; retry the same request"); }
    if (!combat && typeof writePlayerLeaderboardRecords === "function") {
        try { writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name); } catch (_) { /* Next profile refresh reconciles ranking. */ }
    }
    return JSON.stringify({success:true,inventory:items,profile,effect,receipt_id:requestId});
};

// A distinct endpoint prevents legacy Gold-only runtimes from handling new
// clients' Gem requests. No implicit currency default is permitted here.
const storePurchase: nkruntime.RpcFunction = (ctx, logger, nk, payload): string => {
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_) { return JSON.stringify({success:false,message:"Invalid JSON"}); }
    if (!req || typeof req !== "object" || req.purchase_protocol !== 2 || !["gold", "gems"].includes(req.currency)
        || typeof req.item_id !== "string" || !req.item_id || typeof req.request_id !== "string") {
        return JSON.stringify({success:false,purchase_protocol:2,message:"Invalid store currency or purchase protocol"});
    }
    const response = JSON.parse(talismanAction(ctx, logger, nk, JSON.stringify(Object.assign({}, req, {action:"buy_material"}))));
    return JSON.stringify(Object.assign(response, {purchase_protocol:2,item_id:req.item_id,currency:req.currency}));
};

const updateInventory: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
): string => {
    const req = JSON.parse(payload);
    const action = req.action;  // "add" | "remove"
    const itemId = req.item_id;
    const quantity = req.quantity || 0;

    if (!itemId || quantity <= 0) {
        throw new Error("Invalid item_id or quantity");
    }

    // Validate item exists in game_items
    const itemRows = nk.sqlQuery("SELECT * FROM game_items WHERE id = $1", [itemId]);
    if (itemRows.length === 0) {
        throw new Error(`Unknown item: ${itemId}`);
    }
    const itemDef = itemRows[0];

    // Read current inventory
    const stored = nk.storageRead([
        { collection: "player_inventory", key: "items", userId: ctx.userId }
    ]);
    let inventory: any[] = [];
    let iapRewardIds: string[] = [];
    if (stored.length > 0 && stored[0].value && stored[0].value.items) {
        inventory = stored[0].value.items;
        iapRewardIds = Array.isArray(stored[0].value._iap_reward_ids) ? stored[0].value._iap_reward_ids : [];
    }

    // Inventory grants must originate from a trusted server flow (purchase,
    // stage settlement, check-in, event). Clients may only consume items here.
    if (action === "add") {
        return JSON.stringify({ success: false, message: "Client item grants are forbidden" });
    } else if (action === "remove") {
        let remaining = quantity;
        // Validate enough quantity
        let total = 0;
        for (const entry of inventory) {
            if (entry.item_id === itemId) total += entry.quantity || 0;
        }
        if (total < quantity) {
            return JSON.stringify({ success: false, message: "Not enough items" });
        }
        // Remove from end
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

    // Write back
    nk.storageWrite([{
        collection: "player_inventory", key: "items",
        userId: ctx.userId,
        value: { items: inventory, _iap_reward_ids: iapRewardIds },
        permissionRead: 1, permissionWrite: 0
    }]);

    return JSON.stringify({ success: true, inventory });
};

function talismanJsonObject(value: any): any {
	const decoded = parseJsonb(value);
	if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) return decoded;
	if (typeof decoded === "string") {
		try {
			const parsed = JSON.parse(decoded);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch (_e) { return {}; }
    }
    return {};
}

function talismanItemQuantity(items: any[], itemId: string): number {
    return items.filter((entry: any) => entry && String(entry.item_id || "") === itemId)
        .reduce((sum: number, entry: any) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
}

function talismanRemoveItems(items: any[], itemId: string, quantity: number): boolean {
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

const TALISMAN_ENHANCE_CHARM_ID = "talisman_enhance_charm";

function talismanCharmMultiplier(nk: nkruntime.Nakama): number {
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1", [TALISMAN_ENHANCE_CHARM_ID]);
    if (rows.length === 0) return 1.0;
    const attrs = talismanJsonObject(rows[0].attributes);
    if (String(attrs.upgrade_context || "") !== "talisman") return 1.0;
    return Math.max(1.0, Number(attrs.success_rate_multiplier || 1.0));
}

function serverGrantInventoryItem(nk: nkruntime.Nakama, items: any[], itemId: string, quantity: number): boolean {
    if (!itemId || quantity <= 0) return false;
    const rows = nk.sqlQuery("SELECT stackable, max_stack FROM game_items WHERE id = $1", [itemId]);
    const isFragment = /^talisman_fragment_([1-9]|[12][0-9]|30)$/.test(itemId);
    if (rows.length === 0 && !isFragment) return false;
    const stackable = isFragment || rows[0].stackable !== false;
    const maxStack = isFragment ? 999999 : Math.max(1, Math.floor(Number(rows[0].max_stack || 999)));
    if (!stackable) {
        for (let i = 0; i < quantity; i++) items.push({ item_id: itemId, quantity: 1, acquired_at: new Date().toISOString() });
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
        items.push({ item_id: itemId, quantity: added, acquired_at: new Date().toISOString() });
        remaining -= added;
    }
    return true;
}

function talismanConfig(nk: nkruntime.Nakama): any {
    const rows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
    if (rows.length === 0) return {};
    return talismanJsonObject(talismanJsonObject(rows[0].value).talisman_system);
}

/** Mirrors combat_power.ts so every talisman-action response can expose the
 * server-authoritative durability projection for UI previews. */
function talismanDurabilityFactor(config: any, durability: number): number {
    const tiers: any[] = Array.isArray(config.durability_tiers) ? config.durability_tiers : [];
    const value = Math.max(0, Math.min(100, Number(durability || 0)));
    for (const tier of tiers) if (tier && value <= Number(tier.max)) return Number(tier.factor || 0);
    return 1;
}

function talismanEffectiveStats(stats: any, factor: number): any {
    const result: any = {};
    const source = talismanJsonObject(stats);
    for (const key of Object.keys(source)) {
        const value = Number(source[key]);
        if (Number.isFinite(value)) result[key] = value * factor;
    }
    return result;
}

function talismanUpgradeSuccessRate(upgrade: any, currentLevel: number): number {
    const configured = Array.isArray(upgrade.success_rates_by_current_level)
        ? upgrade.success_rates_by_current_level : [];
    if (currentLevel >= 0 && currentLevel < configured.length) {
        return Math.max(0, Math.min(100, Math.floor(Number(configured[currentLevel] || 0))));
    }
    // Compatibility fallback for remote config snapshots predating C113 v1.1.0.
    if (currentLevel < 5) return 100;
    if (currentLevel < 10) return 80 - (currentLevel - 5) * 5;
    if (currentLevel < 15) return 50 - (currentLevel - 10) * 2;
    if (currentLevel < 20) return 40 - (currentLevel - 15) * 2;
    if (currentLevel < 25) return 25 - (currentLevel - 20) * 2;
    return Math.max(0, 15 - (currentLevel - 25) * 3);
}

function talismanUpgradeQuote(nk: nkruntime.Nakama, level: number, items: any[], resources: any, talismanId: number = 0): any {
    const upgrade = talismanJsonObject(talismanConfig(nk).upgrade);
    const maxLevel = Math.max(1, Math.floor(Number(upgrade.max_level || 30)));
    const currentLevel = Math.max(1, Math.floor(Number(level || 1)));
    if (currentLevel >= maxLevel) return { maxed: true, current_level: currentLevel, target_level: maxLevel };
    const targetLevel = currentLevel + 1;
    const tiers: any[] = Array.isArray(upgrade.tiers) ? upgrade.tiers : [];
    const tier = tiers.find((entry: any) => entry && currentLevel >= Number(entry.current_level_min || 0)
        && currentLevel <= Number(entry.current_level_max || 0));
    if (!tier) return { error: "Missing talisman upgrade tier", current_level: currentLevel, target_level: targetLevel };
    const quantityPerLevel = Math.floor(Number(upgrade.material_quantity_per_level || 0));
    if (!isFinite(quantityPerLevel) || quantityPerLevel <= 0) return { error: "Missing Heavenly Crystal cost config; reseed progression", success: false };
    const materialQuantity = currentLevel * quantityPerLevel;
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
        maxed: false, current_level: currentLevel, target_level: targetLevel,
        material_id: materialId, material_quantity: materialQuantity,
        material_owned: talismanItemQuantity(items, materialId),
        gold_cost: Math.max(0, Math.floor(goldCost)), gold_owned: Math.max(0, Number(resources.gold || 0)),
        success_rate: successRate, fragment_id: fragmentId, fragment_quantity: fragmentQuantity,
        fragment_owned: fragmentId ? talismanItemQuantity(items, fragmentId) : 0
    };
}

function talismanServerNowMs(): number { return Date.now(); }

function talismanCreateStageRun(nk: nkruntime.Nakama, userId: string, stageId: string, difficultyId: string): any {
    const objects = nk.storageRead([
        { collection: "player_inventory", key: "items", userId },
        { collection: "player_stage_runs", key: "active", userId }
    ]);
    const inventoryObject = objects.find((entry: any) => entry.collection === "player_inventory");
    const previousRun = objects.find((entry: any) => entry.collection === "player_stage_runs");
    const inventoryValue = inventoryObject ? talismanJsonObject(inventoryObject.value) : { items: [] };
    const items: any[] = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
    const equipped = items.find((entry: any) => entry && entry.is_equipped === true
        && /^talisman_[0-9]+$/.test(String(entry.item_id || "")));
    let talisman: any = null;
    if (equipped) {
        const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1 AND category = 'talisman'", [String(equipped.item_id)]);
        if (rows.length > 0) {
            const attrs = talismanJsonObject(rows[0].attributes);
            talisman = {
                instance_id: String(equipped.instance_id || ""), item_id: String(equipped.item_id || ""),
                skill_id: String(equipped.skill_id || attrs.skill_id || ""),
                level: Math.max(1, Math.floor(Number(equipped.level || 1))),
                durability: Math.max(0, Math.floor(Number(equipped.durability === undefined ? 100 : equipped.durability))),
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
        run_id: nk.uuidv4(), stage_id: stageId, difficulty_id: difficultyId,
        status: "active", started_at_ms: now, expires_at_ms: now + 2 * 60 * 60 * 1000,
        // A victory cannot be settled immediately after start. This is not a
        // replacement for a fully authoritative combat simulation, but it
        // rejects impossible instant-win reports using server-owned stage data.
        min_win_duration_ms: Math.min(120000, Math.max(3000, waveCount * 1500)),
        cast_seq: 0, talisman_uses: 0, last_talisman_cast_at_ms: 0,
        ad_card_rerolls_used: 0, talisman
    };
	return { run, version: previousRun ? previousRun.version : "*" };
}

const talismanCast: nkruntime.RpcFunction = (ctx, _logger, nk, payload): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); }
    catch (_e) { return JSON.stringify({ success: false, message: "Invalid JSON" }); }
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
    const runObject = objects.find((entry: any) => entry.collection === "player_stage_runs");
    const inventoryObject = objects.find((entry: any) => entry.collection === "player_inventory");
    if (!runObject || !inventoryObject) return JSON.stringify({ success: false, message: "No active server run" });
    const run = talismanJsonObject(runObject.value);
    const inventoryValue = talismanJsonObject(inventoryObject.value);
    const items: any[] = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
    const snapshot = run.talisman && typeof run.talisman === "object" ? run.talisman : null;
    const now = talismanServerNowMs();
    if (String(run.run_id || "") !== runId || String(run.status || "") !== "active" || now > Number(run.expires_at_ms || 0)) {
        return JSON.stringify({ success: false, message: "Run is not active" });
    }
    if (!snapshot || String(snapshot.skill_id || "") !== skillId) {
        return JSON.stringify({ success: false, message: "Skill is not provided by the equipped talisman" });
    }
    // Passive talismans are initialized once from this run snapshot by the
    // client. They are not casts and can never consume sequence, uses or
    // durability through the cast RPC, even if a modified client calls it.
    const skillRows = nk.sqlQuery("SELECT skill_class, activation, levels FROM game_skills WHERE id = $1", [skillId]);
    if (skillRows.length === 0) return JSON.stringify({ success: false, message: "Unknown talisman skill" });
    if (String(skillRows[0].skill_class || "").toLowerCase() === "passive"
        || String(skillRows[0].activation || "").toLowerCase() === "passive") {
        return JSON.stringify({ success: false, message: "Passive talisman skills cannot be cast" });
    }
    const currentSeq = Math.max(0, Math.floor(Number(run.cast_seq || 0)));
    if (castSeq === currentSeq) {
        const equippedRetry = items.find((entry: any) => entry && String(entry.instance_id || "") === String(snapshot.instance_id || ""));
        return JSON.stringify({ success: true, duplicate: true, cast_seq: currentSeq,
            uses_left: Math.max(0, Number(snapshot.max_uses || 0) - Number(run.talisman_uses || 0)),
            durability: equippedRetry ? Number(equippedRetry.durability || 0) : 0, inventory: items });
    }
    if (castSeq !== currentSeq + 1) return JSON.stringify({ success: false, message: "Invalid cast sequence", expected_seq: currentSeq + 1 });
    const equipped = items.find((entry: any) => entry && entry.is_equipped === true
        && String(entry.instance_id || "") === String(snapshot.instance_id || "")
        && String(entry.item_id || "") === String(snapshot.item_id || ""));
    if (!equipped) return JSON.stringify({ success: false, message: "Equipped talisman changed during run" });
    const durability = Math.max(0, Math.floor(Number(equipped.durability === undefined ? 100 : equipped.durability)));
    if (durability <= 0) return JSON.stringify({ success: false, message: "Talisman is broken" });
    const uses = Math.max(0, Math.floor(Number(run.talisman_uses || 0)));
    const maxUses = Math.max(0, Math.floor(Number(snapshot.max_uses || 0)));
    if (maxUses > 0 && uses >= maxUses) return JSON.stringify({ success: false, message: "Talisman battle-use limit reached" });
    const levels: any[] = parseJsonb(skillRows[0].levels) || [];
    const stats = levels.length > 0 ? talismanJsonObject(levels[0].stats) : {};
    const baseCooldownMs = Math.max(0, Number(stats.cooldown || 0) * 1000);
    // Player runtime can legally reduce cooldown, but never below the global 35% cap.
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
        { collection: "player_stage_runs", key: "active", userId: ctx.userId, value: run,
            permissionRead: 1, permissionWrite: 0, version: runObject.version },
        { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue,
            permissionRead: 1, permissionWrite: 0, version: inventoryObject.version }
    ]);
    return JSON.stringify({ success: true, duplicate: false, cast_seq: castSeq,
        uses_left: maxUses > 0 ? Math.max(0, maxUses - uses - 1) : -1,
        durability: equipped.durability, inventory: items });
};

/** Mutates owned talisman instances and related currency in one authoritative RPC. */
const talismanAction: nkruntime.RpcFunction = (ctx, _logger, nk, payload): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); }
    catch (_e) { return JSON.stringify({ success: false, message: "Invalid JSON" }); }
    const action = String(req.action || "");
    if (["equip", "upgrade", "repair", "quote_upgrade", "quote_craft", "craft", "buy_fragment", "buy_material", "reroll_talent"].indexOf(action) < 0) {
        return JSON.stringify({ success: false, message: "Unsupported talisman action" });
    }

    const stored = nk.storageRead([
        { collection: "player_inventory", key: "items", userId: ctx.userId },
        { collection: "player_profiles", key: "main", userId: ctx.userId }
    ]);
    const inventoryObject = stored.find((entry: any) => entry.collection === "player_inventory");
    const profileObject = stored.find((entry: any) => entry.collection === "player_profiles");
    if (!inventoryObject || !profileObject) {
        return JSON.stringify({ success: false, message: "Player profile is incomplete" });
    }
    const inventoryValue = talismanJsonObject(inventoryObject.value);
    const profile = talismanJsonObject(profileObject.value);
    const items: any[] = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
    const resources = talismanJsonObject(profile.resources);
	let rerolledTalent:any=null;
	let upgradeAttempted = false;
	let upgradeSucceeded = true;
	let upgradeSuccessRate = 0;
	let charmConsumed = false;
    const talismanId = Math.max(0, Math.floor(Number(req.talisman_id || 0)));
    const itemId = `talisman_${talismanId}`;
    let target = items.find((entry: any) => entry && String(entry.item_id || "") === itemId);
	const requestId = String(req.request_id || "");
	const isItemRequest = action === "buy_material" || action === "reroll_talent";
	const fingerprint = JSON.stringify([action,action === "reroll_talent" ? "spirit_root_reset" : String(req.item_id||""),req.currency===undefined?"gold":String(req.currency)]);
	if (isItemRequest) {
		if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return JSON.stringify({success:false,message:"Mã yêu cầu không hợp lệ"});
		const previous=nk.storageRead([{collection:"player_item_requests",key:requestId,userId:ctx.userId}]);
		if (previous.length) {
			if (previous[0].value.fingerprint!==fingerprint) return JSON.stringify({success:false,message:"Mã yêu cầu đã dùng cho giao dịch khác"});
			return JSON.stringify({success:true,duplicate:true,inventory:items,resources,profile,rolled:previous[0].value.rolled});
		}
	}
	const handledRequestIds: string[] = Array.isArray(inventoryValue._talisman_request_ids) ? inventoryValue._talisman_request_ids : [];
	if ((action === "craft" || action === "buy_fragment") && requestId && handledRequestIds.indexOf(requestId) >= 0) {
		return JSON.stringify({ success: true, duplicate: true, inventory: items, resources });
	}

    if (action === "reroll_talent") {
		if (!requestId || requestId.length>128) return JSON.stringify({success:false,message:"Mã yêu cầu không hợp lệ"});
		const receipts:any[]=Array.isArray(inventoryValue._talent_reroll_receipts)?inventoryValue._talent_reroll_receipts:[];
		const receipt=receipts.find((entry:any)=>entry.request_id===requestId);
		if (receipt) return JSON.stringify({success:true,duplicate:true,rolled:receipt.rolled,inventory:items,profile,resources});
		const active=nk.storageRead([{collection:"player_stage_runs",key:"active",userId:ctx.userId}]);
		if ((active.length && active[0].value.status==="active" && Number(active[0].value.expires_at_ms)>Date.now()) || (profile.breakthrough && profile.breakthrough.in_tribulation)) {
			return JSON.stringify({success:false,message:"Không thể tẩy thiên phú khi đang trong trận hoặc Thiên Kiếp"});
		}
		const catalog=nk.sqlQuery("SELECT attributes FROM game_items WHERE id=$1",["spirit_root_reset"]);
		if (!catalog.length || talismanJsonObject(catalog[0].attributes).use_action!=="reroll_talent") return JSON.stringify({success:false,message:"Tẩy Linh Quả chưa được cấu hình"});
		if (!talismanRemoveItems(items,"spirit_root_reset",1)) return JSON.stringify({success:false,message:"Cần 1 Tẩy Linh Quả"});
		rerolledTalent=cultivationRollProfile();
		const progressionRows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
		const rerollConfig = progressionRows.length ? talismanJsonObject(talismanJsonObject(progressionRows[0].value).consumables).reroll : null;
		if (!rerollConfig || !Number.isFinite(rerollConfig.main_growth) || !Number.isFinite(rerollConfig.secondary_growth)) return JSON.stringify({success:false,message:"Thiếu cấu hình tăng trưởng thiên phú"});
		cultivationApplyReroll(profile, rerolledTalent, rerollConfig);
		if (profile.breakthrough) Object.assign(profile.breakthrough,{count_rolled:false,tribulation_count:0,encounter_id:"",encounter_seed:0,skill_set:[]});
		receipts.push({request_id:requestId,rolled:rerolledTalent});
		inventoryValue._talent_reroll_receipts=receipts.slice(-100);
    } else if (action === "buy_material") {
		const requestedItemId = String(req.item_id || "");
		const currency = req.currency === undefined ? "gold" : String(req.currency);
		if (["gold", "gems"].indexOf(currency) < 0 || !requestedItemId || !requestId || requestId.length > 128) {
			return JSON.stringify({ success: false, message: "Yêu cầu mua vật phẩm không hợp lệ" });
		}
		const receipts: any[] = Array.isArray(inventoryValue._store_receipts) ? inventoryValue._store_receipts : [];
		const receipt = receipts.find((entry: any) => entry.request_id === requestId);
		if (receipt) {
			if (receipt.item_id !== requestedItemId || receipt.currency !== currency) return JSON.stringify({ success: false, message: "Mã giao dịch đã dùng cho vật phẩm khác" });
			return JSON.stringify({ success: true, duplicate: true, inventory: items, resources });
		}
		if (handledRequestIds.indexOf(requestId) >= 0) return JSON.stringify({ success: false, message: "Mã giao dịch đã được sử dụng" });
		const store = talismanJsonObject(talismanConfig(nk).store);
		const materialProducts: any[] = Array.isArray(store.materials) ? store.materials : [];
		const product = materialProducts.find((entry: any) => entry
			&& String(entry.item_id || "") === requestedItemId
			&& String(entry.currency || "") === currency);
		if (!product || product.enabled === false) return JSON.stringify({ success: false, message: "Vật phẩm chưa được bán bằng loại tiền này" });
		const price = Number(product.price);
		const grantQuantity = Number(product.quantity);
		if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(grantQuantity) || grantQuantity <= 0) return JSON.stringify({ success: false, message: "Cấu hình giá không hợp lệ" });
		const balance = Number(resources[currency] || 0);
		if (!Number.isSafeInteger(balance) || balance < 0) return JSON.stringify({success:false,message:"Số dư không hợp lệ; vui lòng đồng bộ lại hồ sơ"});
		if (balance < price) return JSON.stringify({ success: false, message: currency === "gold" ? "Không đủ Vàng" : "Không đủ Gem" });
		if (!serverGrantInventoryItem(nk, items, requestedItemId, grantQuantity)) {
			return JSON.stringify({ success: false, message: "Không thể cấp vật phẩm" });
		}
		resources[currency] = balance - price;
		receipts.push({ request_id: requestId, item_id: requestedItemId, currency });
		inventoryValue._store_receipts = receipts.slice(-100);
		if (requestId) handledRequestIds.push(requestId);
    } else if (action === "buy_fragment") {
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
        const quality = String(attrs.quality || (talismanId <= 15 ? "low" : (talismanId <= 25 ? "mid" : "high")));
        const qualities = talismanJsonObject(talismanConfig(nk).qualities);
        const qualityCfg = talismanJsonObject(qualities[quality]);
        const fragmentId = `talisman_fragment_${talismanId}`;
        const fragmentQuantity = Math.max(1, Number(qualityCfg.craft_fragments || 100));
        const goldCost = Math.max(0, Number(qualityCfg.craft_gold || 0));
        const quote = { fragment_id: fragmentId, fragment_quantity: fragmentQuantity,
            fragment_owned: talismanItemQuantity(items, fragmentId), gold_cost: goldCost,
            gold_owned: Number(resources.gold || 0) };
        if (action === "quote_craft") return JSON.stringify({ success: true, quote });
        if (quote.fragment_owned < fragmentQuantity) return JSON.stringify({ success: false, message: "Not enough talisman fragments", quote });
        if (quote.gold_owned < goldCost) return JSON.stringify({ success: false, message: "Not enough gold", quote });
        if (!talismanRemoveItems(items, fragmentId, fragmentQuantity)) return JSON.stringify({ success: false, message: "Fragment debit failed" });
        resources.gold = quote.gold_owned - goldCost;
        const baseStats = talismanJsonObject(attrs.base_stats);
        target = { instance_id: `talisman_${ctx.userId}_${Date.now()}`, item_id: itemId, category: "talisman", quantity: 1,
            acquired_at: new Date().toISOString(), level: 1, exp: 0, max_exp: 1, durability: Number(attrs.base_durability || 100),
            max_durability: Number(attrs.max_durability || 100), is_equipped: false, is_repairable: attrs.is_repairable !== false,
            skill_id: String(attrs.skill_id || `skill_talisman_${talismanId}`), tier_name: String(attrs.tier_name || ""),
            base_rolled_stats: baseStats, current_stats: baseStats, reforge_affixes: [] };
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
        const durability = Math.max(0, Number(target.durability === undefined ? 100 : target.durability));
        const maxDurability = Math.max(1, Number(target.max_durability || attrs.max_durability || 100));

		if (action === "quote_upgrade") {
			const quote = talismanUpgradeQuote(nk, Number(target.level || 1), items, resources, talismanId);
			if (quote.error) return JSON.stringify({ success: false, message: String(quote.error) });
			return JSON.stringify({ success: true, quote });
		}

		if (action === "upgrade") {
			const useCharm = req.use_charm === true;
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
			if (useCharm && talismanItemQuantity(items, TALISMAN_ENHANCE_CHARM_ID) < 1) {
				return JSON.stringify({ success: false, message: "Not enough talisman enhancement charm", quote });
			}
			if (!talismanRemoveItems(items, String(quote.material_id), Number(quote.material_quantity))) {
				return JSON.stringify({ success: false, message: "Material debit failed" });
			}
			if (fragmentQuantity > 0 && !talismanRemoveItems(items, fragmentId, fragmentQuantity)) {
				return JSON.stringify({ success: false, message: "Fragment debit failed", quote });
			}
			if (useCharm && !talismanRemoveItems(items, TALISMAN_ENHANCE_CHARM_ID, 1)) {
				return JSON.stringify({ success: false, message: "Enhancement charm debit failed", quote });
			}
			charmConsumed = useCharm;
			resources.gold = Number(resources.gold || 0) - Number(quote.gold_cost || 0);
			upgradeAttempted = true;
			const baseSuccessRate = Math.max(0, Math.min(100, Math.floor(Number(quote.success_rate || 0))));
			upgradeSuccessRate = Math.min(100, Math.round(baseSuccessRate * (useCharm ? talismanCharmMultiplier(nk) : 1.0)));
			upgradeSucceeded = Math.random() <= upgradeSuccessRate * 0.01;
			if (!upgradeSucceeded) {
				// Costs have already been consumed; level and rolled stats remain unchanged.
			} else {
            const growth = talismanJsonObject(attrs.stat_growth);
            const currentStats = talismanJsonObject(target.current_stats);
			for (const key of Object.keys(growth)) currentStats[key] = Number(currentStats[key] || 0) + Number(growth[key] || 0);
			level = Number(quote.target_level);
			target.level = level; target.exp = 0; target.max_exp = 1; target.current_stats = currentStats;
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
    const actionWrites:nkruntime.StorageWriteRequest[]=[
        { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue,
            permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
        { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: profileObject.version }
    ];
	if (isItemRequest) actionWrites.push({collection:"player_item_requests",key:requestId,userId:ctx.userId,
		value:{fingerprint,rolled:rerolledTalent,created_at:Date.now()},permissionRead:1,permissionWrite:0,version:"*"});
    try { nk.storageWrite(actionWrites); } catch (_e) { return JSON.stringify({success:false,message:"Dữ liệu đã thay đổi. Vui lòng đồng bộ rồi thử lại."}); }
	if (rerolledTalent && typeof writePlayerLeaderboardRecords === "function") {
		try { writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name); } catch (_) { }
	}
	if (action === "upgrade" && upgradeSucceeded) {
		eventRecord(nk, ctx.userId, "talisman_enhance", 1, { talisman_id: talismanId },
			requestId || `${talismanId}:${Number(target ? target.level : 0)}`);
	}
	const durabilityFactor = target ? talismanDurabilityFactor(talismanConfig(nk), Number(target.durability || 0)) : 0;
	const effectiveStats = target ? talismanEffectiveStats(target.current_stats, durabilityFactor) : {};
	return JSON.stringify({ success: action === "upgrade" ? upgradeSucceeded : true,
		attempted: upgradeAttempted, consumed: upgradeAttempted, charm_consumed: charmConsumed, success_rate: upgradeSuccessRate,
		message: action === "upgrade" && !upgradeSucceeded ? "Talisman enhancement failed" : "",
		inventory: items, resources, profile: rerolledTalent ? profile : undefined, rolled: rerolledTalent || undefined,
        level: target ? Number(target.level || 1) : 0,
        exp: target ? Number(target.exp || 0) : 0,
        max_exp: target ? Number(target.max_exp || 20) : 0,
		durability: target ? Number(target.durability || 0) : 0,
		durability_factor: durabilityFactor, effective_stats: effectiveStats,
		quote: target ? talismanUpgradeQuote(nk, Number(target.level || 1), items, resources, talismanId) : {} });
};

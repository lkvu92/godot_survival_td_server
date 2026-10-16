const HERO_ID_MIGRATIONS: any = { ice_demoness: "hero_1", flame_archer: "hero_2" };

const setPlayerAvatar: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return JSON.stringify({ success: false, code: 401, message: "Authentication required" });
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return JSON.stringify({ success: false, code: 400, message: "Invalid JSON" }); }
    if (!req || typeof req !== "object" || Array.isArray(req)) return JSON.stringify({ success: false, code: 400 });
    const heroId = String(req.hero_id || "");
    const heroes = nk.storageRead([{ collection: "player_heroes", key: "states", userId: ctx.userId }]);
    const owned = canonicalHeroStates(nk, heroes.length ? heroes[0].value : null).some(hero => hero.hero_id === heroId && hero.owned === true);
    if (!owned) return JSON.stringify({ success: false, code: 403, message: "Hero is not owned" });
    const profiles = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
    if (!profiles.length) return JSON.stringify({ success: false, code: 409, message: "Profile is not available" });
    const profile = profiles[0].value || {};
    if (profile.avatar_url !== heroId) {
        profile.avatar_url = heroId;
        profile.avatar_revision = Math.max(Date.now(), Number(profile.avatar_revision || 0) + 1);
        try {
            nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, version: profiles[0].version, permissionRead: 1, permissionWrite: 0 }]);
        } catch (_e) { return JSON.stringify({ success: false, code: 409, message: "Profile changed; please retry" }); }
    }
    return JSON.stringify({ success: true, avatar_url: heroId, avatar_revision: Number(profile.avatar_revision || 0) });
};

const getPlayerAvatars: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return JSON.stringify({ success: false, code: 401 });
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return JSON.stringify({ success: false, code: 400 }); }
    if (!req || typeof req !== "object" || Array.isArray(req)) return JSON.stringify({ success: false, code: 400 });
    if (!Array.isArray(req.user_ids) || req.user_ids.length > 20) return JSON.stringify({ success: false, code: 400 });
    const ids: string[] = [];
    for (const id of req.user_ids) {
        if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return JSON.stringify({ success: false, code: 400 });
        if (ids.indexOf(id) < 0) ids.push(id);
    }
    const avatars: any = {};
    if (!ids.length) return JSON.stringify({ success: true, avatars });
    const catalog = nk.sqlQuery("SELECT id FROM game_heroes ORDER BY id", []).map(row => String(row.id));
    const objects = nk.storageRead(ids.map(userId => ({ collection: "player_profiles", key: "main", userId })));
    for (const object of objects) {
        const avatar = String((object.value || {}).avatar_url || "");
        avatars[object.userId] = catalog.indexOf(avatar) >= 0 ? avatar : "hero_1";
    }
    return JSON.stringify({ success: true, avatars });
};

function defaultPlayerProfile(displayName: string): any {
    return {
        display_name: displayName,
        avatar_url: "hero_1",
        level: 1, exp: 0, next_level_exp: 10000, progression_version: 2, vip: 0, vip_exp: 0,
        stamina: 30, last_stamina_update: 0,
        resources: { gold: 1000, gems: 100 },
        elements: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
        unlocked_arcs: ["arc_0", "arc_frozen_realm"],
        unlocked_stages: [
            { stage_id: "stage_0_1", unlocked_levels: ["normal", "epic", "legend"] },
            { stage_id: "stage_frozen_frontier", unlocked_levels: ["normal"] }
        ],
        completed_stage_levels: []
    };
}

function defaultPlayerSettings(): any {
    return { master_volume: 1.0, music: 1.0, sfx: 1.0, show_damage: true, show_enemy_hp: true };
}

function canonicalHeroStates(nk: nkruntime.Nakama, source: any): any[] {
    const byId: any = {};
    const states = source && Array.isArray(source.heroes) ? source.heroes : [];
    for (const entry of states) {
        if (!entry || !entry.hero_id) continue;
        const id = String(entry.hero_id);
        const targetId = HERO_ID_MIGRATIONS[id] || id;
        // Prefer an already-current state if an interrupted earlier migration left both.
        if (!byId[targetId] || id === targetId) byId[targetId] = entry;
    }
    const rows = nk.sqlQuery("SELECT id, price, attributes FROM game_heroes ORDER BY id", []);
    return rows.map((hero: any) => {
        const id = String(hero.id);
        const existing = byId[id];
        const price = parseJsonObject(hero.price);
        const freeHero = Number(price.gold || 0) <= 0 && Number(price.gems || 0) <= 0;
        return {
            hero_id: id,
            level: existing ? Math.max(1, Number(existing.level || 1)) : 1,
            exp: existing ? Math.max(0, Number(existing.exp || 0)) : 0,
            next_level_exp: existing ? Math.max(0, Number(existing.next_level_exp || 1000)) : 1000,
            owned: existing ? existing.owned === true : freeHero,
            current_attribute: existing && existing.current_attribute
                ? existing.current_attribute : parseJsonObject(hero.attributes)
        };
    });
}

const savePlayerProfile: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
): string => {
    const data = JSON.parse(payload);
    const writes: nkruntime.StorageWriteRequest[] = [];

    const stored = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
        { collection: "player_heroes", key: "states", userId: ctx.userId }
    ]);
    let storedProfile: nkruntime.StorageObject | null = null;
    let storedHeroes: nkruntime.StorageObject | null = null;
    for (const object of stored) {
        if (object.collection === "player_profiles") storedProfile = object;
        if (object.collection === "player_heroes") storedHeroes = object;
    }

    if (data.profile || !storedProfile) {
        if (storedProfile) {
            const authoritative = storedProfile.value || {};
            cultivationEnsureProfile(nk, authoritative, false);
            // Generic cloud saves may update presentation only. All gameplay and
            // economy fields are server-owned and must use their dedicated RPC.
            data.profile.resources = authoritative.resources || { gold: 0, gems: 0 };
            ["talent_tier", "talent_score", "main_element", "element_affinities",
                "affinity_flags", "comprehension_points", "unlocked_laws", "breakthrough"].forEach((key: string) => {
                data.profile[key] = authoritative[key];
            });
            data.profile = Object.assign({}, authoritative, {
                display_name: String((data.profile || {}).display_name || authoritative.display_name || "").slice(0, 32),
                // Explicit avatar changes use set_player_avatar. Delayed cloud
                // saves must never undo a newer confirmed selection.
                avatar_url: String(authoritative.avatar_url || "hero_1")
            });
        } else {
            // Account bootstrap is completely server-owned; client supplied
            // currency, unlocks, elements, hero stats and talent rolls are ignored.
            data.profile = defaultPlayerProfile(String((data.profile || {}).display_name || "").slice(0, 32));
            cultivationEnsureProfile(nk, data.profile, false);
        }
        writes.push({
            collection: "player_profiles",
            key: "main",
            userId: ctx.userId,
            value: data.profile,
            permissionRead: 1,
            permissionWrite: 0,
            version: storedProfile ? storedProfile.version : "*"
        });
    }
    if (data.heroes || !storedHeroes) {
        const sanitizedStates = canonicalHeroStates(nk, storedHeroes ? storedHeroes.value : null);
        data.heroes = {
            heroes: sanitizedStates,
            _iap_reward_ids: storedHeroes && storedHeroes.value
                ? (storedHeroes.value._iap_reward_ids || []) : [],
        };
        writes.push({
            collection: "player_heroes",
            key: "states",
            userId: ctx.userId,
            value: data.heroes,
            permissionRead: 1,
            permissionWrite: 0,
            version: storedHeroes ? storedHeroes.version : "*"
        });
    }
    if (data.inventory || !nk.storageRead([{ collection: "player_inventory", key: "items", userId: ctx.userId }]).length) {
        const storedInventory = nk.storageRead([{ collection: "player_inventory", key: "items", userId: ctx.userId }]);
        // Generic profile save cannot mint items. Trusted reward RPCs own the
        // inventory object; retain the current authoritative contents.
        data.inventory = storedInventory.length > 0 && storedInventory[0].value
            ? storedInventory[0].value : { items: [], _iap_reward_ids: [] };
        writes.push({
            collection: "player_inventory",
            key: "items",
            userId: ctx.userId,
            value: data.inventory,
            permissionRead: 1,
            permissionWrite: 0
        });
    }
    if (data.settings || !nk.storageRead([{ collection: "player_settings", key: "prefs", userId: ctx.userId }]).length) {
        writes.push({
            collection: "player_settings",
            key: "prefs",
            userId: ctx.userId,
            value: data.settings || defaultPlayerSettings(),
            permissionRead: 1,
            permissionWrite: 0
        });
    }

    if (writes.length > 0) {
        nk.storageWrite(writes);
    }
    return JSON.stringify({ success: true });
};

const loadPlayerProfile: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
): string => {
    const objects = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
        { collection: "player_heroes", key: "states", userId: ctx.userId },
        { collection: "player_inventory", key: "items", userId: ctx.userId },
        { collection: "player_settings", key: "prefs", userId: ctx.userId },
        { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId },
    ]);

    const result: any = { profile: {}, heroes: {}, inventory: {}, settings: {}, compliance_profile: {} };
    let profileObject: nkruntime.StorageObject | null = null;
    let inventoryObject: nkruntime.StorageObject | null = null;
    for (const obj of objects) {
        switch (obj.collection) {
            case "player_profiles": result.profile = obj.value; profileObject = obj; break;
            case "player_heroes": result.heroes = obj.value; break;
            case "player_inventory": result.inventory = obj.value; inventoryObject = obj; break;
            case "player_settings": result.settings = obj.value; break;
            case "player_compliance_profiles": result.compliance_profile = obj.value; break;
        }
    }

    // Repair incomplete accounts and migrate legacy hero IDs during load. This
    // makes a failed first bootstrap recoverable on the next login.
    const repairWrites: nkruntime.StorageWriteRequest[] = [];
    if (!profileObject) {
        result.profile = defaultPlayerProfile("");
        cultivationEnsureProfile(nk, result.profile, false);
        repairWrites.push({ collection: "player_profiles", key: "main", userId: ctx.userId,
            value: result.profile, permissionRead: 1, permissionWrite: 0, version: "*" });
    }
    const canonicalHeroes = canonicalHeroStates(nk, result.heroes);
    const heroesChanged = !result.heroes || JSON.stringify(result.heroes.heroes || []) !== JSON.stringify(canonicalHeroes);
    if (heroesChanged) {
        result.heroes = { heroes: canonicalHeroes, _iap_reward_ids: result.heroes && result.heroes._iap_reward_ids ? result.heroes._iap_reward_ids : [] };
        const previousHero = objects.find((obj: any) => obj.collection === "player_heroes");
        repairWrites.push({ collection: "player_heroes", key: "states", userId: ctx.userId,
            value: result.heroes, permissionRead: 1, permissionWrite: 0, version: previousHero ? previousHero.version : "*" });
    }
    const inventoryWasMissing = !result.inventory || Object.keys(result.inventory).length === 0;
    if (inventoryWasMissing) {
        result.inventory = { items: [], _iap_reward_ids: [] };
    }
    if (inventoryWasMissing) {
        repairWrites.push({ collection: "player_inventory", key: "items", userId: ctx.userId,
            value: result.inventory, permissionRead: 1, permissionWrite: 0, version: inventoryObject ? inventoryObject.version : "*" });
    }
    if (!result.settings || Object.keys(result.settings).length === 0) {
        result.settings = defaultPlayerSettings();
        repairWrites.push({ collection: "player_settings", key: "prefs", userId: ctx.userId,
            value: result.settings, permissionRead: 1, permissionWrite: 0, version: "*" });
    }
    if (repairWrites.length > 0) nk.storageWrite(repairWrites);

    result.monetization = buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx));

    if (result.profile && typeof result.profile === "object" && Object.keys(result.profile).length > 0) {
        let profileChanged = cultivationEnsureProfile(nk, result.profile, true);
        if (cultivationEnsurePreview(nk, result.profile)) profileChanged = true;
        // Stamina regeneration uses server UTC and the currently published
        // interval/amount; device time is never trusted.
        const nowRows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM NOW())::BIGINT AS now", []);
        const now = Number(nowRows.length > 0 ? nowRows[0].now : 0);
        const interval = Math.max(1, Number(getRemoteConfigValue(nk, "system", "stamina_regen_interval_sec", 300)));
        const amount = Math.max(0, Number(getRemoteConfigValue(nk, "system", "stamina_regen_amount", 1)));
        const hasLastStaminaUpdate = Number(result.profile.last_stamina_update || 0) > 0;
        const last = hasLastStaminaUpdate
            ? Math.max(0, Number(result.profile.last_stamina_update))
            : now;
        const currentStamina = Math.max(0, Math.min(30, Number(result.profile.stamina || 0)));
        const ticks = currentStamina < 30 && now > last ? Math.floor((now - last) / interval) : 0;
        if (ticks > 0 && amount > 0) {
            result.profile.stamina = Math.min(30, currentStamina + ticks * amount);
            result.profile.last_stamina_update = result.profile.stamina >= 30 ? now : last + ticks * interval;
			profileChanged = true;
		} else if (currentStamina >= 30 && (Number(result.profile.stamina || 0) !== 30 || last !== now)) {
			result.profile.stamina = 30;
			result.profile.last_stamina_update = now;
			profileChanged = true;
        } else if (!hasLastStaminaUpdate) {
            result.profile.last_stamina_update = now;
            profileChanged = true;
        }
        const appliedLast = Math.max(0, Number(result.profile.last_stamina_update || now));
        const elapsedInTick = Math.max(0, now - appliedLast) % interval;
        const canRegenerate = Number(result.profile.stamina || 0) < 30 && amount > 0;
        result.stamina_regen = {
            amount: canRegenerate ? amount : 0,
            interval_sec: interval,
            seconds_remaining: canRegenerate ? interval - elapsedInTick : 0,
            server_time: now,
        };
        if (!result.profile.avatar_url) {
            result.profile.avatar_url = "hero_1";
        }
        const uArcs = result.profile.unlocked_arcs || [];
        if (Array.isArray(uArcs) && !uArcs.includes("arc_0")) {
            uArcs.unshift("arc_0");
            result.profile.unlocked_arcs = uArcs;
            profileChanged = true;
        }
        const uStages = result.profile.unlocked_stages || [];
        if (Array.isArray(uStages) && !uStages.some((s: any) => s && s.stage_id === "stage_0_1")) {
            uStages.unshift({
                stage_id: "stage_0_1",
                unlocked_levels: ["normal", "epic", "legend"]
            });
            result.profile.unlocked_stages = uStages;
            profileChanged = true;
        }
        if (profileChanged && profileObject) {
            nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId,
                value: result.profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version }]);
        }
    }

    const vip = result.monetization.vip;
    if (vip && vip.configured) {
        result.profile.vip = vip.level;
        result.profile.vip_exp = vip.exp;
        result.profile.vip_progress = vip;
    }
    return JSON.stringify(result);
};
const saveComplianceProfile: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
): string => {
    if (!ctx.userId) {
        return JSON.stringify({ success: false, message: "Unauthorized" });
    }
    let data: any = {};
    try {
        data = JSON.parse(payload || "{}");
    } catch (e) {
        return JSON.stringify({ success: false, message: "Invalid payload JSON" });
    }

    const fullName = String(data.full_name || "").trim().slice(0, 100);
    const birthDate = String(data.birth_date || "").trim().slice(0, 30);
    const idNumber = String(data.id_number || "").trim().slice(0, 30);
    const phoneNumber = String(data.phone_number || "").trim().slice(0, 20);
    const email = String(data.email || "").trim().slice(0, 120);

    const complianceData: any = {
        user_id: ctx.userId,
        full_name: fullName,
        birth_date: birthDate,
        id_number: idNumber,
        phone_number: phoneNumber,
        email: email,
        is_verified: fullName.length >= 2 && phoneNumber.length >= 8,
        updated_at: Math.floor(Date.now() / 1000)
    };

    nk.storageWrite([
        {
            collection: "player_compliance_profiles",
            key: "profile",
            userId: ctx.userId,
            value: complianceData,
            permissionRead: 1,
            permissionWrite: 0
        }
    ]);
	if (eventProfileComplete(complianceData)) {
		eventRecord(nk, ctx.userId, "profile_complete", 1, {}, `profile:${complianceData.updated_at}`);
	}

    return JSON.stringify({
        success: true,
        profile: complianceData
    });
};

const getComplianceProfile: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    _payload: string
): string => {
    if (!ctx.userId) {
        return JSON.stringify({ success: false, message: "Unauthorized" });
    }
    const objects = nk.storageRead([
        { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId }
    ]);
    if (objects.length > 0 && objects[0].value) {
        return JSON.stringify({
            success: true,
            profile: objects[0].value
        });
    }
    return JSON.stringify({
        success: true,
        profile: {}
    });
};

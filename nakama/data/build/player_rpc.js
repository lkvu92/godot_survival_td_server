const HERO_ID_MIGRATIONS = { ice_demoness: "hero_1", flame_archer: "hero_2" };
function defaultPlayerProfile(displayName) {
  return {
    display_name: displayName,
    avatar_url: "hero_1",
    level: 1,
    exp: 0,
    next_level_exp: 1e4,
    progression_version: 2,
    vip: 0,
    stamina: 30,
    last_stamina_update: 0,
    resources: { gold: 1e3, gems: 100 },
    elements: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
    unlocked_arcs: ["arc_0", "arc_frozen_realm"],
    unlocked_stages: [
      { stage_id: "stage_0_1", unlocked_levels: ["normal", "epic", "legend"] },
      { stage_id: "stage_frozen_frontier", unlocked_levels: ["normal"] }
    ],
    completed_stage_levels: [],
    // Server time anchors the one-time, new-account check-in campaign.
    daily_checkin: { started_at_ms: Date.now(), claimed_days: [], last_claim_date: "", last_free_claim_date: "" }
  };
}
function defaultPlayerSettings() {
  return { master_volume: 1, music: 1, sfx: 1, show_damage: true, show_enemy_hp: true };
}
function canonicalHeroStates(nk, source) {
  const byId = {};
  const states = source && Array.isArray(source.heroes) ? source.heroes : [];
  for (const entry of states) {
    if (!entry || !entry.hero_id) continue;
    const id = String(entry.hero_id);
    const targetId = HERO_ID_MIGRATIONS[id] || id;
    if (!byId[targetId] || id === targetId) byId[targetId] = entry;
  }
  const rows = nk.sqlQuery("SELECT id, price, attributes FROM game_heroes ORDER BY id", []);
  return rows.map((hero) => {
    const id = String(hero.id);
    const existing = byId[id];
    const price = parseJsonObject(hero.price);
    const freeHero = Number(price.gold || 0) <= 0 && Number(price.gems || 0) <= 0;
    return {
      hero_id: id,
      level: existing ? Math.max(1, Number(existing.level || 1)) : 1,
      exp: existing ? Math.max(0, Number(existing.exp || 0)) : 0,
      next_level_exp: existing ? Math.max(0, Number(existing.next_level_exp || 1e3)) : 1e3,
      owned: existing ? existing.owned === true : freeHero,
      current_attribute: existing && existing.current_attribute ? existing.current_attribute : parseJsonObject(hero.attributes)
    };
  });
}
function createStarterTalisman(nk, userId) {
  const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = 'talisman_1' AND category = 'talisman'", []);
  if (rows.length === 0) return null;
  const attrs = parseJsonb(rows[0].attributes) || {};
  const baseStats = attrs.base_stats && typeof attrs.base_stats === "object" ? attrs.base_stats : {};
  const configRows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
  const progression = configRows.length > 0 ? parseJsonb(configRows[0].value) || {} : {};
  const varianceRatio = Math.max(0, Math.min(100, Number((progression.talisman_system || {}).random_stat_variance_pct || 20))) * 0.01;
  const rolled = {};
  for (const key of Object.keys(baseStats)) {
    const value = Number(baseStats[key] || 0) * (1 + (Math.random() * 2 - 1) * varianceRatio);
    rolled[key] = key === "dodge_rate" ? Math.round(value * 1e3) / 1e3 : key.indexOf("_pct") >= 0 ? Math.round(value * 10) / 10 : Math.round(value);
  }
  return {
    instance_id: `talisman_${userId}_${Date.now()}`,
    item_id: "talisman_1",
    category: "talisman",
    quantity: 1,
    acquired_at: (/* @__PURE__ */ new Date()).toISOString(),
    expires_at: "",
    level: 1,
    exp: 0,
    max_exp: 1,
    durability: Math.max(1, Number(attrs.base_durability || 100)),
    max_durability: Math.max(1, Number(attrs.max_durability || 100)),
    is_equipped: true,
    is_repairable: attrs.is_repairable !== false,
    max_battle_uses: Math.max(0, Number(attrs.max_battle_uses || 0)),
    skill_id: String(attrs.skill_id || "skill_talisman_1"),
    durability_cost_per_cast: Math.max(0, Number(attrs.durability_cost_per_cast || 0)),
    durability_cost_per_battle: Math.max(0, Number(attrs.durability_cost_per_battle || 0)),
    tier_name: String(attrs.tier_name || ""),
    base_rolled_stats: rolled,
    current_stats: Object.assign({}, rolled),
    reforge_affixes: []
  };
}
const savePlayerProfile = (ctx, logger, nk, payload) => {
  const data = JSON.parse(payload);
  const writes = [];
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_heroes", key: "states", userId: ctx.userId }
  ]);
  let storedProfile = null;
  let storedHeroes = null;
  for (const object of stored) {
    if (object.collection === "player_profiles") storedProfile = object;
    if (object.collection === "player_heroes") storedHeroes = object;
  }
  if (data.profile || !storedProfile) {
    if (storedProfile) {
      const authoritative = storedProfile.value || {};
      cultivationEnsureProfile(nk, authoritative, false);
      data.profile.resources = authoritative.resources || { gold: 0, gems: 0 };
      [
        "talent_tier",
        "talent_score",
        "main_element",
        "element_affinities",
        "affinity_flags",
        "comprehension_points",
        "unlocked_laws",
        "breakthrough"
      ].forEach((key) => {
        data.profile[key] = authoritative[key];
      });
      data.profile = Object.assign({}, authoritative, {
        display_name: String((data.profile || {}).display_name || authoritative.display_name || "").slice(0, 32),
        avatar_url: String((data.profile || {}).avatar_url || authoritative.avatar_url || "hero_1").slice(0, 128)
      });
    } else {
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
      _iap_reward_ids: storedHeroes && storedHeroes.value ? storedHeroes.value._iap_reward_ids || [] : []
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
    data.inventory = storedInventory.length > 0 && storedInventory[0].value ? storedInventory[0].value : { items: [], _iap_reward_ids: [] };
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
const loadPlayerProfile = (ctx, logger, nk, payload) => {
  const objects = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_heroes", key: "states", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_settings", key: "prefs", userId: ctx.userId },
    { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId }
  ]);
  const result = { profile: {}, heroes: {}, inventory: {}, settings: {}, compliance_profile: {} };
  let profileObject = null;
  let inventoryObject = null;
  for (const obj of objects) {
    switch (obj.collection) {
      case "player_profiles":
        result.profile = obj.value;
        profileObject = obj;
        break;
      case "player_heroes":
        result.heroes = obj.value;
        break;
      case "player_inventory":
        result.inventory = obj.value;
        inventoryObject = obj;
        break;
      case "player_settings":
        result.settings = obj.value;
        break;
      case "player_compliance_profiles":
        result.compliance_profile = obj.value;
        break;
    }
  }
  const repairWrites = [];
  if (!profileObject) {
    result.profile = defaultPlayerProfile("");
    cultivationEnsureProfile(nk, result.profile, false);
    repairWrites.push({
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: result.profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: "*"
    });
  }
  const canonicalHeroes = canonicalHeroStates(nk, result.heroes);
  const heroesChanged = !result.heroes || JSON.stringify(result.heroes.heroes || []) !== JSON.stringify(canonicalHeroes);
  if (heroesChanged) {
    result.heroes = { heroes: canonicalHeroes, _iap_reward_ids: result.heroes && result.heroes._iap_reward_ids ? result.heroes._iap_reward_ids : [] };
    const previousHero = objects.find((obj) => obj.collection === "player_heroes");
    repairWrites.push({
      collection: "player_heroes",
      key: "states",
      userId: ctx.userId,
      value: result.heroes,
      permissionRead: 1,
      permissionWrite: 0,
      version: previousHero ? previousHero.version : "*"
    });
  }
  const inventoryWasMissing = !result.inventory || Object.keys(result.inventory).length === 0;
  if (inventoryWasMissing) {
    result.inventory = { items: [], _iap_reward_ids: [] };
  }
  let starterTalismanGranted = false;
  const inventoryItems = Array.isArray(result.inventory.items) ? result.inventory.items : [];
  const hasOwnedTalisman = inventoryItems.some((entry) => entry && /^talisman_[0-9]+$/.test(String(entry.item_id || "")));
  if (result.profile && !hasOwnedTalisman) {
    const starter = createStarterTalisman(nk, ctx.userId);
    if (starter) {
      inventoryItems.push(starter);
      result.inventory.items = inventoryItems;
      result.profile._starter_talisman_granted = true;
      starterTalismanGranted = true;
    }
  }
  if (inventoryWasMissing || starterTalismanGranted) {
    repairWrites.push({
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: result.inventory,
      permissionRead: 1,
      permissionWrite: 0,
      version: inventoryObject ? inventoryObject.version : "*"
    });
  }
  if (!result.settings || Object.keys(result.settings).length === 0) {
    result.settings = defaultPlayerSettings();
    repairWrites.push({
      collection: "player_settings",
      key: "prefs",
      userId: ctx.userId,
      value: result.settings,
      permissionRead: 1,
      permissionWrite: 0,
      version: "*"
    });
  }
  if (repairWrites.length > 0) nk.storageWrite(repairWrites);
  result.monetization = buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx));
  if (result.profile && typeof result.profile === "object" && Object.keys(result.profile).length > 0) {
    let profileChanged = starterTalismanGranted || cultivationEnsureProfile(nk, result.profile, true);
    if (cultivationEnsurePreview(nk, result.profile)) profileChanged = true;
    const nowRows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM NOW())::BIGINT AS now", []);
    const now = Number(nowRows.length > 0 ? nowRows[0].now : 0);
    const interval = Math.max(1, Number(getRemoteConfigValue(nk, "system", "stamina_regen_interval_sec", 300)));
    const amount = Math.max(0, Number(getRemoteConfigValue(nk, "system", "stamina_regen_amount", 1)));
    const hasLastStaminaUpdate = Number(result.profile.last_stamina_update || 0) > 0;
    const last = hasLastStaminaUpdate ? Math.max(0, Number(result.profile.last_stamina_update)) : now;
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
      server_time: now
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
    if (Array.isArray(uStages) && !uStages.some((s) => s && s.stage_id === "stage_0_1")) {
      uStages.unshift({
        stage_id: "stage_0_1",
        unlocked_levels: ["normal", "epic", "legend"]
      });
      result.profile.unlocked_stages = uStages;
      profileChanged = true;
    }
    if (profileChanged && profileObject) {
      nk.storageWrite([{
        collection: "player_profiles",
        key: "main",
        userId: ctx.userId,
        value: result.profile,
        permissionRead: 1,
        permissionWrite: 0,
        version: profileObject.version
      }]);
    }
  }
  return JSON.stringify(result);
};
const saveComplianceProfile = (ctx, logger, nk, payload) => {
  if (!ctx.userId) {
    return JSON.stringify({ success: false, message: "Unauthorized" });
  }
  let data = {};
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
  const complianceData = {
    user_id: ctx.userId,
    full_name: fullName,
    birth_date: birthDate,
    id_number: idNumber,
    phone_number: phoneNumber,
    email,
    is_verified: fullName.length >= 2 && phoneNumber.length >= 8,
    updated_at: Math.floor(Date.now() / 1e3)
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
  return JSON.stringify({
    success: true,
    profile: complianceData
  });
};
const getComplianceProfile = (ctx, logger, nk, _payload) => {
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

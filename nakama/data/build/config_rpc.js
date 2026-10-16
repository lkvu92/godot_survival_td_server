function decodeUtf8Bytes(val) {
  let str = "";
  const batchSize = 1e3;
  for (let i = 0; i < val.length; i += batchSize) {
    str += String.fromCharCode.apply(null, val.slice(i, i + batchSize));
  }
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    let out = "";
    let i = 0;
    while (i < val.length) {
      const c = val[i++];
      if (c < 128) {
        out += String.fromCharCode(c);
      } else if (c > 191 && c < 224) {
        const c2 = val[i++];
        out += String.fromCharCode((c & 31) << 6 | c2 & 63);
      } else if (c > 223 && c < 240) {
        const c2 = val[i++];
        const c3 = val[i++];
        out += String.fromCharCode((c & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
      } else if (c > 239 && c < 248) {
        const c2 = val[i++];
        const c3 = val[i++];
        const c4 = val[i++];
        const u = ((c & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 65536;
        out += String.fromCharCode((u >> 10) + 55296, (u & 1023) + 56320);
      }
    }
    return out;
  }
}
function parseJsonb(val) {
  if (val === null || val === void 0) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  }
  const isByteView = typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(val);
  if (Array.isArray(val) || isByteView) {
    const bytes = Array.isArray(val) ? val : Array.prototype.slice.call(val);
    if (bytes.length > 0 && typeof bytes[0] === "number") {
      try {
        const jsonStr = decodeUtf8Bytes(bytes);
        return JSON.parse(jsonStr);
      } catch (e) {
        return val;
      }
    }
  }
  return val;
}
function processHero(row) {
  if (!row) return row;
  row.attributes = parseJsonb(row.attributes);
  row.level_up_stats = parseJsonb(row.level_up_stats);
  row.price = parseJsonb(row.price);
  row.require = parseJsonb(row.require);
  row.skill_pool = parseJsonb(row.skill_pool);
  row.starting_skills = parseJsonb(row.starting_skills);
  return row;
}
function processEnemy(row) {
  if (!row) return row;
  row.attributes = parseJsonb(row.attributes);
  row.boss_skills = parseJsonb(row.boss_skills);
  row.attack_effects = parseJsonb(row.attack_effects);
  row.generic_skills = parseJsonb(row.generic_skills);
  row.reward = parseJsonb(row.reward);
  row.skills = parseJsonb(row.skills);
  return row;
}
function processItem(row) {
  if (!row) return row;
  row.attributes = parseJsonb(row.attributes);
  row.tags = parseJsonb(row.tags);
  return row;
}
function processSkill(row) {
  if (!row) return row;
  row.levels = parseJsonb(row.levels);
  row.criteria_unlock = parseJsonb(row.criteria_unlock);
  row.positioning = parseJsonb(row.positioning);
  row.deployment = parseJsonb(row.deployment);
  row.vfx_frames = parseJsonb(row.vfx_frames);
  return row;
}
function processArc(row) {
  if (!row) return row;
  row.enabled_if = parseJsonb(row.enabled_if);
  row.stage_ids = parseJsonb(row.stage_ids);
  return row;
}
function processCard(row) {
  if (!row) return row;
  row.effect = parseJsonb(row.effect);
  return row;
}
function processTalisman(row) {
  if (!row) return row;
  row.stats = parseJsonb(row.stats);
  row.materials = parseJsonb(row.materials);
  if (!row.name && row.display_name) row.name = row.display_name;
  return row;
}
function processEffect(row) {
  if (!row) return row;
  row.default_props = parseJsonb(row.default_props);
  const metadata = parseJsonb(row.metadata);
  delete row.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    Object.assign(row, metadata);
  }
  return row;
}
function processStage(row, nk) {
  if (!row) return row;
  row.enabled_if = parseJsonb(row.enabled_if);
  row.difficulty_levels = parseJsonb(row.difficulty_levels);
  row.loot_table = parseJsonb(row.loot_table);
  row.spawn_sequence = parseJsonb(row.spawn_sequence);
  row.stage_rules = parseJsonb(row.stage_rules);
  const waves = nk.sqlQuery(
    "SELECT * FROM game_stage_waves WHERE stage_id = $1 ORDER BY wave_index",
    [row.id]
  );
  row.waves = waves.map((w) => ({
    id: w.wave_id || w.id,
    wave_id: w.wave_id,
    display_name: w.display_name,
    entries: parseJsonb(w.entries)
  }));
  return row;
}
function processStageLevel(row) {
  if (!row) return row;
  row.enemy_modifiers = parseJsonb(row.enemy_modifiers);
  row.loot_table = parseJsonb(row.loot_table);
  row.boss_loot_table = parseJsonb(row.boss_loot_table);
  row.unlock_condition = parseJsonb(row.unlock_condition);
  row.stage_rules = parseJsonb(row.stage_rules);
  row.ui = parseJsonb(row.ui);
  return row;
}
function buildStoreConfigs(nk) {
  const products = nk.sqlQuery("SELECT * FROM game_store_products ORDER BY tab_id, product_id", []);
  const packsByTab = {};
  let firstTopup = {};
  products.forEach((row) => {
    const ui = parseJsonb(row.ui) || {};
    const rewards = nk.sqlQuery(
      "SELECT reward_type, reward_id, quantity, metadata FROM game_store_product_rewards WHERE product_id = $1 ORDER BY line_no",
      [row.product_id]
    ).map((reward) => ({
      reward_type: String(reward.reward_type),
      reward_id: String(reward.reward_id),
      quantity: Number(reward.quantity),
      metadata: parseJsonb(reward.metadata) || {}
    }));
    ui.product_id = String(row.product_id);
    ui.id = String(row.pack_id);
    ui.active = row.active === true;
    ui.fulfillment_type = String(row.fulfillment_type);
    ui.rewards = rewards;
    if (String(row.tab_id) === "first_topup") {
      ui.grant_lines = rewards;
      ui.rewards = Array.isArray(ui.presentation_rewards) ? ui.presentation_rewards : [];
      firstTopup = ui;
    } else {
      const tabId = String(row.tab_id);
      if (!packsByTab[tabId]) packsByTab[tabId] = [];
      packsByTab[tabId].push(ui);
    }
  });
  return { packs: { packs_by_tab: packsByTab }, first_topup: firstTopup };
}
function readContentConfig(nk, id) {
  const rows = nk.sqlQuery("SELECT payload FROM game_content_configs WHERE id = $1 AND active = TRUE", [id]);
  return rows.length > 0 ? parseJsonb(rows[0].payload) || {} : {};
}
const getGameConfig = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload);
  const table = req.table;
  switch (table) {
    case "heroes":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_heroes ORDER BY id", []).map(processHero));
    case "enemies":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_enemies ORDER BY id", []).map(processEnemy));
    case "items":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_items ORDER BY sort_order, id", []).map(processItem));
    case "skills":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_skills ORDER BY id", []).map(processSkill));
    case "arcs":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_arcs ORDER BY sort_order, id", []).map(processArc));
    case "cards":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_cards ORDER BY id", []).map(processCard));
    case "talismans":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_talismans ORDER BY id", []).map(processTalisman));
    case "effects":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_effects ORDER BY id", []).map(processEffect));
    case "stages": {
      const stages = nk.sqlQuery("SELECT * FROM game_stages ORDER BY sort_order, level, id", []);
      return JSON.stringify(stages.map((s) => processStage(s, nk)));
    }
    case "stage_levels":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_stage_levels ORDER BY stage_id, sort_order, id", []).map(processStageLevel));
    case "progression": {
      const rows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
      return rows.length > 0 ? JSON.stringify(parseJsonb(rows[0].value)) : "{}";
    }
    case "packs":
      return JSON.stringify(buildStoreConfigs(nk).packs);
    case "first_topup":
      return JSON.stringify(buildStoreConfigs(nk).first_topup);
    case "daily_checkin":
      return JSON.stringify(readContentConfig(nk, "daily_checkin"));
    case "events":
      return JSON.stringify(readContentConfig(nk, "events"));
    case "tribulation":
      return JSON.stringify(cultivationConfig());
    case "all": {
      const result = {};
      result.heroes = nk.sqlQuery("SELECT * FROM game_heroes ORDER BY id", []).map(processHero);
      result.enemies = nk.sqlQuery("SELECT * FROM game_enemies ORDER BY id", []).map(processEnemy);
      result.items = nk.sqlQuery("SELECT * FROM game_items ORDER BY sort_order, id", []).map(processItem);
      result.skills = nk.sqlQuery("SELECT * FROM game_skills ORDER BY id", []).map(processSkill);
      result.arcs = nk.sqlQuery("SELECT * FROM game_arcs ORDER BY sort_order, id", []).map(processArc);
      result.cards = nk.sqlQuery("SELECT * FROM game_cards ORDER BY id", []).map(processCard);
      result.effects = nk.sqlQuery("SELECT * FROM game_effects ORDER BY id", []).map(processEffect);
      const stages = nk.sqlQuery("SELECT * FROM game_stages ORDER BY sort_order, level, id", []);
      result.stages = stages.map((s) => processStage(s, nk));
      result.stage_levels = nk.sqlQuery("SELECT * FROM game_stage_levels ORDER BY stage_id, sort_order, id", []).map(processStageLevel);
      const progRows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
      result.progression = progRows.length > 0 ? parseJsonb(progRows[0].value) : {};
      const store = buildStoreConfigs(nk);
      result.packs = store.packs;
      result.first_topup = store.first_topup;
      result.daily_checkin = readContentConfig(nk, "daily_checkin");
      result.events = readContentConfig(nk, "events");
      result.stamina = readContentConfig(nk, "stamina");
      result.tribulation = cultivationConfig();
      result.talismans = nk.sqlQuery("SELECT * FROM game_talismans ORDER BY id", []).map(processTalisman);
      return JSON.stringify(result);
    }
    default:
      throw new Error(`Unknown config table: ${table}`);
  }
};
function compareVersions(left, right) {
  const a = left.split(".").map((v) => Number(v) || 0);
  const b = right.split(".").map((v) => Number(v) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) ? -1 : 1;
  }
  return 0;
}
const getConfigBootstrap = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return JSON.stringify({ status: "error", code: 401, message: "Authentication required" });
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ status: "error", code: 400, message: "Invalid JSON" });
  }
  if (String(request.platform || "").toLowerCase() !== "android") {
    return JSON.stringify({ status: "error", code: 400, message: "Unsupported platform" });
  }
  const release = nk.sqlQuery(`SELECT config_version, snapshot, min_app_version, latest_app_version, store_url,
        EXTRACT(EPOCH FROM NOW())::BIGINT AS server_time
        FROM remote_config_releases ORDER BY config_version DESC LIMIT 1`, []);
  if (release.length === 0) return JSON.stringify({ status: "error", code: 503, message: "No config release" });
  const row = release[0];
  const appVersion = String(request.app_version || "0.0.0");
  if (compareVersions(appVersion, String(row.min_app_version)) < 0) {
    return JSON.stringify({
      status: "force_update",
      config_version: Number(row.config_version),
      min_app_version: row.min_app_version,
      latest_app_version: row.latest_app_version,
      store_url: row.store_url,
      server_time: Number(row.server_time)
    });
  }
  return JSON.stringify({
    status: compareVersions(appVersion, String(row.latest_app_version)) < 0 ? "soft_update" : "ok",
    config_version: Number(row.config_version),
    min_app_version: row.min_app_version,
    latest_app_version: row.latest_app_version,
    store_url: row.store_url,
    config: parseJsonb(row.snapshot),
    server_time: Number(row.server_time)
  });
};
function getActiveRemoteConfig(nk) {
  const rows = nk.sqlQuery("SELECT config_version, snapshot FROM remote_config_releases ORDER BY config_version DESC LIMIT 1", []);
  if (rows.length === 0) return { version: 0, config: {} };
  return { version: Number(rows[0].config_version || 0), config: parseJsonb(rows[0].snapshot) || {} };
}
function isRemoteFlagEnabled(nk, key) {
  const active = getActiveRemoteConfig(nk);
  return Boolean(active.config && active.config.system && active.config.system[key] === true);
}
function getRemoteConfigValue(nk, module, key, fallback) {
  const active = getActiveRemoteConfig(nk);
  const values = active.config && active.config[module];
  return values && values[key] !== void 0 ? values[key] : fallback;
}
function invokeWithVersionGate(ctx, logger, nk, payload, handler) {
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ status: "error", code: 400, message: "Invalid JSON" });
  }
  const active = getActiveRemoteConfig(nk);
  const minVersion = String(getRemoteConfigValue(nk, "system", "min_app_version", "0.0.0"));
  const appVersion = String(request.app_version || "0.0.0");
  if (compareVersions(appVersion, minVersion) < 0) {
    return JSON.stringify({
      status: "force_update",
      error: "force_update",
      code: 426,
      config_version: active.version,
      min_app_version: minVersion,
      latest_app_version: getRemoteConfigValue(nk, "system", "latest_app_version", minVersion),
      store_url: ""
    });
  }
  const raw = handler(ctx, logger, nk, payload);
  try {
    const response = JSON.parse(raw || "{}");
    if (response && typeof response === "object" && !Array.isArray(response)) {
      response.config_version = active.version;
      return JSON.stringify(response);
    }
  } catch (_e) {
  }
  return raw;
}
const gatedGetGameConfig = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getGameConfig);
const gatedPublishConfigRelease = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, publishConfigRelease);
const gatedSavePlayerProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, savePlayerProfile);
const gatedLoadPlayerProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, loadPlayerProfile);
const gatedUpdateInventory = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, updateInventory);
const gatedTalismanAction = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, talismanAction);
const gatedTalismanCast = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, talismanCast);
const gatedSpendResource = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, spendResource);
const gatedPurchaseStamina = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, purchaseStamina);
const gatedPurchaseHero = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, purchaseHero);
const gatedStartStage = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, startStage);
const gatedUpgradeElement = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, upgradeElement);
const gatedAwardStageProgression = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, awardStageProgression);
const gatedTribulationAction = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, tribulationAction);
const gatedGetMonetizationStatus = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getMonetizationStatus);
const gatedCreatePurchaseOrder = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, createPurchaseOrder);
const gatedSyncPlayPurchase = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, syncPlayPurchase);
const gatedIapGoogleClaim = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, iapGoogleClaim);
const gatedPrepareRewardedAd = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, prepareRewardedAd);
const gatedConfirmRewardedAd = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, confirmRewardedAd);
const gatedSaveComplianceProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, saveComplianceProfile);
const gatedGetComplianceProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getComplianceProfile);
const gatedDailyCheckinStatus = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, dailyCheckinStatus);
const gatedDailyCheckinClaim = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, dailyCheckinClaim);
function parseRemoteSetting(valueType, raw) {
  if (valueType === "int") {
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error("Expected int");
    return value;
  }
  if (valueType === "float") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error("Expected float");
    return value;
  }
  if (valueType === "bool") {
    if (raw !== "true" && raw !== "false") throw new Error("Expected bool");
    return raw === "true";
  }
  if (valueType === "json") return JSON.parse(raw);
  if (valueType === "string") return raw;
  throw new Error("Unknown setting type");
}
const publishConfigRelease = (ctx, _logger, nk, payload) => {
  if (!ctx.userId || ctx.userId !== String(ctx.env.CONFIG_ADMIN_USER_ID || "")) {
    return JSON.stringify({ status: "error", code: 403, message: "Forbidden" });
  }
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ status: "error", code: 400, message: "Invalid JSON" });
  }
  const rows = nk.sqlQuery("SELECT module, key, value_type, value FROM remote_config_settings WHERE is_active = TRUE ORDER BY module, key", []);
  const snapshot = { system: {}, game_play: {} };
  try {
    rows.forEach((row) => {
      snapshot[String(row.module)][String(row.key)] = parseRemoteSetting(String(row.value_type), String(row.value));
    });
  } catch (e) {
    return JSON.stringify({ status: "error", code: 422, message: String(e) });
  }
  const minVersion = String(snapshot.system.min_app_version || "");
  const latestVersion = String(snapshot.system.latest_app_version || "");
  if (!minVersion || !latestVersion || compareVersions(minVersion, latestVersion) > 0) {
    return JSON.stringify({ status: "error", code: 422, message: "Invalid app-version settings" });
  }
  const active = getActiveRemoteConfig(nk);
  const version = active.version + 1;
  nk.sqlExec(
    `INSERT INTO remote_config_releases
        (config_version, snapshot, min_app_version, latest_app_version, store_url, published_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6)`,
    [version, JSON.stringify(snapshot), minVersion, latestVersion, String(request.store_url || ""), ctx.userId]
  );
  return JSON.stringify({ status: "ok", config_version: version });
};

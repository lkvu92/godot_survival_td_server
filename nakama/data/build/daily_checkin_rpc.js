function checkinConfig(nk) {
  const config = readContentConfig(nk, "daily_checkin");
  return config && Array.isArray(config.days) ? config : {};
}
function checkinLocalDay(ms) {
  return Math.floor((ms + 7 * 60 * 60 * 1e3) / 864e5);
}
function checkinDayText(day) {
  const date = new Date(day * 864e5);
  return date.toISOString().slice(0, 10);
}
function checkinAccountCreatedAtMs(nk, userId, fallback) {
  const rows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM create_time) * 1000 AS created_at_ms FROM users WHERE id = $1::UUID", [userId]);
  return rows.length > 0 ? Math.max(0, Number(rows[0].created_at_ms || fallback)) : fallback;
}
function checkinState(source, accountCreatedAtMs) {
  const state = source && typeof source === "object" ? source : {};
  state.started_at_ms = accountCreatedAtMs;
  if (!Array.isArray(state.claimed_days)) state.claimed_days = [];
  state.claimed_days = state.claimed_days.map((d) => Math.floor(Number(d))).filter((d) => d > 0);
  return state;
}
function checkinStatusFor(state, config, now, accountCreatedAtMs) {
  state = checkinState(state, accountCreatedAtMs);
  const duration = Math.max(1, Math.floor(Number(config.duration_days || config.days.length || 28)));
  const today = checkinLocalDay(now);
  const startDay = checkinLocalDay(Number(state.started_at_ms));
  const openDay = today - startDay + 1;
  const active = openDay >= 1 && openDay <= duration;
  const claimed = state.claimed_days.slice().sort((a, b) => a - b);
  let earliestMissedDay = 0;
  for (let day = 1; day < openDay && day <= duration; day++) {
    if (claimed.indexOf(day) < 0) {
      earliestMissedDay = day;
      break;
    }
  }
  const todayClaimed = openDay >= 1 && openDay <= duration && claimed.indexOf(openDay) >= 0;
  return {
    active,
    campaign_id: String(config.campaign_id || "daily_checkin"),
    duration_days: duration,
    started_at_ms: Number(state.started_at_ms),
    ends_at_ms: (startDay + duration) * 864e5 - 7 * 60 * 60 * 1e3,
    today_day: Math.max(0, Math.min(openDay, duration)),
    claimed_days: claimed,
    earliest_missed_day: earliestMissedDay,
    can_claim_today: active && !todayClaimed,
    can_catchup: active && earliestMissedDay > 0,
    catchup_gem_cost: Math.max(0, Math.floor(Number(config.catchup_gem_cost || 50))),
    last_claim_date: String(state.last_claim_date || ""),
    last_free_claim_date: String(state.last_free_claim_date || "")
  };
}
function checkinGrantItem(items, itemId, amount) {
  if (!itemId || amount <= 0) return false;
  const existing = items.find((entry) => entry && String(entry.item_id || "") === itemId && entry.unique !== true);
  if (existing) existing.quantity = Math.max(0, Number(existing.quantity || 0)) + amount;
  else items.push({ item_id: itemId, quantity: amount, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
  return true;
}
function checkinApplyGrants(nk, profile, items, grants) {
  const issued = [];
  for (const raw of grants) {
    if (!raw || typeof raw !== "object") return null;
    const type = String(raw.type || "");
    const amount = Math.max(0, Math.floor(Number(raw.amount || 0)));
    if (amount <= 0) return null;
    if (type === "resource") {
      const id = String(raw.id || "");
      if (id !== "gold" && id !== "gems") return null;
      profile.resources = profile.resources || {};
      profile.resources[id] = Math.max(0, Number(profile.resources[id] || 0)) + amount;
      issued.push({ type, id, amount });
    } else if (type === "stamina") {
      profile.stamina = Math.min(30, Math.max(0, Number(profile.stamina || 0)) + amount);
      issued.push({ type, amount });
    } else if (type === "item" || type === "random_item") {
      let itemId = String(raw.id || "");
      if (type === "random_item") {
        const pool = Array.isArray(raw.pool) ? raw.pool : [];
        if (pool.length === 0) return null;
        itemId = String(pool[Math.floor(Math.random() * pool.length)] || "");
      }
      if (!itemId || nk.sqlQuery("SELECT id FROM game_items WHERE id = $1", [itemId]).length === 0) return null;
      if (!checkinGrantItem(items, itemId, amount)) return null;
      issued.push({ type: "item", id: itemId, amount });
    } else return null;
  }
  return issued;
}
const dailyCheckinStatus = (ctx, _logger, nk, _payload) => {
  const config = checkinConfig(nk);
  if (Object.keys(config).length === 0) return JSON.stringify({ success: false, message: "Check-in campaign is unavailable", active: false });
  const found = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_daily_checkin", key: "campaign", userId: ctx.userId }
  ]);
  const profileObject = found.find((entry) => entry.collection === "player_profiles");
  const stateObject = found.find((entry) => entry.collection === "player_daily_checkin");
  if (!profileObject) return JSON.stringify({ success: false, message: "Player profile is unavailable", active: false });
  const now = Date.now();
  const accountCreatedAtMs = checkinAccountCreatedAtMs(nk, ctx.userId, now);
  const state = checkinState(stateObject ? stateObject.value : (profileObject.value || {}).daily_checkin, accountCreatedAtMs);
  if (!stateObject) {
    const created = nk.storageWrite([{
      collection: "player_daily_checkin",
      key: "campaign",
      userId: ctx.userId,
      value: state,
      permissionRead: 1,
      permissionWrite: 0,
      version: "*"
    }]);
    if (created.length !== 1) return JSON.stringify({ success: false, message: "Could not initialize check-in state", active: false });
  }
  return JSON.stringify(Object.assign({ success: true }, checkinStatusFor(state, config, now, accountCreatedAtMs)));
};
const dailyCheckinClaim = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid request" });
  }
  const config = checkinConfig(nk);
  if (Object.keys(config).length === 0) return JSON.stringify({ success: false, message: "Check-in campaign is unavailable" });
  const objects = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_daily_checkin", key: "campaign", userId: ctx.userId }
  ]);
  const profileObject = objects.find((o) => o.collection === "player_profiles");
  const inventoryObject = objects.find((o) => o.collection === "player_inventory");
  const stateObject = objects.find((o) => o.collection === "player_daily_checkin");
  if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player data is incomplete" });
  const profile = profileObject.value || {};
  const inventoryValue = inventoryObject.value || { items: [] };
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const now = Date.now();
  const accountCreatedAtMs = checkinAccountCreatedAtMs(nk, ctx.userId, now);
  const state = checkinState(stateObject ? stateObject.value : profile.daily_checkin, accountCreatedAtMs);
  const status = checkinStatusFor(state, config, now, accountCreatedAtMs);
  if (!status.active) return JSON.stringify({ success: false, message: "Campaign has ended", state: status });
  const requestedDay = Math.floor(Number(req.day || 0));
  if (requestedDay <= 0 || requestedDay > status.today_day) return JSON.stringify({ success: false, message: "Reward is not available yet", state: status });
  if (status.claimed_days.indexOf(requestedDay) >= 0) return JSON.stringify({ success: false, message: "Reward was already claimed", state: status });
  let claimMode = "";
  if (requestedDay === status.today_day && status.can_claim_today) claimMode = "free";
  else if (requestedDay === status.earliest_missed_day && status.can_catchup) claimMode = "catchup";
  else return JSON.stringify({ success: false, message: "Earlier missed rewards must be claimed first", state: status });
  const day = config.days.find((entry) => Math.floor(Number(entry.day)) === requestedDay);
  if (!day || !Array.isArray(day.grants)) return JSON.stringify({ success: false, message: "Invalid reward configuration" });
  const cost = claimMode === "catchup" ? status.catchup_gem_cost : 0;
  profile.resources = profile.resources || {};
  if (Number(profile.resources.gems || 0) < cost) return JSON.stringify({ success: false, message: "Not enough gems for catch-up", gem_cost: cost, state: status });
  profile.resources.gems = Math.max(0, Number(profile.resources.gems || 0) - cost);
  const grants = checkinApplyGrants(nk, profile, items, day.grants);
  if (!grants) return JSON.stringify({ success: false, message: "Invalid reward configuration" });
  state.claimed_days.push(requestedDay);
  state.last_claim_date = checkinDayText(checkinLocalDay(now));
  if (cost === 0) state.last_free_claim_date = state.last_claim_date;
  inventoryValue.items = items;
  const writes = nk.storageWrite([
    { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
    { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
    { collection: "player_daily_checkin", key: "campaign", userId: ctx.userId, value: state, permissionRead: 1, permissionWrite: 0, version: stateObject ? stateObject.version : "*" }
  ]);
  if (writes.length !== 3) return JSON.stringify({ success: false, message: "Could not persist check-in reward" });
  const persisted = nk.storageRead([{ collection: "player_daily_checkin", key: "campaign", userId: ctx.userId }]);
  if (persisted.length !== 1 || !Array.isArray(persisted[0].value.claimed_days) || persisted[0].value.claimed_days.indexOf(requestedDay) < 0) {
    return JSON.stringify({ success: false, message: "Check-in reward was not persisted" });
  }
  return JSON.stringify({ success: true, day: requestedDay, claim_mode: claimMode, gem_cost: cost, grants, profile, inventory: items, state: checkinStatusFor(state, config, now, accountCreatedAtMs) });
};

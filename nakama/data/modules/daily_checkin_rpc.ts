// Server-authoritative, multi-campaign daily check-in.

function checkinConfig(nk: nkruntime.Nakama): any {
    const config = readContentConfig(nk, "daily_checkin");
    return config && typeof config === "object" ? config : {};
}

function checkinLocalDay(ms: number): number {
    // Campaign calendar is deliberately fixed to Vietnam time (UTC+7).
    return Math.floor((ms + 7 * 60 * 60 * 1000) / 86400000);
}

function checkinDayText(day: number): string {
    return new Date(day * 86400000).toISOString().slice(0, 10);
}

function checkinAccountCreatedAtMs(nk: nkruntime.Nakama, userId: string, fallback: number): number {
    const rows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM create_time) * 1000 AS created_at_ms FROM users WHERE id = $1::UUID", [userId]);
    return rows.length > 0 ? Math.max(0, Number(rows[0].created_at_ms || fallback)) : fallback;
}

function checkinCampaigns(config: any): any[] {
    const definitions = Array.isArray(config.campaigns) && config.campaigns.length > 0 ? config.campaigns : [config];
    return definitions.map((raw: any) => {
        const campaign = raw && typeof raw === "object" ? raw : {};
        return {
            campaign_id: String(campaign.campaign_id || config.campaign_id || "daily_checkin"),
            title: String(campaign.title || config.title || "ĐIỂM DANH"),
            subtitle: String(campaign.subtitle || config.subtitle || ""),
            start_mode: String(campaign.start_mode || config.start_mode || "account_created"),
            starts_at: String(campaign.starts_at || ""),
            ends_at: String(campaign.ends_at || ""),
            duration_days: Math.max(1, Math.floor(Number(campaign.duration_days || config.duration_days || 28))),
            catchup_gem_cost: Math.max(0, Math.floor(Number(campaign.catchup_gem_cost || config.catchup_gem_cost || 50))),
            priority: Math.floor(Number(campaign.priority || 0)),
            days: Array.isArray(campaign.days) && campaign.days.length > 0 ? campaign.days : config.days
        };
    }).filter((campaign: any) => campaign.campaign_id.length > 0 && Array.isArray(campaign.days) && campaign.days.length > 0);
}

function checkinCampaignStartMs(campaign: any, accountCreatedAtMs: number): number {
    if (campaign.start_mode === "fixed") {
        const parsed = Date.parse(String(campaign.starts_at || ""));
        return isNaN(parsed) ? 0 : parsed;
    }
    return accountCreatedAtMs;
}

function checkinCampaignWindow(campaign: any, now: number, accountCreatedAtMs: number): any {
    const startMs = checkinCampaignStartMs(campaign, accountCreatedAtMs);
    if (startMs <= 0) return { active: false, start_ms: 0, end_ms: 0, open_day: 0 };
    const startDay = checkinLocalDay(startMs);
    const duration = Math.max(1, Number(campaign.duration_days || 28));
    let endMs = (startDay + duration) * 86400000 - 7 * 60 * 60 * 1000;
    if (campaign.ends_at) {
        const configuredEnd = Date.parse(String(campaign.ends_at));
        if (!isNaN(configuredEnd)) endMs = configuredEnd;
    }
    const openDay = checkinLocalDay(now) - startDay + 1;
    return { active: now >= startMs && now < endMs && openDay >= 1 && openDay <= duration,
        start_ms: startMs, end_ms: endMs, open_day: openDay };
}

function checkinSelectCampaign(config: any, now: number, accountCreatedAtMs: number): any {
    const active = checkinCampaigns(config).map((campaign: any) => {
        return { campaign, window: checkinCampaignWindow(campaign, now, accountCreatedAtMs) };
    }).filter((entry: any) => entry.window.active);
    active.sort((a: any, b: any) => Number(b.campaign.priority) - Number(a.campaign.priority)
        || Number(b.window.start_ms) - Number(a.window.start_ms));
    return active.length > 0 ? active[0] : null;
}

function checkinStorageKey(campaignId: string): string {
    return ("campaign_" + campaignId.replace(/[^A-Za-z0-9_.-]/g, "_")).slice(0, 120);
}

function checkinState(source: any, campaignId: string, startMs: number): any {
    const raw = source && typeof source === "object" ? source : {};
    const claimed = Array.isArray(raw.claimed_days) ? raw.claimed_days : [];
    return {
        campaign_id: campaignId,
        started_at_ms: startMs,
        claimed_days: claimed.map((d: any) => Math.floor(Number(d)))
            .filter((d: number, index: number, all: number[]) => d > 0 && all.indexOf(d) === index),
        last_claim_date: String(raw.last_claim_date || ""),
        last_free_claim_date: String(raw.last_free_claim_date || "")
    };
}

function checkinStatusFor(state: any, campaign: any, window: any): any {
    const duration = Math.max(1, Math.floor(Number(campaign.duration_days || campaign.days.length || 28)));
    const openDay = Number(window.open_day || 0);
    const claimed: number[] = state.claimed_days.slice().sort((a: number, b: number) => a - b);
    let earliestMissedDay = 0;
    for (let day = 1; day < openDay && day <= duration; day++) {
        if (claimed.indexOf(day) < 0) { earliestMissedDay = day; break; }
    }
    const todayClaimed = openDay >= 1 && openDay <= duration && claimed.indexOf(openDay) >= 0;
    return {
        active: Boolean(window.active), campaign_id: campaign.campaign_id,
        campaign_title: campaign.title, campaign_subtitle: campaign.subtitle,
        duration_days: duration, started_at_ms: Number(window.start_ms), ends_at_ms: Number(window.end_ms),
        today_day: Math.max(0, Math.min(openDay, duration)), claimed_days: claimed,
        earliest_missed_day: earliestMissedDay,
        can_claim_today: Boolean(window.active) && !todayClaimed,
        can_catchup: Boolean(window.active) && earliestMissedDay > 0,
        catchup_gem_cost: campaign.catchup_gem_cost,
        last_claim_date: String(state.last_claim_date || ""),
        last_free_claim_date: String(state.last_free_claim_date || ""),
        days: campaign.days
    };
}

function checkinGrantItem(items: any[], itemId: string, amount: number): boolean {
    if (!itemId || amount <= 0) return false;
    const existing = items.find((entry: any) => entry && String(entry.item_id || "") === itemId && entry.unique !== true);
    if (existing) existing.quantity = Math.max(0, Number(existing.quantity || 0)) + amount;
    else items.push({ item_id: itemId, quantity: amount, acquired_at: new Date().toISOString() });
    return true;
}

function checkinApplyGrants(nk: nkruntime.Nakama, profile: any, items: any[], grants: any[]): any[] | null {
    const issued: any[] = [];
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

function checkinReadState(nk: nkruntime.Nakama, userId: string, campaign: any, window: any): any {
    const key = checkinStorageKey(campaign.campaign_id);
    const requests: nkruntime.StorageReadRequest[] = [{ collection: "player_daily_checkin", key, userId }];
    // One-time migration path for the original account-created campaign.
    if (campaign.start_mode === "account_created") requests.push({ collection: "player_daily_checkin", key: "campaign", userId });
    const objects = nk.storageRead(requests);
    const current = objects.find((entry: any) => entry.key === key);
    const legacy = objects.find((entry: any) => entry.key === "campaign");
    const source = current ? current.value : (legacy ? legacy.value : {});
    return { key, object: current, state: checkinState(source, campaign.campaign_id, window.start_ms) };
}

const dailyCheckinStatus: nkruntime.RpcFunction = (ctx, _logger, nk, _payload): string => {
    const config = checkinConfig(nk);
    const now = Date.now();
    const accountCreatedAtMs = checkinAccountCreatedAtMs(nk, ctx.userId, now);
    const selected = checkinSelectCampaign(config, now, accountCreatedAtMs);
    if (!selected) return JSON.stringify({ success: true, active: false, campaign_id: "", claimed_days: [], days: [] });
    const stored = checkinReadState(nk, ctx.userId, selected.campaign, selected.window);
    if (!stored.object) {
        const created = nk.storageWrite([{ collection: "player_daily_checkin", key: stored.key, userId: ctx.userId,
            value: stored.state, permissionRead: 1, permissionWrite: 0, version: "*" }]);
        if (created.length !== 1) return JSON.stringify({ success: false, active: false, message: "Could not initialize check-in campaign" });
    }
    return JSON.stringify(Object.assign({ success: true }, checkinStatusFor(stored.state, selected.campaign, selected.window)));
};

const dailyCheckinClaim: nkruntime.RpcFunction = (ctx, _logger, nk, payload): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); } catch (_e) { return JSON.stringify({ success: false, message: "Invalid request" }); }
    const config = checkinConfig(nk);
    const now = Date.now();
    const accountCreatedAtMs = checkinAccountCreatedAtMs(nk, ctx.userId, now);
    const selected = checkinSelectCampaign(config, now, accountCreatedAtMs);
    if (!selected) return JSON.stringify({ success: false, message: "No check-in campaign is active", active: false });
    if (req.campaign_id && String(req.campaign_id) !== selected.campaign.campaign_id) {
        return JSON.stringify({ success: false, message: "Check-in campaign has changed; refresh and try again" });
    }
    const objects = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
        { collection: "player_inventory", key: "items", userId: ctx.userId }
    ]);
    const profileObject = objects.find((o: any) => o.collection === "player_profiles");
    const inventoryObject = objects.find((o: any) => o.collection === "player_inventory");
    if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player data is incomplete" });
    const stored = checkinReadState(nk, ctx.userId, selected.campaign, selected.window);
    const state = stored.state;
    const status = checkinStatusFor(state, selected.campaign, selected.window);
    const requestedDay = Math.floor(Number(req.day || 0));
    if (requestedDay <= 0 || requestedDay > status.today_day) return JSON.stringify({ success: false, message: "Reward is not available yet", state: status });
    if (status.claimed_days.indexOf(requestedDay) >= 0) return JSON.stringify({ success: false, message: "Reward was already claimed", state: status });
    let claimMode = "";
    if (requestedDay === status.today_day && status.can_claim_today) claimMode = "free";
    else if (requestedDay === status.earliest_missed_day && status.can_catchup) claimMode = "catchup";
    else return JSON.stringify({ success: false, message: "Earlier missed rewards must be claimed first", state: status });
    const day = selected.campaign.days.find((entry: any) => Math.floor(Number(entry.day)) === requestedDay);
    if (!day || !Array.isArray(day.grants)) return JSON.stringify({ success: false, message: "Invalid reward configuration" });
    const profile = profileObject.value || {};
    const inventoryValue = inventoryObject.value || { items: [] };
    const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
    const cost = claimMode === "catchup" ? status.catchup_gem_cost : 0;
    profile.resources = profile.resources || {};
    if (Number(profile.resources.gems || 0) < cost) return JSON.stringify({ success: false, message: "Not enough gems for catch-up", gem_cost: cost, state: status });
    profile.resources.gems = Math.max(0, Number(profile.resources.gems || 0) - cost);
    const grants = checkinApplyGrants(nk, profile, items, day.grants);
    if (!grants) return JSON.stringify({ success: false, message: "Invalid reward configuration" });
    const claimDate = checkinDayText(checkinLocalDay(now));
    const nextState = { campaign_id: selected.campaign.campaign_id, started_at_ms: selected.window.start_ms,
        claimed_days: status.claimed_days.concat([requestedDay]), last_claim_date: claimDate,
        last_free_claim_date: cost === 0 ? claimDate : state.last_free_claim_date };
    inventoryValue.items = items;
    const writes = nk.storageWrite([
        { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
        { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
        { collection: "player_daily_checkin", key: stored.key, userId: ctx.userId, value: nextState, permissionRead: 1, permissionWrite: 0, version: stored.object ? stored.object.version : "*" }
    ]);
    if (writes.length !== 3) return JSON.stringify({ success: false, message: "Could not persist check-in reward" });
    const persisted = nk.storageRead([{ collection: "player_daily_checkin", key: stored.key, userId: ctx.userId }]);
    if (persisted.length !== 1 || !Array.isArray(persisted[0].value.claimed_days)
        || persisted[0].value.claimed_days.indexOf(requestedDay) < 0) {
        return JSON.stringify({ success: false, message: "Check-in reward was not persisted" });
    }
    return JSON.stringify({ success: true, day: requestedDay, campaign_id: selected.campaign.campaign_id,
        claim_mode: claimMode, gem_cost: cost, grants, profile, inventory: items,
        state: checkinStatusFor(nextState, selected.campaign, selected.window) });
};

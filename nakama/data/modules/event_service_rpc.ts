// Generic, server-authoritative event campaigns and quest progress.

const EVENT_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const EVENT_UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;

function eventObject(value: any): any {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function eventConfig(nk: nkruntime.Nakama): any {
    return eventObject(readContentConfig(nk, "events"));
}

function eventDefinitions(nk: nkruntime.Nakama): any[] {
    const raw = eventConfig(nk);
    return (Array.isArray(raw.events) ? raw.events : []).filter((entry: any) => entry && entry.active !== false
        && String(entry.event_id || "").length > 0 && Array.isArray(entry.quests));
}

function eventValidateConfig(config: any): string {
    const events = config && Array.isArray(config.events) ? config.events : [];
    if (events.length === 0) return "events must contain at least one campaign";
    const identities: string[] = [];
    const supported = ["stage_clear", "enemy_kill", "specific_stage_clear", "element_upgrade",
        "talisman_enhance", "profile_complete", "user_level_reached", "stamina_spent", "item_earned"];
    for (const campaign of events) {
        const id = String(campaign && campaign.event_id || "");
        const version = Math.max(0, Math.floor(Number(campaign && campaign.version || 0)));
        if (!id || version < 1) return "event_id and positive version are required";
        const identity = `${id}:v${version}`;
        if (identities.indexOf(identity) >= 0) return `duplicate event identity ${identity}`;
        identities.push(identity);
        const start = eventParseTime(campaign.starts_at);
        const end = eventParseTime(campaign.ends_at);
        if (start <= 0 || end <= start) return `${identity} has an invalid time window`;
        const interval = String(eventObject(campaign.recurrence).interval || "none");
        if (["none", "week", "month", "year"].indexOf(interval) < 0) return `${identity} has an invalid recurrence interval`;
        const duration = end - start;
        if ((interval === "week" && duration >= 7 * 86400000)
            || (interval === "month" && duration >= 28 * 86400000)
            || (interval === "year" && duration >= 365 * 86400000)) {
            return `${identity} duration overlaps its recurrence interval`;
        }
        if (!Array.isArray(campaign.quests) || campaign.quests.length === 0) return `${identity} has no quests`;
        const questIds: string[] = [];
        for (const quest of campaign.quests) {
            const questId = String(quest && quest.quest_id || "");
            if (!questId || questIds.indexOf(questId) >= 0) return `${identity} has an invalid or duplicate quest_id`;
            questIds.push(questId);
            if (supported.indexOf(String(quest.type || "")) < 0 || Number(quest.target || 0) <= 0) return `${identity}/${questId} is invalid`;
            const tracks = eventRewardTracks(quest);
            if (tracks.normal.length === 0) return `${identity}/${questId} requires a normal reward track`;
        }
    }
    return "";
}

function eventParseTime(value: any): number {
    const parsed = Date.parse(String(value || ""));
    return isNaN(parsed) ? 0 : parsed;
}

function eventLocalParts(ms: number): any {
    const date = new Date(ms + EVENT_TIMEZONE_OFFSET_MS);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate(),
        hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() };
}

function eventLocalEpoch(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
    const shifted = Date.UTC(year, month, day, hour, minute, second);
    const check = new Date(shifted);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return 0;
    return shifted - EVENT_TIMEZONE_OFFSET_MS;
}

function eventMonthlyOccurrence(anchor: any, monthIndex: number): number {
    const year = Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    return eventLocalEpoch(year, month, anchor.day, anchor.hour, anchor.minute, anchor.second);
}

function eventYearlyOccurrence(anchor: any, year: number): number {
    return eventLocalEpoch(year, anchor.month, anchor.day, anchor.hour, anchor.minute, anchor.second);
}

function eventOccurrence(campaign: any, now: number): any | null {
    const anchorStart = eventParseTime(campaign.starts_at);
    const anchorEnd = eventParseTime(campaign.ends_at);
    const duration = anchorEnd - anchorStart;
    if (anchorStart <= 0 || duration <= 0) return null;
    const interval = String(eventObject(campaign.recurrence).interval || "none").toLowerCase();
    let currentStart = anchorStart;
    let nextStart = anchorStart;
    if (interval === "week") {
        const step = 7 * 86400000;
        const index = Math.max(0, Math.floor((now - anchorStart) / step));
        currentStart = anchorStart + index * step;
        nextStart = now < anchorStart ? anchorStart : currentStart + step;
    } else if (interval === "month") {
        const anchor = eventLocalParts(anchorStart);
        const current = eventLocalParts(now);
        let monthIndex = current.year * 12 + current.month;
        currentStart = eventMonthlyOccurrence(anchor, monthIndex);
        while ((currentStart <= 0 || currentStart > now) && monthIndex >= anchor.year * 12 + anchor.month) {
            monthIndex--;
            currentStart = eventMonthlyOccurrence(anchor, monthIndex);
        }
        let nextIndex = Math.max(monthIndex + 1, anchor.year * 12 + anchor.month);
        nextStart = eventMonthlyOccurrence(anchor, nextIndex);
        while (nextStart <= 0 || nextStart <= now) { nextIndex++; nextStart = eventMonthlyOccurrence(anchor, nextIndex); }
    } else if (interval === "year") {
        const anchor = eventLocalParts(anchorStart);
        let year = eventLocalParts(now).year;
        currentStart = eventYearlyOccurrence(anchor, year);
        while ((currentStart <= 0 || currentStart > now) && year >= anchor.year) {
            year--;
            currentStart = eventYearlyOccurrence(anchor, year);
        }
        let nextYear = Math.max(year + 1, anchor.year);
        nextStart = eventYearlyOccurrence(anchor, nextYear);
        while (nextStart <= 0 || nextStart <= now) { nextYear++; nextStart = eventYearlyOccurrence(anchor, nextYear); }
    } else {
        currentStart = anchorStart;
        nextStart = anchorStart;
    }
    if (currentStart >= anchorStart && now >= currentStart && now < currentStart + duration) {
        return { occurrence_id: String(currentStart), starts_at_ms: currentStart,
            ends_at_ms: currentStart + duration, phase: "active" };
    }
    if (nextStart > now && nextStart - now <= EVENT_UPCOMING_WINDOW_MS) {
        return { occurrence_id: String(nextStart), starts_at_ms: nextStart,
            ends_at_ms: nextStart + duration, phase: "upcoming" };
    }
    return null;
}

function eventStorageKey(eventId: string, version: number, occurrenceId: string): string {
    return (`${eventId}_v${version}_${occurrenceId}`).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
}

function eventEmptyState(campaign: any, occurrence: any): any {
    return { event_id: String(campaign.event_id), version: Math.max(1, Number(campaign.version || 1)),
        occurrence_id: occurrence.occurrence_id, progress: {}, claimed: {}, processed_receipts: [] };
}

function eventReadState(nk: nkruntime.Nakama, userId: string, campaign: any, occurrence: any): any {
    const key = eventStorageKey(String(campaign.event_id), Math.max(1, Number(campaign.version || 1)), occurrence.occurrence_id);
    const found = nk.storageRead([{ collection: "player_event_progress", key, userId }]);
    const object = found.length > 0 ? found[0] : null;
    const raw = object ? eventObject(object.value) : eventEmptyState(campaign, occurrence);
    return { key, object, state: {
        event_id: String(campaign.event_id), version: Math.max(1, Number(campaign.version || 1)),
        occurrence_id: occurrence.occurrence_id, progress: eventObject(raw.progress), claimed: eventObject(raw.claimed),
        processed_receipts: Array.isArray(raw.processed_receipts) ? raw.processed_receipts.map((id: any) => String(id)).slice(-200) : []
    }};
}

function eventRequirements(campaign: any, profile: any): any {
    const requirements = eventObject(campaign.requirements);
    const levelRequired = Math.max(1, Math.floor(Number(requirements.level || 1)));
    const vipRequired = Math.max(0, Math.floor(Number(requirements.vip || 0)));
    const level = Math.max(1, Math.floor(Number(profile.level || 1)));
    const vip = Math.max(0, Math.floor(Number(profile.vip || 0)));
    const missing: any = {};
    if (level < levelRequired) missing.level = { required: levelRequired, current: level };
    if (vip < vipRequired) missing.vip = { required: vipRequired, current: vip };
    return { eligible: Object.keys(missing).length === 0, required_level: levelRequired,
        required_vip: vipRequired, missing_requirements: missing };
}

function eventProfileComplete(compliance: any): boolean {
    return compliance.is_verified === true && String(compliance.full_name || "").length >= 2
        && String(compliance.birth_date || "").length > 0 && String(compliance.id_number || "").length > 0
        && String(compliance.phone_number || "").length >= 8 && String(compliance.email || "").indexOf("@") > 0;
}

function eventQuestProgress(quest: any, state: any, profile: any, compliance: any): number {
    const id = String(quest.quest_id || "");
    const type = String(quest.type || "");
    let value = Math.max(0, Number(eventObject(state.progress)[id] || 0));
    if (type === "user_level_reached") value = Math.max(value, Number(profile.level || 1));
    if (type === "profile_complete") value = Math.max(value, eventProfileComplete(compliance) ? 1 : 0);
    return value;
}

function eventRewardTracks(quest: any): any {
    const rewards = eventObject(quest.rewards);
    const normal = Array.isArray(rewards.normal) ? rewards.normal : [];
    const vipRaw = rewards.vip;
    const vip = Array.isArray(vipRaw) ? { required_vip: 1, grants: vipRaw }
        : { required_vip: Math.max(0, Number(eventObject(vipRaw).required_vip || 1)),
            grants: Array.isArray(eventObject(vipRaw).grants) ? eventObject(vipRaw).grants : [] };
    return { normal, vip };
}

function eventView(nk:nkruntime.Nakama,campaign: any, occurrence: any, state: any, profile: any, compliance: any): any {
    const requirements = eventRequirements(campaign, profile);
    const claimed = eventObject(state.claimed);
    const quests = campaign.quests.map((quest: any) => {
        const id = String(quest.quest_id || "");
        const target = Math.max(1, Number(quest.target || 1));
        const progress = eventQuestProgress(quest, state, profile, compliance);
        const tracks = eventRewardTracks(quest);
        tracks.normal=vipScaleRewardGrants(nk,tracks.normal,Number(profile.vip||0));
        tracks.vip.grants=vipScaleRewardGrants(nk,tracks.vip.grants,Number(profile.vip||0));
        const questClaims = eventObject(claimed[id]);
        return { quest_id: id, name: String(quest.name || id), type: String(quest.type || ""),
            target, progress: Math.min(progress, target), completed: progress >= target,
            icon_type: String(quest.icon_type || "pack"), icon_key: String(quest.icon_key || "gem_pouch"),
            filters: eventObject(quest.filters), rewards: tracks,
            claimed: { normal: questClaims.normal === true, vip: questClaims.vip === true } };
    });
    let status = occurrence.phase === "upcoming" ? "upcoming" : (requirements.eligible ? "processing" : "ineligible");
    if (status === "processing" && quests.length > 0 && quests.every((quest: any) => quest.completed)) status = "completed";
    return { event_id: String(campaign.event_id), version: Math.max(1, Number(campaign.version || 1)),
        occurrence_id: occurrence.occurrence_id, title: String(campaign.title || "SỰ KIỆN"),
        subtitle: String(campaign.subtitle || ""), description: String(campaign.description || ""),
        banner_title: String(campaign.banner_title || campaign.title || ""), route_id: String(campaign.route_id || ""),
        starts_at_ms: occurrence.starts_at_ms, ends_at_ms: occurrence.ends_at_ms, status,
        requirements: { level: requirements.required_level, vip: requirements.required_vip },
        missing_requirements: requirements.missing_requirements, quests };
}

function eventQuestMatches(quest: any, triggerType: string, context: any): boolean {
    if (String(quest.type || "") !== triggerType) return false;
    const filters = eventObject(quest.filters);
    if (triggerType === "specific_stage_clear") {
        const stages: any[] = Array.isArray(filters.stage_ids) ? filters.stage_ids : [];
        return stages.length === 0 || stages.indexOf(String(context.stage_id || "")) >= 0;
    }
    if (triggerType === "element_upgrade") {
        const elements: any[] = Array.isArray(filters.elements) ? filters.elements : [];
        return elements.length === 0 || elements.indexOf(String(context.element || "")) >= 0;
    }
    if (triggerType === "talisman_enhance") {
        const talismans: any[] = Array.isArray(filters.talisman_ids) ? filters.talisman_ids : [];
        return talismans.length === 0 || talismans.map((id: any) => String(id)).indexOf(String(context.talisman_id || "")) >= 0;
    }
    if (triggerType === "item_earned") {
        const itemId = String(context.item_id || "");
        const ids: any[] = Array.isArray(filters.item_ids) ? filters.item_ids : [];
        const prefixes: any[] = Array.isArray(filters.item_prefixes) ? filters.item_prefixes : [];
        return (ids.length === 0 && prefixes.length === 0) || ids.indexOf(itemId) >= 0
            || prefixes.some((prefix: any) => itemId.indexOf(String(prefix)) === 0);
    }
    return true;
}

// Internal server API. Client code never submits progress directly.
function eventRecord(nk: nkruntime.Nakama, userId: string, triggerType: string, amount: number,
    context: any, idempotencyKey: string): void {
    if (!userId || amount <= 0 || !idempotencyKey) return;
    try {
        const now = Date.now();
        const profileObjects = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
        if (profileObjects.length === 0) return;
        const profile = eventObject(profileObjects[0].value);
        profile.vip = readVipProgress(nk, userId, vipRuntimeMode).level;
        for (const campaign of eventDefinitions(nk)) {
            const occurrence = eventOccurrence(campaign, now);
            if (!occurrence || occurrence.phase !== "active" || !eventRequirements(campaign, profile).eligible) continue;
            const matching = campaign.quests.filter((quest: any) => eventQuestMatches(quest, triggerType, context));
            if (matching.length === 0) continue;
            const stored = eventReadState(nk, userId, campaign, occurrence);
            const receipt = `${triggerType}:${idempotencyKey}`.slice(0, 180);
            if (stored.state.processed_receipts.indexOf(receipt) >= 0) continue;
            for (const quest of matching) {
                const questId = String(quest.quest_id || "");
                const previous = Math.max(0, Number(stored.state.progress[questId] || 0));
                stored.state.progress[questId] = triggerType === "user_level_reached"
                    ? Math.max(previous, amount) : previous + amount;
            }
            stored.state.processed_receipts.push(receipt);
            stored.state.processed_receipts = stored.state.processed_receipts.slice(-200);
            nk.storageWrite([{ collection: "player_event_progress", key: stored.key, userId, value: stored.state,
                permissionRead: 1, permissionWrite: 0, version: stored.object ? stored.object.version : "*" }]);
        }
    } catch (_error) {
        // Event telemetry must never invalidate the authoritative gameplay RPC.
    }
}

function eventGrantItem(nk: nkruntime.Nakama, items: any[], itemId: string, amount: number): boolean {
    if (!itemId || amount <= 0 || nk.sqlQuery("SELECT id FROM game_items WHERE id = $1", [itemId]).length === 0) return false;
    const existing = items.find((entry: any) => entry && String(entry.item_id || "") === itemId && entry.unique !== true);
    if (existing) existing.quantity = Math.max(0, Number(existing.quantity || 0)) + amount;
    else items.push({ item_id: itemId, quantity: amount, acquired_at: new Date().toISOString() });
    return true;
}

function eventApplyGrants(nk: nkruntime.Nakama, profile: any, items: any[], grants: any[]): any[] | null {
    const issued: any[] = [];
    for (const raw of grants) {
        const grant = eventObject(raw);
        const type = String(grant.type || "");
        const amount = Math.max(0, Math.floor(Number(grant.amount || 0)));
        if (amount <= 0) return null;
        if (type === "resource") {
            const id = String(grant.id || "");
            if (id !== "gold" && id !== "gems") return null;
            profile.resources = eventObject(profile.resources);
            profile.resources[id] = Math.max(0, Number(profile.resources[id] || 0)) + amount;
            issued.push({ type, id, amount });
        } else if (type === "stamina") {
            profile.stamina = staminaClamp(nk, Number(profile.stamina || 0) + amount);
            issued.push({ type, amount });
        } else if (type === "item" || type === "random_item") {
            let id = String(grant.id || "");
            if (type === "random_item") {
                const pool = Array.isArray(grant.pool) ? grant.pool : [];
                if (pool.length === 0) return null;
                id = String(pool[Math.floor(Math.random() * pool.length)] || "");
            }
            if (!eventGrantItem(nk, items, id, amount)) return null;
            issued.push({ type: "item", id, amount });
        } else return null;
    }
    return issued;
}

const eventList: nkruntime.RpcFunction = (ctx, _logger, nk, _payload): string => {
    const now = Date.now();
    const base = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
        { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId }
    ]);
    const profileObject = base.find((entry: any) => entry.collection === "player_profiles");
    if (!profileObject) return JSON.stringify({ success: false, message: "Player profile is unavailable" });
    const profile = eventObject(profileObject.value);
    profile.vip = readVipProgress(nk, ctx.userId, monetizationMode(ctx)).level;
    const complianceObject = base.find((entry: any) => entry.collection === "player_compliance_profiles");
    const compliance = complianceObject ? eventObject(complianceObject.value) : {};
    const activeEvents: any[] = [];
    const upcomingEvents: any[] = [];
    for (const campaign of eventDefinitions(nk)) {
        const occurrence = eventOccurrence(campaign, now);
        if (!occurrence) continue;
        const stored = eventReadState(nk, ctx.userId, campaign, occurrence);
        const view = eventView(nk,campaign, occurrence, stored.state, profile, compliance);
        if (occurrence.phase === "upcoming") upcomingEvents.push(view); else activeEvents.push(view);
    }
    const newestFirst = (a: any, b: any) => Number(b.starts_at_ms) - Number(a.starts_at_ms);
    activeEvents.sort(newestFirst); upcomingEvents.sort(newestFirst);
    return JSON.stringify({ success: true, server_time_ms: now, active_events: activeEvents, upcoming_events: upcomingEvents });
};

const eventClaim: nkruntime.RpcFunction = (ctx, _logger, nk, payload): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); } catch (_error) { return JSON.stringify({ success: false, message: "Invalid JSON" }); }
    const eventId = String(req.event_id || "");
    const occurrenceId = String(req.occurrence_id || "");
    const questId = String(req.quest_id || "");
    const track = String(req.track || "normal");
    if (track !== "normal" && track !== "vip") return JSON.stringify({ success: false, message: "Invalid reward track" });
    const campaign = eventDefinitions(nk).find((entry: any) => String(entry.event_id) === eventId);
    const occurrence = campaign ? eventOccurrence(campaign, Date.now()) : null;
    if (!campaign || !occurrence || occurrence.phase !== "active" || occurrence.occurrence_id !== occurrenceId) {
        return JSON.stringify({ success: false, message: "Event occurrence is not active" });
    }
    const objects = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
        { collection: "player_inventory", key: "items", userId: ctx.userId },
        { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId }
    ]);
    const profileObject = objects.find((entry: any) => entry.collection === "player_profiles");
    const inventoryObject = objects.find((entry: any) => entry.collection === "player_inventory");
    const complianceObject = objects.find((entry: any) => entry.collection === "player_compliance_profiles");
    if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player data is incomplete" });
    const profile = eventObject(profileObject.value);
    profile.vip = readVipProgress(nk, ctx.userId, monetizationMode(ctx)).level;
    const inventory = eventObject(inventoryObject.value);
    const items: any[] = Array.isArray(inventory.items) ? inventory.items : [];
    const compliance = complianceObject ? eventObject(complianceObject.value) : {};
    const requirements = eventRequirements(campaign, profile);
    if (!requirements.eligible) return JSON.stringify({ success: false, message: "Event requirements are not met" });
    const quest = campaign.quests.find((entry: any) => String(entry.quest_id || "") === questId);
    if (!quest) return JSON.stringify({ success: false, message: "Unknown event quest" });
    const stored = eventReadState(nk, ctx.userId, campaign, occurrence);
    const progress = eventQuestProgress(quest, stored.state, profile, compliance);
    if (progress < Math.max(1, Number(quest.target || 1))) return JSON.stringify({ success: false, message: "Quest is not completed" });
    const questClaims = eventObject(stored.state.claimed[questId]);
    if (questClaims[track] === true) return JSON.stringify({ success: false, message: "Reward was already claimed" });
    const tracks = eventRewardTracks(quest);
    const grants = track === "normal" ? tracks.normal : tracks.vip.grants;
    if (!Array.isArray(grants) || grants.length === 0) return JSON.stringify({ success: false, message: "Reward track is unavailable" });
    if (track === "vip" && Number(profile.vip || 0) < Number(tracks.vip.required_vip || 1)) {
        return JSON.stringify({ success: false, message: "VIP requirement is not met" });
    }
    const issued = eventApplyGrants(nk, profile, items, vipScaleRewardGrants(nk,grants,Number(profile.vip||0)));
    if (!issued) return JSON.stringify({ success: false, message: "Invalid event reward configuration" });
    questClaims[track] = true;
    stored.state.claimed[questId] = questClaims;
    inventory.items = items;
    const writes = nk.storageWrite([
        { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: profileObject.version },
        { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventory,
            permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
        { collection: "player_event_progress", key: stored.key, userId: ctx.userId, value: stored.state,
            permissionRead: 1, permissionWrite: 0, version: stored.object ? stored.object.version : "*" }
    ]);
    if (writes.length !== 3) return JSON.stringify({ success: false, message: "Could not persist event reward" });
    return JSON.stringify({ success: true, event_id: eventId, occurrence_id: occurrenceId, quest_id: questId,
        track, grants: issued, profile, inventory: items,
        event: eventView(nk,campaign, occurrence, stored.state, profile, compliance) });
};

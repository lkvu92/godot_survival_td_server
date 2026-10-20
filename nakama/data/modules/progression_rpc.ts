// Persistent progression is server-owned. In-run XP remains entirely client/runtime state.
const PROGRESSION_VERSION = 2;
const PROGRESSION_MAX_LEVEL = 50;
const PROGRESSION_HERO_BASE_EXP = 1000;
const PROGRESSION_GROWTH = 1.25;
const PROGRESSION_USER_RATIO = 5;

const CULTIVATION_MAX_ATTEMPTS = 3;
const CULTIVATION_ELEMENTS = ["metal", "wood", "water", "fire", "earth"];
const CULTIVATION_TIERS: any[] = [
    { id: "thai_co", weight: 1, score_min: 90, score_max: 100, main_min: 0.8, main_max: 0.95, base_waves: 7 },
    { id: "cuc_pham", weight: 5, score_min: 80, score_max: 90, main_min: 0.6, main_max: 0.8, base_waves: 6 },
    { id: "thien_linh_can", weight: 10, score_min: 70, score_max: 80, main_min: 0.5, main_max: 0.7, base_waves: 5 },
    { id: "thuong_pham", weight: 15, score_min: 60, score_max: 70, main_min: 0.4, main_max: 0.6, base_waves: 4 },
    { id: "trung_pham", weight: 20, score_min: 50, score_max: 60, main_min: 0.3, main_max: 0.5, base_waves: 3 },
    { id: "ha_pham", weight: 49, score_min: 10, score_max: 50, main_min: 0.2, main_max: 0.4, base_waves: 2 },
];

function cultivationConfig(): any {
    return {
        max_attempts: CULTIVATION_MAX_ATTEMPTS, penalty_exp_percent: 0.3,
        element_cap: 400, reward_base: 5, reward_main_bonus: 2.5,
        reward_secondary_variance: 0.5, reward_main_variance: 1.0, reward_multiplier_min: 0.8,
        reward_multiplier_max: 1.2, performance_weight: 0.2,
        failure_penalty: 0.05, luck_min: -0.1, luck_max: 0.1,
        elements: CULTIVATION_ELEMENTS, tiers: CULTIVATION_TIERS,
        wave_delta: [
            { delta: 0, weight: 70 }, { delta: -1, weight: 15 },
            { delta: 1, weight: 10 }, { delta: 2, weight: 5 },
        ],
    };
}

function cultivationRound1(value: number): number { return Math.round(value * 10) / 10; }

// Independent permanent sources: reroll may replace innate/growth, never earned bonuses.
function cultivationEnsureSources(profile: any): void {
    if (profile.element_sources && profile.element_sources.version === 1) return;
    const current = profile.element_affinities || {};
    const tribulation: any = {}, fruit: any = {}, base: any = {}, growth: any = {};
    const history = (profile.breakthrough || {}).history || [];
    const unclassifiedHistory = history.some((row: any) => !row.gains && !(row.reward || {}).gains);
    CULTIVATION_ELEMENTS.forEach(id => {
        tribulation[id] = cultivationRound1(history.reduce((sum: number, row: any) => sum + Math.max(0, Number((row.gains || (row.reward || {}).gains || {})[id] || 0)), 0));
        tribulation[id] = Math.min(Math.max(0, Number(current[id] || 0)), tribulation[id]);
    });
    const remaining = CULTIVATION_ELEMENTS.reduce((sum, id) => sum + Math.max(0, Number(current[id] || 0) - tribulation[id]), 0);
    // Old histories stored wave counts only. Their rewards cannot be recovered:
    // conservatively retain all unclassified points rather than erase an earned bonus.
    const ratio = unclassifiedHistory ? 0 : (remaining > 0 ? Math.min(1, Math.max(0, Number(profile.talent_score || remaining)) / remaining) : 1);
    CULTIVATION_ELEMENTS.forEach(id => {
        const value = Math.max(0, Number(current[id] || 0) - tribulation[id]);
        base[id] = cultivationRound1(value * ratio);
        fruit[id] = cultivationRound1(value - base[id]); // Preserve unclassified legacy permanent gains.
        growth[id] = 0;
    });
    profile.element_sources = {version: 1, base, growth_per_level: growth, growth_levels: Number(profile.level || 1), tribulation, fruit};
}

function cultivationRebuildSources(profile: any): void {
    const sources = profile.element_sources;
    const totals: any = {};
    CULTIVATION_ELEMENTS.forEach(id => {
        totals[id] = cultivationRound1(Math.max(0, Number(sources.base[id] || 0)
            + Number(sources.growth_per_level[id] || 0) * Number(sources.growth_levels || 0)
            + Number(sources.tribulation[id] || 0) + Number(sources.fruit[id] || 0)));
    });
    profile.element_affinities = totals;
}

function cultivationApplyReroll(profile: any, rolled: any, config: any): void {
    cultivationEnsureSources(profile);
    const sources = profile.element_sources;
    sources.base = rolled.element_affinities;
    sources.growth_levels = Number(profile.level || 1);
    CULTIVATION_ELEMENTS.forEach(id => {
        sources.growth_per_level[id] = Number(id === rolled.main_element ? config.main_growth : config.secondary_growth);
    });
    profile.talent_tier = rolled.talent_tier;
    profile.talent_score = rolled.talent_score;
    profile.main_element = rolled.main_element;
    cultivationRebuildSources(profile);
}
function isBreakthroughMilestone(level: number): boolean { return level < PROGRESSION_MAX_LEVEL && level % 10 === 9; }

function cultivationSplit(mainElement: string, mainPct: number): any {
    const result: any = {}; result[mainElement] = mainPct;
    let open = CULTIVATION_ELEMENTS.filter((id: string) => id !== mainElement);
    const cap = Math.min(0.25, mainPct);
    let remaining = 1 - mainPct;
    while (remaining > 0.00001 && open.length > 0) {
        const weights: any = {}; let totalWeight = 0;
        open.forEach((id: string) => { weights[id] = 0.01 + Math.random() * 0.99; totalWeight += weights[id]; });
        let distributed = 0; const nextOpen: string[] = [];
        open.forEach((id: string) => {
            const available = cap - Number(result[id] || 0);
            const applied = Math.min(available, remaining * weights[id] / totalWeight);
            result[id] = Number(result[id] || 0) + applied;
            distributed += applied;
            if (available - applied > 0.00001) nextOpen.push(id);
        });
        remaining -= distributed; open = nextOpen;
    }
    return result;
}

function cultivationRollProfile(): any {
    const roll = Math.floor(Math.random() * 100) + 1;
    let cursor = 0; let tier = CULTIVATION_TIERS[CULTIVATION_TIERS.length - 1];
    for (let i = 0; i < CULTIVATION_TIERS.length; i++) {
        cursor += CULTIVATION_TIERS[i].weight;
        if (roll <= cursor) { tier = CULTIVATION_TIERS[i]; break; }
    }
    const score = cultivationRound1(tier.score_min + Math.random() * (tier.score_max - tier.score_min));
    const mainElement = CULTIVATION_ELEMENTS[Math.floor(Math.random() * CULTIVATION_ELEMENTS.length)];
    const u = Math.random();
    const mainPct = tier.main_min + (tier.main_max - tier.main_min) * u * u;
    const percentages = cultivationSplit(mainElement, mainPct);
    const affinities: any = {}; let sum = 0;
    CULTIVATION_ELEMENTS.forEach((id: string) => { affinities[id] = cultivationRound1(score * Number(percentages[id] || 0)); sum += affinities[id]; });
    affinities[mainElement] = cultivationRound1(affinities[mainElement] + score - cultivationRound1(sum));
    CULTIVATION_ELEMENTS.forEach((id: string) => {
        if (id === mainElement || Number(affinities[id] || 0) <= Number(affinities[mainElement] || 0)) return;
        const transfer = cultivationRound1((Number(affinities[id]) - Number(affinities[mainElement]) + 0.1) * 0.5);
        affinities[id] = cultivationRound1(Number(affinities[id]) - transfer);
        affinities[mainElement] = cultivationRound1(Number(affinities[mainElement]) + transfer);
    });
    return { talent_tier: tier.id, talent_score: score, main_element: mainElement, element_affinities: affinities };
}

function cultivationDefaultBreakthrough(history?: any[]): any {
	return { milestone_level: 0, attempts_left: CULTIVATION_MAX_ATTEMPTS, tribulation_count: 0,
		count_rolled: false, in_tribulation: false, failures: 0,
		ruleset_version: 1, encounter_id: "", encounter_seed: 0, skill_set: [], started_at: 0,
		history: Array.isArray(history) ? history : [] };
}

function cultivationPhase2Encounter(state: any): void {
	const waveCount = Math.max(1, Math.min(9, Number(state.tribulation_count || 1)));
	const skills = ["loi_tru"];
	if (waveCount >= 2) skills.push("loi_vong");
	if (waveCount >= 3) skills.push("loi_vuc");
	if (waveCount >= 5) skills.push("thien_phat");
	state.ruleset_version = 2;
	state.encounter_id = `${Date.now()}-${Math.floor(Math.random() * 1000000000)}`;
	state.encounter_seed = Math.floor(Math.random() * 2147483647);
	state.skill_set = skills;
	state.started_at = Date.now();
}

// Returns true when migration or interrupted-run recovery changed the profile.
function cultivationEnsureProfile(nk: nkruntime.Nakama, profile: any, recoverInterrupted: boolean): boolean {
    let changed = false;
    const required = ["talent_tier", "talent_score", "main_element", "element_affinities"];
    if (required.some((key: string) => profile[key] === undefined || profile[key] === null)) {
        const rolled = cultivationRollProfile();
        // A partial legacy object must not be rerolled on each load. Fill only
        // absent fields, then persist the completed authoritative snapshot.
        required.forEach((key: string) => { if (profile[key] === undefined || profile[key] === null) profile[key] = rolled[key]; });
        changed = true;
    }
    if (!Array.isArray(profile.affinity_flags)) { profile.affinity_flags = []; changed = true; }
    if (!Number.isFinite(Number(profile.comprehension_points))) { profile.comprehension_points = 0; changed = true; }
    if (!Array.isArray(profile.unlocked_laws)) { profile.unlocked_laws = []; changed = true; }
    if (!profile.breakthrough || typeof profile.breakthrough !== "object" || Array.isArray(profile.breakthrough)) {
        profile.breakthrough = cultivationDefaultBreakthrough(); changed = true;
    }
    const state = profile.breakthrough;
    const history = Array.isArray(state.history) ? state.history : [];
    const defaults = cultivationDefaultBreakthrough(history);
    Object.keys(defaults).forEach((key: string) => { if (state[key] === undefined) { state[key] = defaults[key]; changed = true; } });
    state.attempts_left = Math.max(0, Math.min(CULTIVATION_MAX_ATTEMPTS, Math.floor(Number(state.attempts_left))));
    state.tribulation_count = Math.max(0, Math.min(9, Math.floor(Number(state.tribulation_count))));
    state.failures = Math.max(0, Math.floor(Number(state.failures)));
    if (recoverInterrupted && state.in_tribulation === true) {
        state.in_tribulation = false;
        state.failures += 1;
        state.attempts_left = Math.max(0, state.attempts_left - 1);
        if (state.attempts_left <= 0) {
            const threshold = progressionNextUserExp(nk, Math.max(1, Number(profile.level || 1)));
            profile.exp = Math.max(0, Number(profile.exp || 0) - Math.round(threshold * 0.3));
            state.attempts_left = CULTIVATION_MAX_ATTEMPTS;
            state.penalty_applied = true;
        }
        changed = true;
    }
    return changed;
}

function cultivationRollWaves(profile: any): number {
    const state = profile.breakthrough || cultivationDefaultBreakthrough();
    const history = Array.isArray(state.history) ? state.history : [];
    if (history.length === 0) {
        const tier = CULTIVATION_TIERS.filter((item: any) => item.id === String(profile.talent_tier || ""))[0];
        return Math.max(1, Math.min(9, Number(tier ? tier.base_waves : 2)));
    }
    const previous = Math.max(1, Math.min(9, Number(history[history.length - 1].waves || 1)));
    const roll = Math.floor(Math.random() * 100) + 1; let cursor = 0; let delta = 0;
    const options = cultivationConfig().wave_delta;
    for (let i = 0; i < options.length; i++) { cursor += options[i].weight; if (roll <= cursor) { delta = options[i].delta; break; } }
    return Math.max(1, Math.min(9, previous + delta));
}

function cultivationEnsurePreview(nk: nkruntime.Nakama, profile: any): boolean {
    const level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    const threshold = progressionNextUserExp(nk, level);
    if (!isBreakthroughMilestone(level) || threshold <= 0 || Number(profile.exp || 0) < threshold) return false;
    let state = profile.breakthrough || cultivationDefaultBreakthrough();
    let changed = false;
    if (Number(state.milestone_level || 0) !== level) {
        state = cultivationDefaultBreakthrough(state.history); state.milestone_level = level; changed = true;
    }
    if (state.count_rolled !== true) {
        profile.breakthrough = state;
        state.tribulation_count = cultivationRollWaves(profile); state.count_rolled = true; changed = true;
    }
    profile.breakthrough = state;
    return changed;
}

function cultivationReward(profile: any, waves: number, failures: number, hpRatio: number): any {
    cultivationEnsureSources(profile);
    const config = cultivationConfig();
    let multiplier = 1 + (Math.max(0, Math.min(1, hpRatio)) - 0.5) * config.performance_weight;
    multiplier -= failures * config.failure_penalty;
    multiplier += config.luck_min + Math.random() * (config.luck_max - config.luck_min);
    multiplier = Math.max(config.reward_multiplier_min, Math.min(config.reward_multiplier_max, multiplier));
    const gains: any = {}; const affinities = profile.element_affinities || {};
    CULTIVATION_ELEMENTS.forEach((id: string) => {
        let base = config.reward_base;
        if (id === profile.main_element) {
            base += config.reward_main_bonus + Math.max(0, waves - 5);
            base += -config.reward_main_variance + Math.random() * (config.reward_main_variance * 2);
        } else {
            base += -config.reward_secondary_variance + Math.random() * (config.reward_secondary_variance * 2);
        }
        const requested = cultivationRound1(base * multiplier);
        const before = Math.max(0, Number(affinities[id] || 0));
        const after = before + Math.max(0, Math.min(config.element_cap - before, requested));
        affinities[id] = cultivationRound1(after);
        gains[id] = cultivationRound1(after - before);
        profile.element_sources.tribulation[id] = cultivationRound1(Number(profile.element_sources.tribulation[id] || 0) + gains[id]);
    });
    profile.element_affinities = affinities;
    return { multiplier: Math.round(multiplier * 100) / 100, gains };
}

function progressionObject(value: any): any {
    const parsed = parseJsonb(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function progressionNextHeroExp(nk: nkruntime.Nakama, level: number): number {
    if (level >= PROGRESSION_MAX_LEVEL) return 0;
    // Remote config is a cumulative EXP table: [level 0 total, level 1 total,
    // ...]. Convert it to the amount required for the current level. Keeping
    // the former curve as a fallback makes old/invalid releases safe.
    const configured: any = getRemoteConfigValue(nk, "game_play", "exp_to_level", []);
    if (Array.isArray(configured) && configured.length > level) {
        const currentTotal = Number(configured[level - 1]);
        const nextTotal = Number(configured[level]);
        if (Number.isFinite(currentTotal) && Number.isFinite(nextTotal) && nextTotal > currentTotal) {
            return Math.max(1, Math.floor(nextTotal - currentTotal));
        }
    }
    let required = PROGRESSION_HERO_BASE_EXP;
    for (let current = 1; current < level; current++) required = Math.max(1, Math.round(required * PROGRESSION_GROWTH));
    return required;
}

function progressionNextUserExp(nk: nkruntime.Nakama, level: number): number {
    return progressionNextHeroExp(nk, level) * PROGRESSION_USER_RATIO;
}

function progressionApplyUser(nk: nkruntime.Nakama, profile: any, awarded: number): any {
    cultivationEnsureSources(profile);
    let level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    let exp = Math.max(0, Number(profile.exp || 0)) + awarded;
    let next = progressionNextUserExp(nk, level);
    let gained = 0;
    while (level < PROGRESSION_MAX_LEVEL && next > 0 && exp >= next) {
        if (isBreakthroughMilestone(level)) { exp = next; break; }
        exp -= next;
        level++;
        gained++;
        next = progressionNextUserExp(nk, level);
    }
    if (level >= PROGRESSION_MAX_LEVEL) { exp = 0; next = 0; }
    profile.level = level;
    profile.element_sources.growth_levels = level;
    cultivationRebuildSources(profile);
    profile.exp = exp;
    profile.next_level_exp = next;
    profile.progression_version = PROGRESSION_VERSION;
    return { level, exp, next_level_exp: next, levels_gained: gained };
}

function progressionReconcileLevelUnlocks(nk: nkruntime.Nakama, profile: any): void {
    const level = Number(profile.level || 1);
    const arcs = nk.sqlQuery("SELECT id FROM game_arcs WHERE level_min <= $1 ORDER BY sort_order", [level]);
    const unlockedArcs: string[] = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
    const unlockedStages: any[] = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
    for (let i = 0; i < arcs.length; i++) {
        const arcId = String(arcs[i].id || "");
        if (arcId && unlockedArcs.indexOf(arcId) === -1) unlockedArcs.push(arcId);
        const stages = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [arcId]);
        const stageId = stages.length > 0 ? String(stages[0].id || "") : "";
        if (stageId && !unlockedStages.some((entry: any) => entry && String(entry.stage_id || entry) === stageId)) {
            unlockedStages.push({ stage_id: stageId, unlocked_levels: ["normal"] });
        }
    }
    profile.unlocked_arcs = unlockedArcs;
    profile.unlocked_stages = unlockedStages;
}

function progressionCompleteStage(nk: nkruntime.Nakama, profile: any, stageId: string, levelId: string): void {
    const completed: any[] = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
    if (!completed.some((entry: any) => entry && String(entry.stage_id) === stageId && String(entry.level_id) === levelId)) {
        completed.push({ stage_id: stageId, level_id: levelId });
    }
    profile.completed_stage_levels = completed;
    const unlockedStages: any[] = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
    let current = unlockedStages.find((entry: any) => entry && String(entry.stage_id || entry) === stageId);
    if (!current || typeof current !== "object") {
        current = { stage_id: stageId, unlocked_levels: ["normal"] }; unlockedStages.push(current);
    }
    if (!Array.isArray(current.unlocked_levels)) current.unlocked_levels = ["normal"];
    const levels = nk.sqlQuery("SELECT level_id FROM game_stage_levels WHERE stage_id = $1 ORDER BY sort_order", [stageId]);
    const index = levels.findIndex((entry: any) => String(entry.level_id) === levelId);
    if (index >= 0 && index + 1 < levels.length) {
        const nextLevel = String(levels[index + 1].level_id || "");
        if (nextLevel && current.unlocked_levels.indexOf(nextLevel) === -1) current.unlocked_levels.push(nextLevel);
    }
    // Campaign normal clear unlocks the next stage in the same arc.
    if (levelId === "normal") {
        const stageRows = nk.sqlQuery("SELECT arc_id, sort_order FROM game_stages WHERE id = $1", [stageId]);
        if (stageRows.length > 0) {
            const nextRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 AND sort_order > $2 ORDER BY sort_order LIMIT 1",
                [stageRows[0].arc_id, stageRows[0].sort_order]);
            if (nextRows.length > 0) {
                const nextStage = String(nextRows[0].id || "");
                if (nextStage && !unlockedStages.some((entry: any) => entry && String(entry.stage_id || entry) === nextStage)) {
                    unlockedStages.push({ stage_id: nextStage, unlocked_levels: ["normal"] });
                }
            } else {
                // The final normal clear in an arc unlocks the following arc
                // and its first stage. Previously this branch did nothing,
                // leaving the client UI ahead of the server-authoritative
                // profile and causing `Stage level is locked` on start.
                const arcRows = nk.sqlQuery("SELECT sort_order FROM game_arcs WHERE id = $1", [stageRows[0].arc_id]);
                if (arcRows.length > 0) {
                    const nextArcRows = nk.sqlQuery("SELECT id FROM game_arcs WHERE sort_order > $1 ORDER BY sort_order LIMIT 1", [arcRows[0].sort_order]);
                    if (nextArcRows.length > 0) {
                        const nextArcId = String(nextArcRows[0].id || "");
                        const unlockedArcs: string[] = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
                        if (nextArcId && unlockedArcs.indexOf(nextArcId) === -1) unlockedArcs.push(nextArcId);
                        profile.unlocked_arcs = unlockedArcs;
                        const firstStageRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [nextArcId]);
                        const firstStageId = firstStageRows.length > 0 ? String(firstStageRows[0].id || "") : "";
                        if (firstStageId && !unlockedStages.some((entry: any) => entry && String(entry.stage_id || entry) === firstStageId)) {
                            unlockedStages.push({ stage_id: firstStageId, unlocked_levels: ["normal"] });
                        }
                    }
                }
            }
        }
    }
    profile.unlocked_stages = unlockedStages;
}

// Repair profiles earned before cross-arc unlocks were persisted. This is
// called by start_stage so a player never has to replay the previous boss.
function progressionReconcileCampaignUnlocks(nk: nkruntime.Nakama, profile: any): boolean {
    const completed: any[] = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
    const unlockedStages: any[] = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
    const unlockedArcs: string[] = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
    let changed = false;
    for (const entry of completed) {
        if (!entry || String(entry.level_id || "") !== "normal") continue;
        const stageId = String(entry.stage_id || "");
        const stageRows = nk.sqlQuery("SELECT arc_id, sort_order FROM game_stages WHERE id = $1", [stageId]);
        if (stageRows.length === 0) continue;
        const nextRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 AND sort_order > $2 ORDER BY sort_order LIMIT 1", [stageRows[0].arc_id, stageRows[0].sort_order]);
        if (nextRows.length > 0) continue;
        const arcRows = nk.sqlQuery("SELECT sort_order FROM game_arcs WHERE id = $1", [stageRows[0].arc_id]);
        if (arcRows.length === 0) continue;
        const nextArcRows = nk.sqlQuery("SELECT id FROM game_arcs WHERE sort_order > $1 ORDER BY sort_order LIMIT 1", [arcRows[0].sort_order]);
        if (nextArcRows.length === 0) continue;
        const nextArcId = String(nextArcRows[0].id || "");
        if (nextArcId && unlockedArcs.indexOf(nextArcId) === -1) {
            unlockedArcs.push(nextArcId);
            changed = true;
        }
        const firstStageRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [nextArcId]);
        const firstStageId = firstStageRows.length > 0 ? String(firstStageRows[0].id || "") : "";
        if (firstStageId && !unlockedStages.some((value: any) => value && String(value.stage_id || value) === firstStageId)) {
            unlockedStages.push({ stage_id: firstStageId, unlocked_levels: ["normal"] });
            changed = true;
        }
    }
    profile.unlocked_arcs = unlockedArcs;
    profile.unlocked_stages = unlockedStages;
    return changed;
}

function progressionMigrate(nk: nkruntime.Nakama, profile: any, heroes: any[]): void {
    if (Number(profile.progression_version || 1) >= PROGRESSION_VERSION) return;
    let highest = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    for (let i = 0; i < heroes.length; i++) {
        const hero = heroes[i] || {};
        hero.level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
        hero.exp = Math.max(0, Number(hero.exp || 0)) * 10;
        hero.next_level_exp = progressionNextHeroExp(nk, hero.level);
        highest = Math.max(highest, hero.level);
    }
    // Legacy accounts had no account XP. Preserve earned hero levels rather than downgrading them.
    profile.level = highest;
    profile.exp = 0;
    profile.next_level_exp = progressionNextUserExp(nk, highest);
    profile.progression_version = PROGRESSION_VERSION;
}

function progressionMaxStageBaseExp(nk: nkruntime.Nakama, stageId: string): number {
    const waves = nk.sqlQuery("SELECT entries FROM game_stage_waves WHERE stage_id = $1", [stageId]);
    let total = 0;
    for (let i = 0; i < waves.length; i++) {
        const entries = parseJsonb(waves[i].entries);
        if (!Array.isArray(entries)) continue;
        for (let j = 0; j < entries.length; j++) {
            const entry = entries[j] || {};
            const enemyId = String(entry.enemy_id || "");
            const enemyRows = nk.sqlQuery("SELECT exp FROM game_enemies WHERE id = $1", [enemyId]);
            if (enemyRows.length === 0) continue;
            const modifiers = progressionObject(entry.modifiers);
            const exp = Math.max(0, Number(modifiers.exp !== undefined ? modifiers.exp : enemyRows[0].exp || 0));
            total += Math.max(0, Number(entry.count || 0)) * exp;
        }
    }
    return Math.floor(total);
}

function progressionHeroAttributes(nk: nkruntime.Nakama, heroId: string, level: number): any {
    const rows = nk.sqlQuery("SELECT attributes, level_up_stats FROM game_heroes WHERE id = $1", [heroId]);
    if (rows.length === 0) return {};
    const attributes = progressionObject(rows[0].attributes);
    const levelUp = progressionObject(rows[0].level_up_stats);
    const multiplicative: any = { hp: true, atk: true, def: true, move_speed: true, attack_speed: true, attack_range: true };
    for (let i = 1; i < level; i++) {
        Object.keys(levelUp).forEach((key: string) => {
            const value = Number(levelUp[key] || 0);
            attributes[key] = multiplicative[key] ? Number(attributes[key] || 0) * value : Number(attributes[key] || 0) + value;
        });
        attributes.crit_rate = Math.max(0, Math.min(1, Number(attributes.crit_rate || 0)));
        attributes.crit_damage = Math.max(1, Math.min(10, Number(attributes.crit_damage || 1)));
        attributes.regen_percent_per_10s = Math.max(0, Math.min(0.1, Number(attributes.regen_percent_per_10s || 0)));
        attributes.def = Math.max(0, Number(attributes.def || 0));
    }
    return attributes;
}

const awardStageProgression: nkruntime.RpcFunction = (
    ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string
): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); } catch (_) { return JSON.stringify({ success: false, message: "Invalid JSON" }); }
    const stageId = String(req.stage_id || "");
    const difficultyId = String(req.difficulty_id || "");
    const heroId = String(req.hero_id || "");
    const runId = String(req.run_id || "").slice(0, 128);
    const won = req.won === true;
    if(won&&(!Number.isFinite(req.objective_hp_ratio)||req.objective_hp_ratio<0||req.objective_hp_ratio>1))return JSON.stringify({success:false,code:'INVALID_OBJECTIVE_HP',message:'Invalid objective HP report'});
    const killedEnemies = Math.max(0, Math.floor(Number(req.killed_enemies || 0)));
    const requestedBaseExp = Number(req.base_exp || 0);
    if (!stageId || !difficultyId || !heroId || !runId || !Number.isSafeInteger(requestedBaseExp) || requestedBaseExp < 0
        || !Number.isSafeInteger(killedEnemies) || killedEnemies > 10000) {
        return JSON.stringify({ success: false, message: "Invalid stage progression request" });
    }

    const stored = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
		{ collection: "player_heroes", key: "states", userId: ctx.userId },
		{ collection: "player_inventory", key: "items", userId: ctx.userId },
		{ collection: "player_stage_runs", key: "active", userId: ctx.userId }
    ]);
    let profileObject: nkruntime.StorageObject | null = null;
    let heroesObject: nkruntime.StorageObject | null = null;
	let inventoryObject: nkruntime.StorageObject | null = null;
	let runObject: nkruntime.StorageObject | null = null;
    for (let i = 0; i < stored.length; i++) {
        if (stored[i].collection === "player_profiles") profileObject = stored[i];
        if (stored[i].collection === "player_heroes") heroesObject = stored[i];
		if (stored[i].collection === "player_inventory") inventoryObject = stored[i];
		if (stored[i].collection === "player_stage_runs") runObject = stored[i];
    }
	if (!profileObject || !heroesObject || !inventoryObject || !runObject) {
		return JSON.stringify({ success: false, message: "Player run state is incomplete" });
	}
	const run = progressionObject(runObject.value);
	if (String(run.run_id || "") !== runId || String(run.status || "") !== "active"
		|| String(run.stage_id || "") !== stageId || String(run.difficulty_id || "") !== difficultyId
		|| Date.now() > Number(run.expires_at_ms || 0)) {
		return JSON.stringify({ success: false, message: "Run validation failed" });
	}
	if (won && Date.now() - Number(run.started_at_ms || 0) < Math.max(0, Number(run.min_win_duration_ms || 0))) {
		return JSON.stringify({ success: false, message: "Victory reported before the server minimum run duration" });
	}

    const stageRows = nk.sqlQuery("SELECT exp_weight, is_boss, arc_id FROM game_stages WHERE id = $1", [stageId]);
	const difficultyRows = nk.sqlQuery("SELECT exp_multiplier, gold_reward, loot_table, boss_loot_table FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2", [stageId, difficultyId]);
    if (stageRows.length === 0 || difficultyRows.length === 0) return JSON.stringify({ success: false, message: "Unknown stage or difficulty" });
    const maxBaseExp = progressionMaxStageBaseExp(nk, stageId);
    if (requestedBaseExp > maxBaseExp) return JSON.stringify({ success: false, message: "Invalid stage EXP" });

    const profile = progressionObject(profileObject.value);
    const grade = sweepGrade(nk, Number(req.objective_hp_ratio), won);
    if(won) sweepSetBest(profile,stageId,difficultyId,grade);
    delete profile.activity;
    const heroesData = progressionObject(heroesObject.value);
    const heroes: any[] = Array.isArray(heroesData.heroes) ? heroesData.heroes : [];
	const inventoryValue = progressionObject(inventoryObject.value);
	const inventoryItems: any[] = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
    progressionMigrate(nk, profile, heroes);
    cultivationEnsureProfile(nk, profile, false);
    const awardedRuns: string[] = Array.isArray(profile._progression_run_ids) ? profile._progression_run_ids : [];
    if (awardedRuns.indexOf(runId) !== -1) return JSON.stringify({ success: false, message: "Run already rewarded" });
    let hero: any = null;
    for (let i = 0; i < heroes.length; i++) if (heroes[i] && String(heroes[i].hero_id || "") === heroId) hero = heroes[i];
    if (!hero || hero.owned !== true) return JSON.stringify({ success: false, message: "Hero is not owned" });

    const multiplier = Math.max(0, Number(stageRows[0].exp_weight || 1)) * Math.max(0, Number(difficultyRows[0].exp_multiplier || 1));
    const completed: any[] = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
    const firstClear = won && !completed.some((entry: any) => entry
        && String(entry.stage_id) === stageId && String(entry.level_id) === difficultyId);
    // The skill-testing arena may grant temporary run levels, never persistent EXP.
    const isTrainingStage = stageId === "stage_0_1" || String(stageRows[0].arc_id || "") === "arc_0";
    const ordinaryExp = isTrainingStage ? 0 : Math.max(0, Math.round(requestedBaseExp * multiplier));
    const firstClearBonusExp = firstClear ? ordinaryExp : 0;
    const awardedExp = ordinaryExp + firstClearBonusExp;
    const userResult = progressionApplyUser(nk, profile, awardedExp);
	cultivationEnsurePreview(nk, profile);
	["talent_tier", "talent_score", "main_element", "element_affinities", "affinity_flags",
	 "comprehension_points", "unlocked_laws", "breakthrough"].forEach((key: string) => { userResult[key] = profile[key]; });
	progressionReconcileLevelUnlocks(nk, profile);
	if (won) progressionCompleteStage(nk, profile, stageId, difficultyId);
    let heroLevel = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
    let heroExp = Math.max(0, Number(hero.exp || 0)) + awardedExp;
    let heroNext = progressionNextHeroExp(nk, heroLevel);
    let heroLevelsGained = 0;
    const heroCap = Math.min(PROGRESSION_MAX_LEVEL, userResult.level);
    while (heroLevel < heroCap && heroNext > 0 && heroExp >= heroNext) {
        heroExp -= heroNext;
        heroLevel++;
        heroLevelsGained++;
        heroNext = progressionNextHeroExp(nk, heroLevel);
    }
    if (heroLevel >= PROGRESSION_MAX_LEVEL) { heroExp = 0; heroNext = 0; }
    hero.level = heroLevel;
    hero.exp = heroExp;
    hero.next_level_exp = heroNext;
	if (heroLevelsGained > 0) hero.current_attribute = progressionHeroAttributes(nk, heroId, heroLevel);
    awardedRuns.push(runId);
    profile._progression_run_ids = awardedRuns.slice(-100);

	// Durability settlement is derived from the server-issued run snapshot. The
	// client cannot choose the equipped item or the amount to subtract.
	let talismanDurability = 0;
	const snapshot = run.talisman && typeof run.talisman === "object" ? run.talisman : null;
	if (snapshot) {
		const equipped = inventoryItems.find((entry: any) => entry
			&& String(entry.instance_id || "") === String(snapshot.instance_id || "")
			&& String(entry.item_id || "") === String(snapshot.item_id || ""));
		if (equipped) {
			const config = talismanConfig(nk);
			const custom = Math.max(0, Math.floor(Number(snapshot.durability_cost_per_battle || 0)));
			const fallback = won ? Number(config.default_durability_loss_win || 3) : Number(config.default_durability_loss_loss || 6);
			const durabilityLoss = custom > 0 ? (won ? custom : custom * 2) : Math.max(0, Math.floor(fallback));
			equipped.durability = Math.max(0, Number(equipped.durability === undefined ? 100 : equipped.durability) - durabilityLoss);
			talismanDurability = Number(equipped.durability || 0);
		}
	}

	const loot: any[] = [];
    if(won){
        const rewards=sweepRoll(sweepRewardTable(nk,stageId,difficultyId,stageRows[0],difficultyRows[0],grade));
        for(const reward of rewards){
            if(reward.item_id){
                if(!serverGrantInventoryItem(nk,inventoryItems,reward.item_id,reward.quantity))throw new Error('REWARD_ITEM_INVALID');
            }else if(reward.resource_id){
                profile.resources=progressionObject(profile.resources);
                profile.resources[reward.resource_id]=Number(profile.resources[reward.resource_id]||0)+reward.quantity;
            }
            loot.push({item_id:reward.item_id,resource_id:reward.resource_id,quantity:reward.quantity});
        }
    }
	inventoryValue.items = inventoryItems;
	run.status = "settled";
	run.settled_at_ms = Date.now();
	run.won = won;
	run.stage_reward = { eligible: won && !isTrainingStage && (awardedExp > 0 || loot.length > 0),
        hero_id: heroId, base_exp: awardedExp, first_clear_bonus_exp: firstClearBonusExp,
        base_loot: loot.slice(), claimed: false };
    if(won&&!isTrainingStage){
        const quantity=stageTicketQuantity(nk);
        if(quantity>0){if(!serverGrantInventoryItem(nk,inventoryItems,SWEEP_TICKET,quantity))throw new Error('SWEEP_TICKET_CONFIG_MISSING');loot.push({item_id:SWEEP_TICKET,quantity});}
    }

    nk.storageWrite([
        { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
		{ collection: "player_heroes", key: "states", userId: ctx.userId, value: { heroes }, permissionRead: 1, permissionWrite: 0, version: heroesObject.version },
		{ collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
		{ collection: "player_stage_runs", key: "active", userId: ctx.userId, value: run, permissionRead: 1, permissionWrite: 0, version: runObject.version }
    ]);
    if (won) {
        eventRecord(nk, ctx.userId, "stage_clear", 1, { stage_id: stageId, difficulty_id: difficultyId }, runId);
        eventRecord(nk, ctx.userId, "specific_stage_clear", 1, { stage_id: stageId, difficulty_id: difficultyId }, runId);
    }
    if (killedEnemies > 0) eventRecord(nk, ctx.userId, "enemy_kill", killedEnemies, { stage_id: stageId }, runId);
    eventRecord(nk, ctx.userId, "user_level_reached", Math.max(1, Number(profile.level || 1)), {}, runId);
    for (const reward of loot) {
        if (reward.item_id && Number(reward.quantity || 0) > 0) {
            eventRecord(nk, ctx.userId, "item_earned", Number(reward.quantity), { item_id: String(reward.item_id) }, `${runId}:${reward.item_id}`);
        }
    }
    if (typeof writePlayerLeaderboardRecords === "function") {
        try {
            writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
        } catch (_lbErr) { }
    }
    userResult.unlocked_arcs = profile.unlocked_arcs;
    userResult.unlocked_stages = profile.unlocked_stages;
    userResult.completed_stage_levels = profile.completed_stage_levels;
    userResult.stage_grades=profile.stage_grades;
	return JSON.stringify({ success: true, grade, best_grade:(profile.stage_grades||{})[stageId+':'+difficultyId]||'', stage_reward: stageRewardSummary(run), exp_awarded: awardedExp, first_clear: firstClear,
        first_clear_bonus_exp: firstClearBonusExp, profile: userResult,
		inventory: inventoryValue, resources: profile.resources, loot, talisman_durability: talismanDurability, hero: {

        hero_id: heroId, level: heroLevel, exp: heroExp, next_level_exp: heroNext, levels_gained: heroLevelsGained,
        current_attribute: hero.current_attribute || {}
    }});
};

function stageRewardSummary(run: any): any {
    const snapshot = run.stage_reward || {};
    const factor = snapshot.claimed === true ? Number(snapshot.multiplier || 1) : 1;
    return { run_id: String(run.run_id || ""), eligible: snapshot.eligible === true, claimed: snapshot.claimed === true,
        multiplier: factor, total_exp: Math.max(0, Number(snapshot.base_exp || 0)) * factor,
        first_clear_bonus_exp: Math.max(0, Number(snapshot.first_clear_bonus_exp || 0)) * factor,
        total_loot: (Array.isArray(snapshot.base_loot) ? snapshot.base_loot : []).map((r: any) => Object.assign({}, r, { quantity: Number(r.quantity) * factor })) };
}

function readSettledRewardRun(nk: nkruntime.Nakama, userId: string, runId: string): any {
    const rows = nk.storageRead([{collection: "player_stage_runs", key: "active", userId}]);
    if (!rows.length) return null;
    const run = rows[0].value;
    if (String(run.run_id || "") !== runId || run.status !== "settled" || run.won !== true
        || !run.stage_reward || run.stage_reward.eligible !== true) return null;
    return {object: rows[0], run};
}

function grantStageRewardMultiplier(nk: nkruntime.Nakama, userId: string, adSessionId: string, multiplier: number, limit: number): any {
    const sessions = nk.sqlQuery("SELECT context FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
    const context = sessions.length ? objectValue(parseJsonb(sessions[0].context)) : {};
    const stored = readSettledRewardRun(nk, userId, String(context.run_id || ""));
    if (!stored) return {granted: false, message: "Winning result is no longer available"};
    const run = stored.run, snapshot = run.stage_reward;
    if (snapshot.claimed) {
        if (snapshot.ad_session_id === adSessionId) return {granted: true, reward_type: "stage_reward_x2", stage_reward: stageRewardSummary(run)};
        // A different verified session lost the storage CAS race. It did not
        // grant rewards, so its reservation must not spend another daily use.
        nk.sqlExec("DELETE FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
        nk.sqlExec("UPDATE monetization_ad_rewards SET status='rejected' WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
        return {granted: false, message: "This victory already received its multiplier"};
    }
    if (!Number.isSafeInteger(multiplier) || multiplier < 2 || multiplier > 10 || limit <= 0) return {granted: false, message: "Reward multiplier config is disabled"};
    const rows = nk.storageRead([
        {collection: "player_profiles", key: "main", userId},
        {collection: "player_heroes", key: "states", userId},
        {collection: "player_inventory", key: "items", userId}
    ]);
    const p = rows.find((r: any) => r.collection === "player_profiles"), h = rows.find((r: any) => r.collection === "player_heroes"),
        inv = rows.find((r: any) => r.collection === "player_inventory");
    if (!p || !h || !inv) return {granted: false, message: "Player reward state missing"};
    const hero = (h.value.heroes || []).find((r: any) => String(r.hero_id) === snapshot.hero_id && r.owned === true);
    if (!hero) return {granted: false, message: "Reward hero is not owned"};
    const claim = reserveDailyRewardClaim(nk, userId, "stage_reward_x2_ad", adSessionId, limit);
    if (!claim) return {granted: false, message: "Daily victory reward quota reached"};
    const extraExp = Number(snapshot.base_exp) * (multiplier - 1);
    const profile = p.value;
    const userResult = progressionApplyUser(nk, profile, extraExp);
    cultivationEnsurePreview(nk, profile);
    progressionReconcileLevelUnlocks(nk, profile);
    let level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
    let exp = Math.max(0, Number(hero.exp || 0)) + extraExp;
    let next = progressionNextHeroExp(nk, level);
    const beforeLevel = level;
    while (level < Math.min(PROGRESSION_MAX_LEVEL, userResult.level) && next > 0 && exp >= next) {
        exp -= next; level++; next = progressionNextHeroExp(nk, level);
    }
    if (level >= PROGRESSION_MAX_LEVEL) { exp = 0; next = 0; }
    hero.level = level; hero.exp = exp; hero.next_level_exp = next;
    if (level > beforeLevel) hero.current_attribute = progressionHeroAttributes(nk, snapshot.hero_id, level);
    inv.value.items = Array.isArray(inv.value.items) ? inv.value.items : [];
    profile.resources = profile.resources || {};
    for (const reward of snapshot.base_loot) {
        const quantity = Number(reward.quantity) * (multiplier - 1);
        if (!Number.isSafeInteger(quantity) || quantity <= 0) throw Error("Invalid settled reward quantity");
        if (reward.item_id) addStoreInventoryItem(nk, inv.value.items, String(reward.item_id), quantity);
        else if (["gold", "gems"].indexOf(String(reward.resource_id)) >= 0) profile.resources[reward.resource_id] = Math.max(0, Number(profile.resources[reward.resource_id] || 0)) + quantity;
        else throw Error("Unknown settled reward");
    }
    snapshot.claimed = true; snapshot.multiplier = multiplier; snapshot.ad_session_id = adSessionId;
    nk.storageWrite([
        {collection: "player_profiles", key: "main", userId, value: profile, version: p.version, permissionRead: 1, permissionWrite: 0},
        {collection: "player_heroes", key: "states", userId, value: h.value, version: h.version, permissionRead: 1, permissionWrite: 0},
        {collection: "player_inventory", key: "items", userId, value: inv.value, version: inv.version, permissionRead: 1, permissionWrite: 0},
        {collection: "player_stage_runs", key: "active", userId, value: run, version: stored.object.version, permissionRead: 1, permissionWrite: 0}
    ]);
    return {granted: true, reward_type: "stage_reward_x2", reward_amount: multiplier, stage_reward: stageRewardSummary(run)};
}

const tribulationAction: nkruntime.RpcFunction = (
    ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string
): string => {
    let request: any = {};
    try { request = JSON.parse(payload || "{}"); } catch (_) { return JSON.stringify({ ok: false, message: "Invalid JSON" }); }
    const action = String(request.action || "");
    if (["start", "success", "fail"].indexOf(action) === -1) return JSON.stringify({ ok: false, message: "Invalid action" });
    const hpRatio = Number(request.hp_ratio || 0);
    if (!Number.isFinite(hpRatio) || hpRatio < 0 || hpRatio > 1) return JSON.stringify({ ok: false, message: "Invalid hp_ratio" });
	const encounterId = String(request.encounter_id || "");
	const durationMs = Math.floor(Number(request.duration_ms || 0));
	const wavesCleared = Math.floor(Number(request.waves_cleared || 0));
    const objects = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
    if (objects.length === 0) return JSON.stringify({ ok: false, message: "Player profile is missing" });
    const object = objects[0]; const profile = progressionObject(object.value);
    cultivationEnsureProfile(nk, profile, false);
    const level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    const threshold = progressionNextUserExp(nk, level);
    const ready = isBreakthroughMilestone(level) && threshold > 0 && Number(profile.exp || 0) >= threshold;
    let state = profile.breakthrough;

    if (action === "start") {
        const block=sweepCombatError(profile);if(block)return JSON.stringify(block);
        const runs=nk.storageRead([{collection:'player_stage_runs',key:'active',userId:ctx.userId}]);
        if(runs.length&&runs[0].value.status==='active'&&Number(runs[0].value.expires_at_ms)>Date.now())return JSON.stringify({ok:false,success:false,code:'COMBAT_ACTIVE',message:'Combat is active'});
        if (!ready) return JSON.stringify({ ok: false, message: "Breakthrough is not ready" });
        if (state.in_tribulation === true) return JSON.stringify({ ok: false, message: "Tribulation is already in progress" });
        if (Number(state.milestone_level || 0) !== level) state = cultivationDefaultBreakthrough(state.history);
        state.milestone_level = level;
        if (state.count_rolled !== true) { state.tribulation_count = cultivationRollWaves(profile); state.count_rolled = true; }
        if (Number(state.attempts_left || 0) <= 0) return JSON.stringify({ ok: false, message: "No attempts remaining" });
		cultivationPhase2Encounter(state);
        state.in_tribulation = true; state.penalty_applied = false; profile.breakthrough = state;
        profile.activity={type:'combat',activity_id:state.encounter_id};
        nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: object.version }]);
        return JSON.stringify({ ok: true, outcome_success: false, attempts_left: state.attempts_left,
			tribulation_count: state.tribulation_count, encounter: { id: state.encounter_id, seed: state.encounter_seed, ruleset_version: state.ruleset_version, skill_set: state.skill_set, server_started_at: state.started_at }, profile });
    }

    if (state.in_tribulation !== true || Number(state.milestone_level || 0) !== level || !ready) {
        return JSON.stringify({ ok: false, message: "No active tribulation" });
    }
	if (encounterId === "" || encounterId !== String(state.encounter_id || "")) return JSON.stringify({ ok: false, message: "Invalid encounter" });
	if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 3600000) return JSON.stringify({ ok: false, message: "Invalid encounter duration" });
	if (action === "success" && (wavesCleared < Number(state.tribulation_count || 1) || wavesCleared > Number(state.tribulation_count || 1))) return JSON.stringify({ ok: false, message: "Invalid waves cleared" });
    state.in_tribulation = false;
    delete profile.activity;
    if (action === "fail") {
        state.failures = Math.max(0, Number(state.failures || 0)) + 1;
        state.attempts_left = Math.max(0, Number(state.attempts_left || CULTIVATION_MAX_ATTEMPTS) - 1);
        let penaltyApplied = false;
        if (state.attempts_left <= 0) {
            profile.exp = Math.max(0, Number(profile.exp || 0) - Math.round(threshold * 0.3));
            state.attempts_left = CULTIVATION_MAX_ATTEMPTS; state.penalty_applied = true; penaltyApplied = true;
        }
        nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: object.version }]);
        return JSON.stringify({ ok: true, outcome_success: false, old_level: level, new_level: level,
            attempts_left: state.attempts_left, penalty_applied: penaltyApplied, profile });
    }

    const waves = Math.max(1, Math.min(9, Number(state.tribulation_count || 1)));
    const failures = Math.max(0, Number(state.failures || 0));
    cultivationEnsureSources(profile);
    profile.level = Math.min(PROGRESSION_MAX_LEVEL, level + 1);
    profile.element_sources.growth_levels = profile.level;
    cultivationRebuildSources(profile);
    profile.exp = Math.max(0, Number(profile.exp || 0) - threshold);
    profile.next_level_exp = progressionNextUserExp(nk, profile.level);
    profile.progression_version = PROGRESSION_VERSION;
    const reward = cultivationReward(profile, waves, failures, hpRatio);
    const history = Array.isArray(state.history) ? state.history : [];
    history.push({ level: profile.level, waves, failures, gains: reward.gains });
    profile.breakthrough = cultivationDefaultBreakthrough(history);
    progressionReconcileLevelUnlocks(nk, profile);
    nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
        permissionRead: 1, permissionWrite: 0, version: object.version }]);
    if (typeof writePlayerLeaderboardRecords === "function") {
        try {
            writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
        } catch (_lbErr) { }
    }
    return JSON.stringify({ ok: true, outcome_success: true, old_level: level, new_level: profile.level,
        attempts_left: CULTIVATION_MAX_ATTEMPTS, penalty_applied: false, reward, profile });
};

// C118: pure permanent-loadout projection. No storage writes or RNG.
function cpObject(value: any): any {
    if (typeof parseJsonb === "function") value = parseJsonb(value);
    if (typeof value === "string") { try { value = JSON.parse(value); } catch (_) { return {}; } }
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function cpArray(value: any): any[] {
    if (typeof parseJsonb === "function") value = parseJsonb(value);
    if (typeof value === "string") { try { value = JSON.parse(value); } catch (_) { return []; } }
    return Array.isArray(value) ? value : [];
}
function cpNumber(value: any, fallback: number = 0): number {
    const number = Number(value); return value === undefined || value === null || !isFinite(number) ? fallback : number;
}
function cpClamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }
function cpRound(value: number): number { return Math.floor(value + 0.5); }
function cpHeroAttributes(hero: any, level: number, progression: any): any {
    const result = JSON.parse(JSON.stringify(cpObject(hero.attributes)));
    const growth = cpObject(hero.level_up_stats);
    const cap = cpNumber(cpObject(progression.persistent_leveling).max_hero_level, 1);
    const multiplicative = ["hp", "atk", "def", "move_speed", "attack_speed", "attack_range"];
    for (let i = 1; i < cpClamp(Math.floor(level), 1, cap); i++) {
        for (const key of Object.keys(growth)) result[key] = multiplicative.indexOf(key) >= 0
            ? cpNumber(result[key]) * cpNumber(growth[key]) : cpNumber(result[key]) + cpNumber(growth[key]);
    }
    return result;
}
function cpAmplification(level: number, progression: any): number {
    level = cpClamp(Math.floor(level), 0, cpNumber(cpObject(progression.element_upgrade).max_level));
    for (const tier of cpArray(cpObject(progression.element_combat).level_amplification_tiers)) {
        if (level >= tier.level_min && level <= tier.level_max) return cpNumber(tier.base_pct) + (level-cpNumber(tier.base_level))*cpNumber(tier.per_level_pct);
    }
    return 0;
}
function cpDurability(item: any, cfg: any): number {
    const durability = cpClamp(cpNumber(item.durability, 100), 0, 100);
    for (const tier of cpArray(cfg.durability_tiers)) if (durability <= tier.max) return cpNumber(tier.factor);
    return 1;
}
function cpEquipped(inventory: any[], items: any[]): any[] {
    const result: any[] = [], seen: any = {};
    for (const item of inventory) {
        if (!item || item.is_equipped !== true || cpNumber(item.quantity, 1) <= 0) continue;
        const definition = items.find(def => def.id === item.item_id && def.category === "talisman");
        if (!definition) continue;
        const key = String(item.instance_id || item.item_id);
        if (seen[key]) continue;
        seen[key] = true;
        const attrs = cpObject(definition.attributes), stats: any = {};
        const source = cpObject(item.current_stats);
        if (Object.keys(source).length) Object.assign(stats, source);
        else {
            const rolled = cpObject(item.base_rolled_stats), base = Object.keys(rolled).length ? rolled : cpObject(attrs.base_stats);
            Object.assign(stats, base);
            const growth = cpObject(attrs.stat_growth);
            const level = cpClamp(Math.floor(cpNumber(item.level, 1)), 1, cpNumber(attrs.max_level, 30));
            for (const stat of Object.keys(growth)) stats[stat] = cpNumber(stats[stat]) + (level-1)*cpNumber(growth[stat]);
        }
        result.push(Object.assign({}, attrs, item, {stats, skill_id: String(attrs.skill_id || ""), element: String(attrs.element || "")}));
    }
    return result;
}
function cpApplyEquipment(attributes: any, equipped: any[], cfg: any, elementCfg: any): any {
    const result = Object.assign({}, attributes);
    for (const item of equipped) {
        const factor = cpDurability(item, cfg), s = item.stats;
        for (const stat of ["hp", "atk", "def", "spirit"]) result[stat] = cpNumber(result[stat]) + cpNumber(s[stat])*factor;
        result.attack_speed = (cpNumber(result.attack_speed) + (cpNumber(s.attack_speed)+cpNumber(s.spd))*factor)*(1+cpNumber(s.speed_pct)*factor*0.01);
        result.skill_cooldown_mul = Math.max(cpNumber(cfg.cooldown_multiplier_floor), cpNumber(result.skill_cooldown_mul,1)*(1-Math.max(0,cpNumber(s.cooldown_reduction_pct))*factor*0.01));
        result.dodge_rate = cpClamp(cpNumber(result.dodge_rate)+Math.max(0,cpNumber(s.dodge_rate))*factor,0,cpNumber(cfg.dodge_cap));
        result.element_resist_pct = cpClamp(cpNumber(result.element_resist_pct)+Math.max(0,cpNumber(s.element_resist_pct))*factor,0,cpNumber(elementCfg.talisman_resistance_cap_pct));
        result.attack_range = cpNumber(result.attack_range)*(1+Math.max(0,cpNumber(s.skill_range_bonus_pct))*factor*0.01);
    }
    return result;
}
function cpSkillData(id: string, level: number, skills: any[]): any {
    const skill = skills.find(s => s.id === id);
    if (!skill) return {};
    const levels = cpArray(skill.levels); if (!levels.length) return {};
    const entry = levels[cpClamp(Math.floor(level)-1,0,levels.length-1)];
    return Object.assign({},cpObject(entry.stats),cpObject(skill.cast_config),cpObject(entry.cast_config),{passive:skill.skill_class==="passive"});
}
function cpSkillCasts(stats: any, cooldownMul: number, cfg: any, item: any = null): number {
    const horizon = cpNumber(cfg.horizon_seconds);
    if (item && cpNumber(item.durability,100)<=0) return 0;
    if (stats.passive) return horizon/Math.max(cpNumber(cfg.minimum_cooldown),cpNumber(stats.contact_cooldown),cpNumber(stats.revolution_duration,1)/Math.max(1,cpNumber(stats.orb_count,1)));
    let casts = horizon/Math.max(cpNumber(cfg.minimum_cooldown),cpNumber(stats.cooldown,1)*cooldownMul);
    if (item) {
        casts = Math.min(casts,Math.max(0,cpNumber(item.max_battle_uses)));
        const cost = cpNumber(item.durability_cost_per_cast);
        if (cost>0) casts = Math.min(casts,Math.ceil(cpNumber(item.durability,100)/cost));
    }
    return casts;
}
function cpSkillDps(id: string, level: number, atk: number, crit: number, cooldownMul: number, skills: any[], cfg: any, item: any = null): number {
    const stats = cpSkillData(id,level,skills); if (!Object.keys(stats).length) return 0;
    const override = cpObject(cpObject(cfg.skill_overrides)[id]);
    let damage = 0;
    for (const key of Object.keys(cpObject(cfg.skill_hit_weights))) damage += Math.max(0,cpNumber(stats[key]))*cpNumber(cfg.skill_hit_weights[key]);
    if (stats.center_damage_pct!==undefined) damage=cpNumber(stats.center_damage_pct)*cpNumber(override.center_hit_weight,0.5)+cpNumber(stats.damage_per_slash_pct)*(1-cpNumber(override.center_hit_weight,0.5));
    if (stats.damage_min_pct!==undefined) damage=(cpNumber(stats.damage_min_pct)+cpNumber(stats.damage_max_pct))*0.5;
    if (Array.isArray(stats.damage_pct_by_shot)) damage=stats.damage_pct_by_shot.reduce((sum:number,v:any)=>sum+cpNumber(v),0);
    damage *= Math.max(1,cpNumber(stats.strike_count,1));
    damage *= cpNumber(override.damage_multiplier,1);
    const projectiles = override.projectile_base!==undefined ? cpNumber(override.projectile_base)+Math.floor((Math.max(1,level)-1)/Math.max(1,cpNumber(override.projectile_level_interval))) : Math.max(1,cpNumber(stats.projectile_count,1));
    damage *= 1+(projectiles-1)*cpNumber(override.projectile_factor,1);
    return atk*crit*damage*0.01*cpSkillCasts(stats,cooldownMul,cfg,item)/cpNumber(cfg.horizon_seconds);
}
function cpEvaluate(hero: any, level: number, affinities: any, roots: any, equipped: any[], skills: any[], progression: any): any {
    const cfg = progression.combat_power, ec = progression.element_combat;
    const a = cpApplyEquipment(cpHeroAttributes(hero,level,progression),equipped,cfg,ec);
    const crit = 1+cpClamp(cpNumber(a.crit_rate),0,1)*(cpClamp(cpNumber(a.crit_damage,1),1,cpNumber(cfg.crit_damage_cap))-1);
    const element = String(hero.element || ""), amp = cpAmplification(cpNumber(roots[element]),progression);
    const attackMultiplier = 1+Math.max(0,cpNumber(affinities[element]))*amp*0.0001;
    const atk = Math.max(0,cpNumber(a.atk));
    let dps = hero.auto_basic_attack === false ? 0 : atk*Math.max(0,cpNumber(a.attack_speed))*cpNumber(cfg.basic_damage_multiplier)*crit;
    for (const id of cpArray(hero.starting_skills)) dps += cpSkillDps(String(id),1,atk,crit,cpNumber(a.skill_cooldown_mul,1),skills,cfg);
    dps *= attackMultiplier;
    if (equipped.length) {
        const item = equipped[0];
        // Current runtime casts talisman damage using the hero combat element.
        dps += cpSkillDps(item.skill_id,cpNumber(item.level,1),atk,crit,cpNumber(a.skill_cooldown_mul,1),skills,cfg,item)*attackMultiplier;
    }
    let incoming = 0;
    const elements = cpArray(ec.supported_elements);
    for (const incomingElement of elements) {
        const resist = cpNumber(ec.affinity_resistance_ratio)*Math.max(0,cpNumber(affinities[incomingElement]))*(1+cpAmplification(cpNumber(roots[incomingElement]),progression)*0.01);
        const counter = cpNumber(cpObject(cpObject(ec.matchup_modifier_pct)[incomingElement])[element]);
        incoming += 1+Math.max(cpNumber(ec.modifier_floor_pct),counter-resist-cpNumber(a.element_resist_pct))*0.01;
    }
    incoming /= Math.max(1,elements.length);
    let defenseValue = Math.max(0,cpNumber(a.def)), healing = 0;
    if (equipped.length) {
        const item=equipped[0], stats=cpSkillData(item.skill_id,cpNumber(item.level,1),skills);
        const casts=cpSkillCasts(stats,cpNumber(a.skill_cooldown_mul,1),cfg,item);
        const uptime=Math.min(1,casts*cpNumber(stats.duration)/cpNumber(cfg.horizon_seconds));
        healing=casts*atk*cpNumber(stats.heal_atk_pct)*0.01;
        for (const effect of cpArray(stats.effects)) {
            defenseValue+=(cpNumber(a.def)*cpNumber(effect.defense_percent)+cpNumber(effect.defense_flat))*uptime;
            healing+=cpNumber(a.hp)*cpNumber(effect.hp_percent_per_sec)*cpNumber(stats.duration)*casts;
        }
    }
    // Mirror the Godot CombatFormulaService. Permanent talisman DEF must rate
    // survival using the exact same diminishing-return curve as live combat.
    const defense = 100/(100+defenseValue);
    const regen = cpClamp(cpNumber(a.regen_percent_per_10s),0,cpNumber(cfg.regen_cap));
    const hp = Math.max(0,cpNumber(a.hp))*(1+regen*cpNumber(cfg.horizon_seconds)/10)+healing;
    const ehp = hp/(Math.max(cpNumber(cfg.min_defense_multiplier),incoming)*defense*(1-cpClamp(cpNumber(a.dodge_rate),0,cpNumber(cfg.dodge_cap))));
    const offense = dps*cpNumber(cfg.offense_weight), survival = ehp*cpNumber(cfg.survival_weight);
    const utility = Math.max(0,cpNumber(a.move_speed))*cpNumber(cfg.movement_weight)+Math.max(0,cpNumber(a.attack_range))*cpNumber(cfg.range_weight);
    return {score:cpRound(offense+survival+utility),offense,survival,utility};
}
function calculateCombatPower(profile: any, states: any[], inventory: any[], heroes: any[], skills: any[], progression: any, items: any[]): any {
    const cfg = cpObject(progression.combat_power);
    const result: any = {version:cpNumber(cfg.version),configured:false,score:0,hero_id:"",heroes:[]};
    if (cfg.version!==2 || !(cfg.horizon_seconds>0) || !(cfg.offense_weight>0) || !(cfg.survival_weight>0)
        || !(cfg.min_defense_multiplier>0 && cfg.min_defense_multiplier<=1) || !(cfg.minimum_cooldown>0)
        || !(cfg.dodge_cap>=0 && cfg.dodge_cap<1) || !cpArray(cpObject(progression.element_combat).supported_elements).length) return result;
    result.configured = true;
    const equipped = cpEquipped(inventory,items), affinities = cpObject(profile.element_affinities), roots = cpObject(profile.elements);
    for (const hero of heroes) {
        const state = states.find(s => s && s.hero_id === hero.id);
        // Explicit false overrides free-hero fallback. Missing legacy states may use free starter heroes.
        const price = cpObject(hero.price), owned = state ? state.owned === true : cpNumber(price.gold) <= 0 && cpNumber(price.gems) <= 0;
        if (!owned) continue;
        const level = cpNumber(state && state.level,1);
        const base = cpEvaluate(hero,level,{}, {},[],skills,progression);
        const innate = cpEvaluate(hero,level,affinities,{},[],skills,progression);
        const root = cpEvaluate(hero,level,affinities,roots,[],skills,progression);
        const full = cpEvaluate(hero,level,affinities,roots,equipped,skills,progression);
        full.hero_id = hero.id;
        full.breakdown = {hero:base.score,talent:innate.score-base.score,roots:root.score-innate.score,talisman:full.score-root.score};
        result.heroes.push(full);
        if (!result.hero_id || full.score>result.score) {result.score=full.score;result.hero_id=hero.id;}
    }
    return result;
}
function readCombatPowerCatalog(nk: nkruntime.Nakama): any {
    const config = nk.sqlQuery("SELECT value FROM game_config WHERE key='progression'",[]);
    return {progression:config.length?cpObject(config[0].value):{},
        heroes:nk.sqlQuery("SELECT id, element, auto_basic_attack, price, attributes, level_up_stats, starting_skills FROM game_heroes ORDER BY id",[]),
        skills:nk.sqlQuery("SELECT id, levels, cast_config, skill_class FROM game_skills ORDER BY id",[]),
        items:nk.sqlQuery("SELECT id, category, attributes FROM game_items WHERE category='talisman' ORDER BY id",[])};
}
function readPlayerCombatPower(nk: nkruntime.Nakama, userId: string, profile: any, catalog: any): any {
    const stored = nk.storageRead([{collection:"player_heroes",key:"states",userId},{collection:"player_inventory",key:"items",userId}]);
    const hero = stored.find(s=>s.collection==="player_heroes"), inventory=stored.find(s=>s.collection==="player_inventory");
    const result = calculateCombatPower(profile,cpArray(hero&&hero.value&&hero.value.heroes),cpArray(inventory&&inventory.value&&inventory.value.items),catalog.heroes,catalog.skills,catalog.progression,catalog.items);
    if (!result.configured) throw Error("C118 combat power config missing; deploy progression.combat_power before syncing");
    return result;
}

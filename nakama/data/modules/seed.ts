// PostgreSQL dollar quoting avoids SQL injection and backslash/encoding ambiguity.
function seedSqlLiteral(value: any): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("Non-finite SQL value");
        return String(value);
    }
    const text = String(value);
    if (text.indexOf("\u0000") >= 0) throw new Error("NUL is not supported");
    let tag = "$seed$";
    while (text.indexOf(tag) >= 0) tag = tag.slice(0, -1) + "x$";
    return tag + text + tag;
}

function seedBindSql(sql: string, params: any[]): string {
    return sql.replace(/\$(\d+)/g, (_match, index) => {
        if (Number(index) > params.length) throw new Error("Missing SQL parameter");
        return seedSqlLiteral(params[Number(index) - 1]);
    });
}

function seedPgArray(values: string[]): string {
    return "{" + values.map(value => '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
}

// C239 native executor admission mirrors client validation; no runtime fallback.
function validNativeSkillPayload(skill:any, payload:any):boolean {
    const castTypes=["basic_attack", "beast_melee", "beast_dash", "beast_bolt", "tiger_claw", "tiger_pounce", "tiger_roar", "tiger_bloodline", "vermilion_volley", "vermilion_sweep", "vermilion_rain", "vermilion_domain", "ice_claw", "ice_pillar", "ice_bolt", "ice_trinity", "ice_linglong", "fire_claw", "fire_ball", "fire_stomp", "fire_meteor", "fire_formation", "wood_bolt", "wood_vine", "wood_swamp", "wood_soul", "metal_slash", "metal_bolt", "metal_punch", "metal_shatter", "metal_fist", "earth_punch", "earth_orb", "earth_stones", "earth_dragon", "wraith_volley", "wraith_binding", "wraith_calamity", "wraith_ultimate", "slam_aoe", "control_resistance_over_time"], traitIds=["haste", "damage_shield", "defense_aura", "max_hp_buff", "pierce_guard", "debuff_resistance", "defense_buff", "damage_reflect", "invincible", "beast_bloodline", "regeneration"];
    const validNumbers=(value:any):boolean=>{
        if(typeof value==="number")return Number.isFinite(value);
        if(Array.isArray(value))return value.every(validNumbers);
        if(value&&typeof value==="object")return Object.keys(value).every(key=>validNumbers(value[key])&&(!["radius","range","cooldown","warning_time","damage_multiplier"].includes(key)||typeof value[key]!=="number"||value[key]>=0));
        return true;
    };
    return !!payload&&typeof payload==="object"&&!Array.isArray(payload)&&!!(payload.id||payload.type)&&payload.element===skill.element&&validNumbers(payload)&&(skill.executor==="enemy_cast"?castTypes.indexOf(payload.type)>=0:skill.executor==="enemy_trait"&&traitIds.indexOf(payload.id)>=0&&!!payload.params&&typeof payload.params==="object"&&!Array.isArray(payload.params));
}

// C239: validate the opt-in catalog before accepting authoritative progression seed.
function validateEnemyFrameworkCatalog(value: any): string {
    const object = (v:any):boolean => !!v && typeof v === "object" && !Array.isArray(v);
    const nonnegative = (v:any):boolean => typeof v === "number" && Number.isFinite(v) && v >= 0;
    const elements = ["neutral","metal","water","wood","fire","earth"];
    if (!object(value) || value.version !== 2 || !Number.isInteger(value.max_level) || value.max_level < 1 || value.max_level > 10000) return "Invalid enemy framework version/level";
    if (!object(value.species) || !Object.keys(value.species).length || !object(value.skill_atlas) || !Object.keys(value.skill_atlas).length) return "Missing species/skill atlas";
    if (value.boss_element_baselines !== undefined) {
        if (!object(value.boss_element_baselines)) return "Invalid boss element baselines";
        for (const element of elements.filter(e=>e!=="neutral")) {
            const row = value.boss_element_baselines[element];
            if (!object(row) || ["hp","atk","def","attack_speed","move_speed"].some(stat=>!nonnegative(row[stat]) || row[stat] <= 0)) return "Invalid boss element baseline";
        }
    }
    for (const id of Object.keys(value.species)) {
        const row = value.species[id];
        if (row && row.balance_profile !== undefined && (row.balance_profile !== "element_boss" || !object(value.boss_element_baselines))) return "Invalid boss balance profile";
        if (!object(row) || ["element","elements","skills","learnable_skills","balance_reference_level"].some(key=>row[key] !== undefined)) return "Species cannot own elements or skill lists";
        if (typeof row.visual_definition_id !== "string" || !row.visual_definition_id || !object(row.base_attributes) || !object(row.growth_per_level) || !object(row.reward)) return "Invalid species definition";
        if (row.presentation_variants !== undefined && (!Array.isArray(row.presentation_variants) || row.presentation_variants.some((id:any)=>typeof id!=="string" || !id) || new Set(row.presentation_variants).size!==row.presentation_variants.length)) return "Invalid presentation variants";
        for (const stat of ["hp","atk","def","move_speed","attack_speed","attack_range"]) {
            if (!nonnegative(row.base_attributes[stat]) || (stat !== "def" && row.base_attributes[stat] <= 0) || !nonnegative(row.growth_per_level[stat])) return "Invalid species growth";
        }
        for (const stat of Object.keys(row.growth_per_level)) if (!nonnegative(row.growth_per_level[stat]) || !nonnegative(row.base_attributes[stat])) return "Invalid extra growth";
        for (const stat of Object.keys(row.base_attributes)) if (!nonnegative(row.base_attributes[stat])) return "Invalid base attribute";
        for (const key of ["exp","gold"]) if (!Number.isInteger(row.reward[key]) || row.reward[key] < 0) return "Invalid species reward";
    }
    for (const id of Object.keys(value.skill_atlas)) {
        const skill = value.skill_atlas[id], seen:{[key:string]:boolean}={};
        if (!object(skill) || skill.id !== id || elements.indexOf(skill.element) < 0 || ["direct","area","max_hp","native"].indexOf(skill.kind) < 0 || !Array.isArray(skill.levels) || !skill.levels.length) return "Invalid shared skill";
        for (const level of skill.levels) {
            if (!object(level) || !Number.isInteger(level.level) || level.level < 1 || seen[level.level]) return "Invalid skill level";
            seen[level.level] = true;
            if (skill.kind === "native") {
                if (!validNativeSkillPayload(skill,level.payload)) return "Invalid native skill payload";
            } else if (skill.kind === "max_hp") { if (!nonnegative(level.hp_multiplier) || level.hp_multiplier < 1) return "Invalid passive"; }
            else {
                for (const key of ["damage_multiplier","cooldown","range"]) if (!nonnegative(level[key]) || level[key] <= 0) return "Invalid skill parameter";
                if (skill.kind === "area" && (!nonnegative(level.radius) || level.radius <= 0)) return "Invalid skill area";
                if (!nonnegative(level.slow_percent === undefined ? 0 : level.slow_percent) || Number(level.slow_percent || 0) >= 1 || !nonnegative(level.slow_duration === undefined ? 0 : level.slow_duration)) return "Invalid skill slow";
            }
        }
    }
    if(value.loadout_templates!==undefined) {
        if(!object(value.loadout_templates)) return "Invalid element loadout templates";
        for(const templateId of Object.keys(value.loadout_templates)) {
            const template=value.loadout_templates[templateId];
            if(!object(template)||!Object.keys(template).length) return "Invalid element loadout template";
            for(const element of Object.keys(template)) {
                const refs=template[element], seen:{[key:string]:boolean}={};
                if(elements.indexOf(element)<0||element==="neutral"||!Array.isArray(refs)) return "Invalid element loadout";
                let attacks=0;
                for(const ref of refs) {
                    if(!object(ref)||!Number.isInteger(ref.level)) return "Invalid loadout reference";
                    const skill=value.skill_atlas[ref.skill_id];
                    if(!skill||!skill.levels.some((row:any)=>row.level===ref.level)||(skill.element!=="neutral"&&skill.element!==element)) return "Incompatible loadout skill";
                    const slot=skill.kind==="native"?String(ref.slot||""):"shared", key=ref.skill_id+":"+slot;
                    if(seen[key]) return "Duplicate loadout skill";seen[key]=true;
                    if(skill.kind==="native") {
                        if(["attack_skill","boss_skills","generic_skills"].indexOf(slot)<0||(slot==="generic_skills")!==(skill.executor==="enemy_trait")) return "Invalid loadout slot";
                        if(slot==="attack_skill"&&++attacks>1) return "Duplicate loadout attack";
                    }
                }
            }
        }
    }
    if(value.native_defaults!==undefined) {
        if(!object(value.native_defaults))return "Invalid native defaults";
        for(const slot of Object.keys(value.native_defaults)) {
            if(["enemy_skills","boss_skills"].indexOf(slot)<0||!object(value.native_defaults[slot]))return "Invalid native default slot";
            for(const id of Object.keys(value.native_defaults[slot])) {
                const ref=value.native_defaults[slot][id], skill=ref&&value.skill_atlas[ref.skill_id];
                if(!skill||skill.kind!=="native"||!Number.isInteger(ref.level)||!skill.levels.some((row:any)=>row.level===ref.level)||(slot==="enemy_skills")!==(skill.executor==="enemy_trait"))return "Invalid native default reference";
            }
        }
    }
    if (value.enemy_skill_bindings !== undefined) {
        if (!object(value.enemy_skill_bindings)) return "Invalid enemy skill bindings";
        for (const id of Object.keys(value.enemy_skill_bindings)) {
            const binding=value.enemy_skill_bindings[id]; if (!object(binding)) return "Invalid enemy binding";
            for (const slot of ["attack_skill","boss_skills","generic_skills"]) {
                const refs=slot==="attack_skill"?(binding[slot]===null?[]:[binding[slot]]):binding[slot];
                if (!Array.isArray(refs)) return "Invalid binding slot";
                for(const ref of refs) {
                    if(!object(ref)||!Number.isInteger(ref.level)) return "Invalid native reference";
                    const skill=value.skill_atlas[ref.skill_id];
                    if(!skill||skill.kind!=="native"||!skill.levels.some((row:any)=>row.level===ref.level)||(slot==="generic_skills")!==(skill.executor==="enemy_trait")) return "Missing native reference/level or wrong slot";
                }
            }
        }
    }
    return "";
}

function validateSeedRequest(data: any): string {
    const tables = ["heroes","enemies","items","skills","stages","stage_levels","arcs","cards","effects","talismans","store_catalog","content_configs","config","remote_settings"];
    if (tables.indexOf(data.table) < 0) return "Unknown table";
    if (data.replace_all !== undefined && typeof data.replace_all !== "boolean") return "replace_all must be boolean";
    if (data.table === "config") {
        if (typeof data.config_key !== "string" || !data.config_key || !data.config_value || typeof data.config_value !== "object" || Array.isArray(data.config_value)) return "Invalid config";
        if (data.config_key === "progression" && data.config_value.enemy_framework !== undefined) return validateEnemyFrameworkCatalog(data.config_value.enemy_framework);
        return "";
    }
    const ids: {[id:string]: boolean} = {};
    const extensions = seedExtensionColumns()[data.table] || {};
    for (const row of data.rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) return "Invalid row";
        const id = data.table === "remote_settings" ? row.module + ":" + row.key : row.id;
        if ((typeof id !== "string" && typeof id !== "number") || !String(id) || ids[String(id)]) return "Missing or duplicate id";
        ids[String(id)] = true;
        if (data.table === "skills" && ["neutral","metal","water","wood","fire","earth","thunder"].indexOf(row.element) < 0) return "Missing or invalid fixed skill element";
        if (data.table === "skills" && row.id === "hero_basic_attack" && row.element !== "neutral") return "Basic attack must be neutral";
        if (data.table === "store_catalog") {
            if (typeof row.product_id !== "string" || !row.product_id || ids["product:" + row.product_id]) return "Missing or duplicate product_id";
            ids["product:" + row.product_id] = true;
        }
        if (data.table === "talismans" && (!Number.isInteger(row.id) || row.id <= 0)) return "Invalid talisman id";
        if (["heroes","enemies","items","skills","stages","arcs","cards","effects"].indexOf(data.table) >= 0 && (typeof row.display_name !== "string" || !row.display_name)) return "Missing display_name";
        if(data.table==='stages'&&Number((row.stage_rules||{}).enemy_framework_version)===2) {
            for(const wave of row.waves||[])for(const entry of wave.entries||[]) {
                for(const branch of [entry,...Object.keys(entry.difficulty_overrides||{}).map(k=>entry.difficulty_overrides[k])])
                    if(!branch||['modifiers','attributes','hp_mul','atk_mul','def_mul','boss_skill_ids'].some(k=>Object.prototype.hasOwnProperty.call(branch,k)))return 'Legacy stat/skill override in v2 entry';
            }
        }
        if (data.table === "stage_levels" && (!row.stage_id || !row.level_id)) return "Missing stage reference";
        for (const key of Object.keys(extensions)) {
            if (row[key] === undefined) continue;
            const type = extensions[key];
            if (type === "INT" && (!Number.isInteger(row[key]) || row[key] < 0)) return "Invalid integer: " + key;
            if (type === "REAL" && (typeof row[key] !== "number" || !Number.isFinite(row[key]) || row[key] < 0)) return "Invalid number: " + key;
            if (type === "TEXT" && typeof row[key] !== "string") return "Invalid text: " + key;
            if (type === "JSONB" && (!row[key] || typeof row[key] !== "object")) return "Invalid JSON: " + key;
            if (["boss_skill_ids","boss_skill_entry_indexes","spawn_sequence"].indexOf(key) >= 0 && !Array.isArray(row[key])) return "Expected array: " + key;
            if (["fragment_drop","stage_rules","stat_growth","metadata"].indexOf(key) >= 0 && Array.isArray(row[key])) return "Expected object: " + key;
        }
        if (row.waves !== undefined && (!Array.isArray(row.waves) || row.waves.some((wave: any) => !wave || typeof wave !== "object" || (wave.entries !== undefined && !Array.isArray(wave.entries))))) return "Invalid waves";
        if (data.table === "content_configs" && (!row.payload || typeof row.payload !== "object" || (Array.isArray(row.payload) && ["enemy_skills","boss_skills"].indexOf(String(row.id)) < 0))) return "Invalid content config";
        if (data.table === "remote_settings") {
            if (["system","game_play"].indexOf(row.module) < 0 || typeof row.key !== "string" || !row.key || typeof row.value !== "string") return "Invalid setting";
            try { parseRemoteSetting(row.value_type, row.value); } catch (_e) { return "Invalid setting type/value"; }
            if (["ads_enabled","payment_enabled"].indexOf(row.key) >= 0 && (row.module !== "system" || row.value_type !== "bool")) return "Feature flags must be system bools";
        }
    }
    return "";
}

// One request is one transaction; do not use BEGIN/COMMIT across pooled sqlExec calls.
const seedGameData: nkruntime.RpcFunction = (
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    payload: string
): string => {
    if (ctx.userId && !isConfigAdmin(ctx)) {
        return JSON.stringify({error: "Forbidden", code: 403});
    }
    let data: any;
    try { data = JSON.parse(payload); } catch (_e) { return JSON.stringify({error: "Invalid JSON"}); }
    if (!data || typeof data !== "object" || Array.isArray(data)) return JSON.stringify({error: "Expected object"});
    if(data.table==='bundle')return seedGameDataBundle(ctx,logger,nk,data);
    const statements: string[] = [];
    const checks: string[] = [];
    const write = (sql: string, params: any[]) => {
        statements.push(seedBindSql(sql, params));
        const insert = /INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i.exec(sql);
        if (insert) {
            const columns = insert[2].split(",").map(value => value.trim());
            const values = insert[3].split(",").map(value => value.trim());
            // NOW() and generated columns are not input values.
            // Cast expected values through the real table type (not NUMERIC vs REAL).
            const predicates = columns.map((column, i) => /^\$\d+(::\w+)?$/.test(values[i] || "") ? column + " IS NOT DISTINCT FROM (jsonb_populate_record(NULL::" + insert[1] + ",jsonb_build_object('" + column + "'," + seedBindSql(values[i], params) + ")))." + column : "").filter(Boolean);
            checks.push(`IF NOT EXISTS (SELECT 1 FROM ${insert[1]} WHERE ${predicates.join(" AND ")}) THEN RAISE EXCEPTION 'Seed readback mismatch'; END IF`);
        }
    };
    try {
    // payload format: { "table": "heroes", "rows": [...] }

    const table = data.table as string;
    const rows = data.rows as any[];

    if (!table) {
        return JSON.stringify({ error: "Missing table" });
    }

    // "config" table uses config_value instead of rows
    if (table !== "config" && (!Array.isArray(rows) || rows.length === 0)) {
        return JSON.stringify({ error: "Missing table or rows" });
    }

    const validation = validateSeedRequest(data);
    if (validation) return JSON.stringify({error: validation});
    let inserted = 0;
    const preservedLevelledStages: string[] = [];

    switch (table) {
        case "heroes":
            if (data.replace_all === true) {
                statements.push(`DO $prune$ BEGIN
                  IF to_regclass('storage') IS NOT NULL THEN
                    IF EXISTS(SELECT 1 FROM storage WHERE collection IN ('player_profiles','player_heroes'))
                      AND EXISTS(SELECT 1 FROM game_heroes WHERE NOT(id=ANY(${seedSqlLiteral(seedPgArray(rows.map((r:any)=>r.id)))}::TEXT[])))
                      THEN RAISE EXCEPTION 'SEED_PRUNE_BLOCKED_PLAYER_REFERENCES'; END IF;
                  END IF;
                  IF to_regclass('monetization_purchases') IS NOT NULL THEN
                    IF EXISTS(SELECT 1 FROM monetization_purchases)
                      AND EXISTS(SELECT 1 FROM game_heroes WHERE NOT(id=ANY(${seedSqlLiteral(seedPgArray(rows.map((r:any)=>r.id)))}::TEXT[])))
                      THEN RAISE EXCEPTION 'SEED_PRUNE_BLOCKED_FINANCIAL_HISTORY'; END IF;
                  END IF;
                END $prune$`);
                write("DELETE FROM game_heroes WHERE NOT (id = ANY($1::text[]))", [seedPgArray(rows.map((r: any) => r.id))]);
            }
            for (const row of rows) {
                write(`
                    INSERT INTO game_heroes (id, display_name, role, element, description,
                        auto_basic_attack, visual_scale, price, require, attributes, level_up_stats,
                        starting_skills, skill_pool)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, role=EXCLUDED.role,
                        element=EXCLUDED.element, description=EXCLUDED.description,
                        auto_basic_attack=EXCLUDED.auto_basic_attack, visual_scale=EXCLUDED.visual_scale, price=EXCLUDED.price,
                        require=EXCLUDED.require, attributes=EXCLUDED.attributes,
                        level_up_stats=EXCLUDED.level_up_stats, starting_skills=EXCLUDED.starting_skills,
                        skill_pool=EXCLUDED.skill_pool, updated_at=NOW()
                `, [
                    row.id, row.display_name, row.role || '',
                    row.element || '', row.description || '',
                    row.auto_basic_attack !== false,
                    row.visual_scale ?? 1.0,
                    JSON.stringify(row.price || {}),
                    JSON.stringify(row.require || {}),
                    JSON.stringify(row.attributes || {}),
                    JSON.stringify(row.level_up_stats || {}),
                    JSON.stringify(row.starting_skills || []),
                    JSON.stringify(row.skill_pool || [])
                ]);
                inserted++;
            }
            break;

        case "enemies":
            for (const row of rows) {
                write(`
                    INSERT INTO game_enemies (id, display_name, element, attack_type, visual_scale, boss_visual_scale, exp,
                        is_boss, boss_scale, attributes, skills, attack_effects, generic_skills, boss_skills, reward, attack_skill)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, element=EXCLUDED.element,
                        attack_type=EXCLUDED.attack_type, visual_scale=EXCLUDED.visual_scale,
                        boss_visual_scale=EXCLUDED.boss_visual_scale, exp=EXCLUDED.exp,
                        is_boss=EXCLUDED.is_boss, boss_scale=EXCLUDED.boss_scale,
                        attributes=EXCLUDED.attributes, skills=EXCLUDED.skills, attack_effects=EXCLUDED.attack_effects, generic_skills=EXCLUDED.generic_skills,
                        boss_skills=EXCLUDED.boss_skills, reward=EXCLUDED.reward, attack_skill=EXCLUDED.attack_skill,
                        updated_at=NOW()
                `, [
                    row.id, row.display_name, row.element || '',
                    row.attack_type || 'melee', row.visual_scale ?? 0.364,
                    row.boss_visual_scale ?? 0.442, row.exp ?? 0,
                    row.is_boss || false, row.boss_scale ?? 1.0,
                    JSON.stringify(row.attributes || {}),
                    JSON.stringify(row.skills || []),
                    JSON.stringify(row.attack_effects || []),
                    JSON.stringify(row.generic_skills || []),
                    JSON.stringify(row.boss_skills || []),
                    JSON.stringify(row.reward || {}),
                    row.attack_skill ? JSON.stringify(row.attack_skill) : null
                ]);
                inserted++;
            }
            break;

        case "items":
			// Remove superseded mock/rune-backed talisman materials. Upgrade
			// requirements now use the dedicated Thiên Tinh catalog item.
			// Retired catalog IDs may still be referenced by legacy/S1 inventories or orders.
			// Seeding never deletes historical item definitions.
            for (const row of rows) {
                write(`
                    INSERT INTO game_items (id, display_name, description, category, rarity,
                        icon_id, stackable, max_stack, sort_order, expires_after_hours, tags, attributes)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        category=EXCLUDED.category, rarity=EXCLUDED.rarity,
                        icon_id=EXCLUDED.icon_id, stackable=EXCLUDED.stackable,
                        max_stack=EXCLUDED.max_stack, sort_order=EXCLUDED.sort_order,
                        expires_after_hours=EXCLUDED.expires_after_hours,
                        tags=EXCLUDED.tags, attributes=EXCLUDED.attributes, updated_at=NOW()
                `, [
                    row.id, row.display_name, row.description || '',
                    row.category || '', row.rarity || 'common',
                    row.icon_id || '', row.stackable !== false,
                    row.max_stack ?? 999, row.order ?? 0,
                    row.expires_after_hours ?? 0,
                    JSON.stringify(row.tags || []),
                    JSON.stringify(row.attributes || {})
                ]);
                inserted++;
            }
            break;

        case "skills":
            for (const row of rows) {
                write(`
                    INSERT INTO game_skills (id, display_name, category, skill_class,
                        activation, skill_type, element, description, positioning, deployment,
                        vfx_frames, cast_config, description_rows, criteria_unlock, hero_level_unlock, levels)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, category=EXCLUDED.category,
                        skill_class=EXCLUDED.skill_class, activation=EXCLUDED.activation,
                        skill_type=EXCLUDED.skill_type, element=EXCLUDED.element, description=EXCLUDED.description,
                        positioning=EXCLUDED.positioning, deployment=EXCLUDED.deployment,
                        vfx_frames=EXCLUDED.vfx_frames, cast_config=EXCLUDED.cast_config,
						description_rows=EXCLUDED.description_rows, criteria_unlock=EXCLUDED.criteria_unlock, hero_level_unlock=EXCLUDED.hero_level_unlock,
                        levels=EXCLUDED.levels, updated_at=NOW()
                `, [
                    row.id, row.display_name, row.category || 'combat',
                    row.skill_class || '', row.activation || 'auto',
                    row.skill_type || '', row.element || '', row.description || '',
                    JSON.stringify(row.positioning || {}),
                    JSON.stringify(row.deployment || {}),
                    JSON.stringify(row.vfx_frames || []),
                    JSON.stringify(row.cast_config || {}),
                    JSON.stringify(row.description_rows || []),
                    JSON.stringify(row.createria_unlock || row.criteria_unlock || {}),
					Math.max(1, Number(row.hero_level_unlock ?? 1)),
                    JSON.stringify(row.levels || [])
                ]);
                inserted++;
            }
            break;

        case "stages":
            // stages.json has waves embedded — split into game_stages + game_stage_waves
            for (const row of rows) {
                if(Number((row.stage_rules||{}).enemy_framework_version)!==2) {
                    const deployed=nk.sqlQuery("SELECT id FROM game_stages WHERE id=$1 AND stage_rules->>'enemy_framework_version'='2'",[row.id]);
                    if(deployed.length){preservedLevelledStages.push(String(row.id));inserted++;continue;}
                    // Lock and recheck inside the actual transaction, not just planner preflight.
                    statements.push(`PERFORM id FROM game_stages WHERE id=${seedSqlLiteral(row.id)} FOR UPDATE`);
                    statements.push(`IF EXISTS(SELECT 1 FROM game_stages WHERE id=${seedSqlLiteral(row.id)} AND stage_rules->>'enemy_framework_version'='2') THEN RAISE EXCEPTION 'C239_LEGACY_SEED_DOWNGRADE_BLOCKED'; END IF`);
                }
                write(`
                    INSERT INTO game_stages (id, arc_id, level, display_name, description,
                        sort_order, exp_weight, is_boss, background, music, enabled_if, difficulty_levels, loot_table)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        arc_id=EXCLUDED.arc_id, level=EXCLUDED.level,
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
						sort_order=EXCLUDED.sort_order, exp_weight=EXCLUDED.exp_weight, is_boss=EXCLUDED.is_boss,
                        background=EXCLUDED.background, music=EXCLUDED.music,
                        enabled_if=EXCLUDED.enabled_if, difficulty_levels=EXCLUDED.difficulty_levels,
                        loot_table=EXCLUDED.loot_table,
                        updated_at=NOW()
                `, [
                    row.id, row.arc_id, row.level ?? 1,
                    row.display_name, row.description || '',
                    row.order ?? row.sort_order ?? 0,
					row.exp_weight ?? 1.0, row.is_boss || false, row.background || '',
                    row.music || '',
                    JSON.stringify(row.enabled_if || {}),
                    JSON.stringify(row.difficulty_levels || []),
                    JSON.stringify(row.loot_table || [])
                ]);

                // Insert waves
                const waves = row.waves || [];
                // A stage may gain or lose waves between data revisions. Clear its
                // relational children first so obsolete wave rows cannot survive a reseed.
                write("DELETE FROM game_stage_waves WHERE stage_id = $1", [row.id]);
                for (let i = 0; i < waves.length; i++) {
                    const wave = waves[i];
                    write(`
                        INSERT INTO game_stage_waves (stage_id, wave_index, wave_id, display_name, entries)
                        VALUES ($1, $2, $3, $4, $5::jsonb)
                        ON CONFLICT (stage_id, wave_index) DO UPDATE SET
                            wave_id=EXCLUDED.wave_id, display_name=EXCLUDED.display_name,
                            entries=EXCLUDED.entries
                    `, [
                        row.id, i, wave.wave_id || wave.id || '',
                        wave.display_name || '',
                        JSON.stringify(wave.entries || [])
                    ]);
                }
                inserted++;
            }
            break;

        case "stage_levels":
            for (const row of rows) {
                write(`
                    INSERT INTO game_stage_levels (id, stage_id, level_id, display_name, description,
                        sort_order, recommended_power, exp_multiplier, stamina_cost, gold_reward, enemy_modifiers, loot_table, boss_loot_table,
                        unlock_condition, stage_rules, ui)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        stage_id=EXCLUDED.stage_id, level_id=EXCLUDED.level_id,
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        sort_order=EXCLUDED.sort_order, recommended_power=EXCLUDED.recommended_power,
                        exp_multiplier=EXCLUDED.exp_multiplier, stamina_cost=EXCLUDED.stamina_cost, gold_reward=EXCLUDED.gold_reward,
						enemy_modifiers=EXCLUDED.enemy_modifiers, loot_table=EXCLUDED.loot_table, boss_loot_table=EXCLUDED.boss_loot_table, unlock_condition=EXCLUDED.unlock_condition,
                        stage_rules=EXCLUDED.stage_rules, ui=EXCLUDED.ui, updated_at=NOW()
                `, [
                    row.id, row.stage_id, row.level_id, row.display_name || row.level_id,
                    row.description || '', row.order ?? row.sort_order ?? 0,
                    row.recommended_power ?? 0, row.exp_multiplier ?? 1.0, row.stamina_cost ?? 1, row.gold_reward ?? 0,
                    JSON.stringify(row.enemy_modifiers || {}), JSON.stringify(row.loot_table || []), JSON.stringify(row.boss_loot_table || []),
                    JSON.stringify(row.unlock_condition || {}), JSON.stringify(row.stage_rules || {}),
                    JSON.stringify(row.ui || {})
                ]);
                inserted++;
            }
            break;

        case "arcs":
            for (const row of rows) {
                write(`
                    INSERT INTO game_arcs (id, display_name, description, level_min, level_max,
                        element, sort_order, enabled_if, stage_ids)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        level_min=EXCLUDED.level_min, level_max=EXCLUDED.level_max,
                        element=EXCLUDED.element, sort_order=EXCLUDED.sort_order,
                        enabled_if=EXCLUDED.enabled_if, stage_ids=EXCLUDED.stage_ids
                `, [
                    row.id, row.display_name, row.description || '',
                    row.level_min ?? 1, row.level_max ?? 10,
                    row.element || '',
                    row.order ?? row.sort_order ?? 0,
                    JSON.stringify(row.enabled_if || {}),
                    JSON.stringify(row.stage_ids || [])
                ]);
                inserted++;
            }
            break;

        case "cards":
            for (const row of rows) {
                write(`
                    INSERT INTO game_cards (id, display_name, card_type, rarity, icon_id,
                        description, effect_description, effect)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, card_type=EXCLUDED.card_type,
                        rarity=EXCLUDED.rarity, icon_id=EXCLUDED.icon_id,
                        description=EXCLUDED.description, effect_description=EXCLUDED.effect_description,
                        effect=EXCLUDED.effect
                `, [
                    row.id, row.display_name, row.card_type || '',
                    row.rarity || 'common', row.icon_id || '',
                    row.description || '', row.effect_description || '',
                    JSON.stringify(row.effect || {})
                ]);
                inserted++;
            }
            break;

        case "effects":
            for (const row of rows) {
				const metadata: any = { ...row };
				delete metadata.id;
				delete metadata.display_name;
				delete metadata.description;
				delete metadata.default_props;
                write(`
                    INSERT INTO game_effects (id, display_name, description, default_props, metadata)
                    VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        default_props=EXCLUDED.default_props, metadata=EXCLUDED.metadata
                `, [
                    row.id, row.display_name, row.description || '',
					JSON.stringify(row.default_props || {}), JSON.stringify(metadata)
                ]);
                inserted++;
            }
            break;

        case "talismans":
            for (const row of rows) {
                const numericId = Number(row.id ?? 0);
                const qualityTier = numericId <= 15 ? "Hạ phẩm" : (numericId <= 25 ? "Trung phẩm" : "Thượng phẩm");
                const elementOrder = ["metal", "wood", "water", "fire", "earth"];
                const normalizedElement = row.element || elementOrder[Math.max(0, numericId - 16) % elementOrder.length];
                write(`
                    INSERT INTO game_talismans (id, display_name, tier, element, type, level, max_level,
                        is_equipped, description, skill, stats, upgrade_exp, upgrade_max_exp, materials)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, tier=EXCLUDED.tier, element=EXCLUDED.element,
                        type=EXCLUDED.type, level=EXCLUDED.level, max_level=EXCLUDED.max_level,
                        is_equipped=EXCLUDED.is_equipped, description=EXCLUDED.description,
                        skill=EXCLUDED.skill, stats=EXCLUDED.stats, upgrade_exp=EXCLUDED.upgrade_exp,
                        upgrade_max_exp=EXCLUDED.upgrade_max_exp, materials=EXCLUDED.materials,
                        updated_at=NOW()
                `, [
                    row.id, row.name || row.display_name || '',
                    row.tier || qualityTier, normalizedElement, row.type || 'attack',
                    row.level ?? 1, row.max_level ?? 30,
                    row.is_equipped === true, row.description || '',
                    row.skill || '',
                    JSON.stringify(row.stats || {}),
                    row.upgrade_exp ?? 0,
                    row.upgrade_max_exp ?? 20,
                    JSON.stringify(row.materials || [])
                ]);
                inserted++;
            }
            break;

        case "store_catalog":
            // Products removed from the seed are retained for PO history but
            // cannot be sold until explicitly present and active again.
            if (data.replace_all === true) write("UPDATE game_store_products SET active = FALSE, updated_at = NOW()", []);
            for (const row of rows) {
                const rewards = Array.isArray(row.rewards) ? row.rewards : [];
                if (!row.product_id || !row.id || rewards.length === 0) {
                    return JSON.stringify({ error: `Invalid store product: ${row.product_id || row.id || "unknown"}` });
                }
                for (const reward of rewards) {
                    if (!reward || ["item","hero","currency","entitlement","stamina"].indexOf(reward.reward_type) < 0 || !reward.reward_id || !Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) {
                        return JSON.stringify({ error: `Invalid reward in product ${row.product_id}` });
                    }
                    if (reward.reward_type === "item" && nk.sqlQuery("SELECT id FROM game_items WHERE id = $1", [reward.reward_id]).length === 0) {
                        return JSON.stringify({ error: `Unknown item ${reward.reward_id} in product ${row.product_id}` });
                    }
                    if (reward.reward_type === "hero" && nk.sqlQuery("SELECT id FROM game_heroes WHERE id = $1", [reward.reward_id]).length === 0) {
                        return JSON.stringify({ error: `Unknown hero ${reward.reward_id} in product ${row.product_id}` });
                    }
                    if(reward.reward_type==='item'||reward.reward_type==='hero') {
                        const refTable=reward.reward_type==='item'?'game_items':'game_heroes';
                        checks.push(`IF NOT EXISTS(SELECT 1 FROM ${refTable} WHERE id=${seedSqlLiteral(reward.reward_id)}) THEN RAISE EXCEPTION 'Store reward reference missing at commit'; END IF`);
                    }
                }
                write(`
                    INSERT INTO game_store_products
                        (product_id, pack_id, tab_id, display_name, description, badge,
                         icon_type, icon_key, fallback_price, google_product_type,
                         fulfillment_type, active, unique_purchase, purchase_limit,
                         purchase_limit_period, ui)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
                    ON CONFLICT (product_id) DO UPDATE SET
                        pack_id=EXCLUDED.pack_id, tab_id=EXCLUDED.tab_id,
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        badge=EXCLUDED.badge, icon_type=EXCLUDED.icon_type, icon_key=EXCLUDED.icon_key,
                        fallback_price=EXCLUDED.fallback_price, google_product_type=EXCLUDED.google_product_type,
                        fulfillment_type=EXCLUDED.fulfillment_type, active=EXCLUDED.active,
                        unique_purchase=EXCLUDED.unique_purchase, purchase_limit=EXCLUDED.purchase_limit,
                        purchase_limit_period=EXCLUDED.purchase_limit_period, ui=EXCLUDED.ui,
                        updated_at=NOW()
                `, [
                    row.product_id, row.id, row.tab_id || "", row.name || row.title || row.id,
                    row.desc || row.subtitle || "", row.badge || "", row.icon_type || "pack",
                    row.icon_key || "", row.price || row.display_price || "", "inapp",
                    row.fulfillment_type || "consumable", row.active === true,
                    row.unique_purchase === true, Number(row.purchase_limit ?? 0),
                    row.purchase_limit_period || "", JSON.stringify(row)
                ]);
                write("DELETE FROM game_store_product_rewards WHERE product_id = $1", [row.product_id]);
                rewards.forEach((reward: any, index: number) => write(`
                    INSERT INTO game_store_product_rewards
                        (product_id, line_no, reward_type, reward_id, quantity, metadata)
                    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
                `, [row.product_id, index + 1, reward.reward_type, reward.reward_id,
                    Number(reward.quantity), JSON.stringify(reward.metadata || {})]));
                inserted++;
            }
            break;

        case "content_configs":
            for (const row of rows) {
                if (!row.id || !row.payload) return JSON.stringify({ error: "Invalid content config" });
                if (String(row.id) === "events") {
                    const validationError = eventValidateConfig(row.payload);
                    if (validationError) return JSON.stringify({ error: `Invalid events config: ${validationError}` });
                }
                write(`
                    INSERT INTO game_content_configs (id, payload, active, updated_at)
                    VALUES ($1, $2::jsonb, $3, NOW())
                    ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,
                        active=EXCLUDED.active, updated_at=NOW()
                `, [row.id, JSON.stringify(row.payload), row.active !== false]);
                inserted++;
            }
            break;

        case "remote_settings":
            for (const row of rows) {
                write(`INSERT INTO remote_config_settings (module,key,value_type,value,description,is_active,updated_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (module,key) DO UPDATE SET value_type=EXCLUDED.value_type,
                    value=EXCLUDED.value,description=EXCLUDED.description,is_active=EXCLUDED.is_active,
                    updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
                    [row.module,row.key,row.value_type,row.value,row.description ?? "",row.is_active !== false,ctx.userId || "http-key-seed"]);
                inserted++;
            }
            break;

        case "config":
            // progression.json → key="progression"
            write(`
                INSERT INTO game_config (key, value)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
            `, [data.config_key || 'progression', JSON.stringify(data.config_value || {})]);
            inserted = 1;
            break;

        default:
            return JSON.stringify({ error: `Unknown table: ${table}` });
    }

    const columns = seedExtensionColumns()[table];
    if (columns) for (const row of rows) {
        if(table==='stages'&&preservedLevelledStages.indexOf(String(row.id))>=0)continue;
        const fields = Object.keys(columns).filter(key => key === "metadata" || row[key] !== undefined);
        if (!fields.length) continue;
        const params: any[] = [row.id];
        const assignments = fields.map(key => {
            let value = row[key];
            if (table === "skills" && key === "metadata") {
                value = {...row};
                ["id","display_name","category","skill_class","activation","skill_type","element","description",
                 "positioning","deployment","vfx_frames","cast_config","description_rows","criteria_unlock",
                 "createria_unlock","hero_level_unlock","levels","metadata"].forEach(k => delete value[k]);
            }
            params.push(columns[key] === "JSONB" ? JSON.stringify(value) : value);
            return `${key}=$${params.length}${columns[key] === "JSONB" ? "::jsonb" : ""}`;
        });
        write(`UPDATE game_${table} SET ${assignments.join(",")} WHERE id=$1`, params);
        const predicates = fields.map((key, index) => `${key} IS NOT DISTINCT FROM (jsonb_populate_record(NULL::game_${table},jsonb_build_object('${key}',${seedSqlLiteral(params[index + 1])}${columns[key] === "JSONB" ? "::jsonb" : ""}))).${key}`);
        checks.push(`IF NOT EXISTS (SELECT 1 FROM game_${table} WHERE id=${seedSqlLiteral(row.id)} AND ${predicates.join(" AND ")}) THEN RAISE EXCEPTION 'Seed extension readback mismatch'; END IF`);
    }
    // One PostgreSQL statement runs every mutation atomically, even with pooled connections.
    const body = "BEGIN\nPERFORM pg_advisory_xact_lock(143,2);\n" + statements.concat(checks).concat(["NULL"]).join(";\n") + ";\nEND";
    nk.sqlExec("DO " + seedSqlLiteral(body), []);
    logger.info(`Seeded ${inserted} rows into ${table}`);
    return JSON.stringify({ success: true, table, inserted, ...(preservedLevelledStages.length?{preserved_levelled:preservedLevelledStages.length}: {}) });
    } catch (error) {
        logger.error("Seed request failed: %s", String(error));
        return JSON.stringify({error: "Seed failed; no changes committed", code: 422});
    }
};

function seedGameDataBundle(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,data:any):string {
    if(!Array.isArray(data.requests)||data.requests.length<1||data.requests.length>100)
        return JSON.stringify({error:'Invalid seed bundle',code:400});
    const compiled:string[]=[];
    const results:any[]=[];
    const staged:{[table:string]:string[]}={};
    const planner:any=Object.create(nk);
    planner.sqlExec=(sql:string,params:any[])=>{compiled.push(params.length?seedBindSql(sql,params):sql);};
    planner.sqlQuery=(sql:string,params:any[])=>{
        for(const table of ['items','heroes']) {
            if(sql==='SELECT id FROM game_'+table+' WHERE id = $1' && staged[table] && staged[table].indexOf(String(params[0]))>=0)
                return [{id:params[0]}];
        }
        return nk.sqlQuery(sql,params);
    };
    for(let i=0;i<data.requests.length;i++) {
        const request=data.requests[i];
        if(!request||request.table==='bundle')return JSON.stringify({error:'Nested or invalid seed bundle',request_index:i});
        const result=JSON.parse(seedGameData(ctx,logger,planner,JSON.stringify(request)));
        if(result.success!==true)return JSON.stringify({error:result.error||'Seed validation failed',request_index:i,table:request.table});
        results.push(result);
        if(request.table==='items'||request.table==='heroes')staged[request.table]=(staged[request.table]||[]).concat(request.rows.map((r:any)=>String(r.id)));
    }
    try {
        // One SQL statement/transaction: no pooled connection BEGIN/COMMIT assumptions.
        nk.sqlExec('DO '+seedSqlLiteral('BEGIN\nPERFORM pg_advisory_xact_lock(143,2);\n'+compiled.map(sql=>'EXECUTE '+seedSqlLiteral(sql)+';').join('\n')+'\nEND'),[]);
        return JSON.stringify({success:true,table:'bundle',atomic:true,results});
    }catch(error){logger.error('Atomic seed bundle rolled back: %s',String(error));return JSON.stringify({error:'Atomic seed bundle rolled back',code:409});}
}

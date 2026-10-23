function seedExtensionColumns(): {[table: string]: {[column: string]: string}} {
    return {
    "heroes": {
        "basic_attack_range": "REAL"
    },
    "arcs": {
        "boss_skill_ids": "JSONB",
        "enemy_visual_scale_multiplier": "REAL"
    },
    "stages": {
        "boss_skill_ids": "JSONB",
        "boss_skill_entry_indexes": "JSONB",
        "fragment_drop": "JSONB",
        "spawn_sequence": "JSONB",
        "stage_rules": "JSONB"
    },
    "cards": {
        "min_hero_level": "INT",
        "tier": "TEXT",
        "selection_weight": "REAL",
        "support_family": "TEXT"
    },
    "talismans": {
        "item_id": "TEXT",
        "skill_id": "TEXT",
        "category": "TEXT",
        "quality": "TEXT",
        "severe_repair_item_id": "TEXT",
        "stat_growth": "JSONB",
        "max_battle_uses": "INT",
        "durability_cost_per_cast": "INT",
        "durability_cost_per_battle": "INT",
        "repair_cost_per_point": "INT",
        "severe_repair_item_quantity": "INT"
    },
    "skills": {
        "metadata": "JSONB"
    }
};
}

function createGameConfigTables(nk: nkruntime.Nakama, logger: nkruntime.Logger) {
    // ── heroes ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_heroes (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            role            TEXT DEFAULT '',
            element         TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            auto_basic_attack BOOLEAN DEFAULT true,
            visual_scale    REAL DEFAULT 1.0,
            price           JSONB DEFAULT '{}',
            require         JSONB DEFAULT '{}',
            attributes      JSONB NOT NULL DEFAULT '{}',
            level_up_stats  JSONB DEFAULT '{}',
            starting_skills JSONB DEFAULT '[]',
            skill_pool      JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);

    try {
        nk.sqlExec("ALTER TABLE game_heroes ADD COLUMN IF NOT EXISTS visual_scale REAL DEFAULT 1.0", []);
    } catch (e) {
    }

    // ── enemies ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_enemies (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            element         TEXT DEFAULT '',
            attack_type     TEXT DEFAULT 'melee',
            visual_scale    REAL DEFAULT 0.364,
            boss_visual_scale REAL DEFAULT 0.442,
            exp             INT DEFAULT 0,
            is_boss         BOOLEAN DEFAULT false,
            boss_scale      REAL DEFAULT 1.0,
            attributes      JSONB NOT NULL DEFAULT '{}',
            skills          JSONB DEFAULT '[]',
            attack_effects  JSONB DEFAULT '[]',
            attack_skill    JSONB,
            generic_skills  JSONB DEFAULT '[]',
            boss_skills     JSONB DEFAULT '[]',
            reward          JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
    nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS generic_skills JSONB DEFAULT '[]'", []);
    nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS attack_effects JSONB DEFAULT '[]'", []);
    nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS attack_skill JSONB", []);
    nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS visual_scale REAL DEFAULT 0.364", []);
    nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS boss_visual_scale REAL DEFAULT 0.442", []);

    // ── items ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_items (
            id                  TEXT PRIMARY KEY,
            display_name        TEXT NOT NULL,
            description         TEXT DEFAULT '',
            category            TEXT DEFAULT '',
            rarity              TEXT DEFAULT 'common',
            icon_id             TEXT DEFAULT '',
            stackable           BOOLEAN DEFAULT true,
            max_stack           INT DEFAULT 999,
            sort_order          INT DEFAULT 0,
            expires_after_hours INT DEFAULT 0,
            tags                JSONB DEFAULT '[]',
            attributes          JSONB DEFAULT '{}',
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);

    // ── skills (47KB — lưu levels dạng JSONB blob per skill) ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_skills (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            category        TEXT DEFAULT 'combat',
            skill_class     TEXT DEFAULT '',
            activation      TEXT DEFAULT 'auto',
            skill_type      TEXT DEFAULT '',
            element         TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            positioning     JSONB DEFAULT '{}',
            deployment      JSONB DEFAULT '{}',
            vfx_frames      JSONB DEFAULT '[]',
            cast_config     JSONB DEFAULT '{}',
            description_rows JSONB DEFAULT '[]',
            criteria_unlock JSONB DEFAULT '{}',
			hero_level_unlock INT NOT NULL DEFAULT 1,
            levels          JSONB NOT NULL DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);

    // ── arcs ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_arcs (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            description     TEXT DEFAULT '',
            level_min       INT DEFAULT 1,
            level_max       INT DEFAULT 10,
            element         TEXT DEFAULT '',
            sort_order      INT DEFAULT 0,
            enabled_if      JSONB DEFAULT '{}',
            stage_ids       JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);

    try {
        nk.sqlExec("ALTER TABLE game_arcs ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0", []);
    } catch (e) {
        // Ignore if already exists
    }

    // ── stages (header only, waves tách riêng) ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_stages (
            id              TEXT PRIMARY KEY,
            arc_id          TEXT NOT NULL,
            level           INT DEFAULT 1,
            display_name    TEXT NOT NULL,
            description     TEXT DEFAULT '',
            sort_order      INT DEFAULT 0,
            exp_weight      REAL DEFAULT 1.0,
			is_boss         BOOLEAN DEFAULT false,
            background      TEXT DEFAULT '',
            music           TEXT DEFAULT '',
            enabled_if      JSONB DEFAULT '{}',
            difficulty_levels JSONB DEFAULT '[]',
            loot_table      JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);

    try {
        nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0", []);
    } catch (e) {
        // Ignore if already exists
    }
    try {
        nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS difficulty_levels JSONB DEFAULT '[]'", []);
    } catch (e) {
        // Ignore if already exists
    }
	nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS is_boss BOOLEAN DEFAULT false", []);

    // ── stage waves (relational — 1 stage has N waves, 1 wave has N entries) ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_stage_waves (
            id              SERIAL PRIMARY KEY,
            stage_id        TEXT NOT NULL,
            wave_index      INT NOT NULL,
            wave_id         TEXT DEFAULT '',
            display_name    TEXT DEFAULT '',
            entries         JSONB NOT NULL DEFAULT '[]',
            UNIQUE(stage_id, wave_index)
        )
    `, []);

    // ── stage levels (one configurable difficulty tier per stage) ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_stage_levels (
            id                  TEXT PRIMARY KEY,
            stage_id            TEXT NOT NULL REFERENCES game_stages(id) ON DELETE CASCADE,
            level_id            TEXT NOT NULL,
            display_name        TEXT NOT NULL,
            description         TEXT DEFAULT '',
            sort_order          INT DEFAULT 0,
            recommended_power   INT DEFAULT 0,
            exp_multiplier      REAL DEFAULT 1.0,
			stamina_cost        INT DEFAULT 1,
			gold_reward         INT DEFAULT 0,
            enemy_modifiers     JSONB DEFAULT '{}',
            loot_table          JSONB DEFAULT '[]',
			boss_loot_table     JSONB DEFAULT '[]',
            unlock_condition    JSONB DEFAULT '{}',
            stage_rules         JSONB DEFAULT '{}',
            ui                  JSONB DEFAULT '{}',
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(stage_id, level_id)
        )
    `, []);
    nk.sqlExec("ALTER TABLE game_stage_levels ADD COLUMN IF NOT EXISTS stamina_cost INT DEFAULT 1", []);
	nk.sqlExec("ALTER TABLE game_stage_levels ADD COLUMN IF NOT EXISTS gold_reward INT DEFAULT 0", []);
    nk.sqlExec("ALTER TABLE game_stage_levels ADD COLUMN IF NOT EXISTS boss_loot_table JSONB DEFAULT '[]'", []);

    // ── cards ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_cards (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            card_type       TEXT DEFAULT '',
            rarity          TEXT DEFAULT 'common',
            icon_id         TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            effect_description TEXT DEFAULT '',
            effect          JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);

    // ── effects ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_effects (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            description     TEXT DEFAULT '',
            default_props   JSONB DEFAULT '{}',
			metadata        JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
    // Forward-compatible migration for databases created before generic cast
    // families were introduced. CREATE TABLE IF NOT EXISTS does not add fields.
    nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS element TEXT DEFAULT ''`, []);
    nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS cast_config JSONB DEFAULT '{}'`, []);
    nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS description_rows JSONB DEFAULT '[]'`, []);
	nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS hero_level_unlock INT NOT NULL DEFAULT 1`, []);
	// Existing local databases predate effect presentation metadata.
	nk.sqlExec("ALTER TABLE game_effects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'", []);

    // ── talismans ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_talismans (
            id              INT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            tier            TEXT DEFAULT '',
            element         TEXT DEFAULT 'metal',
            type            TEXT DEFAULT 'attack',
            level           INT DEFAULT 1,
            max_level       INT DEFAULT 30,
            is_equipped     BOOLEAN DEFAULT false,
            description     TEXT DEFAULT '',
            skill           TEXT DEFAULT '',
            stats           JSONB NOT NULL DEFAULT '{}',
            upgrade_exp     INT DEFAULT 0,
            upgrade_max_exp INT DEFAULT 20,
            materials       JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
    try {
        nk.sqlExec("ALTER TABLE game_talismans ADD COLUMN IF NOT EXISTS element TEXT DEFAULT 'metal'", []);
    } catch (e) {
    }

    // ── progression (key-value config) ──
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_config (
            key             TEXT PRIMARY KEY,
            value           JSONB NOT NULL DEFAULT '{}',
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);

    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_content_configs (
            id          TEXT PRIMARY KEY,
            payload     JSONB NOT NULL DEFAULT '{}',
            active      BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);

    // Published settings are immutable snapshots. Draft values can be edited in
    // remote_config_settings then published as the next release by backend ops.
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS remote_config_settings (
            module TEXT NOT NULL CHECK (module IN ('system', 'game_play')),
            key TEXT NOT NULL,
            value_type TEXT NOT NULL CHECK (value_type IN ('int', 'float', 'bool', 'string', 'json')),
            value TEXT NOT NULL,
            description TEXT DEFAULT '',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by TEXT DEFAULT '',
            PRIMARY KEY (module, key)
        )
    `, []);
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS remote_config_releases (
            config_version INT PRIMARY KEY,
            snapshot JSONB NOT NULL,
            min_app_version TEXT NOT NULL,
            latest_app_version TEXT NOT NULL,
            store_url TEXT NOT NULL DEFAULT '',
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            published_by TEXT NOT NULL DEFAULT 'system'
        )
    `, []);

    const defaultSettings: any = {
        system: {
            feature_unlocks: FEATURE_DEFAULTS,
            realm_milestones: REALM_MILESTONE_DEFAULTS,
            stage_sweep: SWEEP_DEFAULTS,
            tower_sweep: TOWER_SWEEP_DEFAULTS,
            min_app_version: "1.0.0", latest_app_version: "1.0.0",
            supported_languages: ["vi", "en"], default_language: "vi",
            stamina_regen_interval_sec: 300, stamina_regen_amount: 1,
            ads_enabled: false, ads_interval_sec: 120, payment_enabled: false,
            leaderboard_rewards: {"schema_version":1,"enabled":true,"claim_days":30,"boards":{"cultivation_realm":{"enabled":true,"tiers":[{"from":1,"to":1,"rewards":[{"type":"resource","id":"gems","amount":300},{"type":"resource","id":"gold","amount":100000},{"type":"item","id":"element_enlightenment_charm","amount":3}]},{"from":2,"to":2,"rewards":[{"type":"resource","id":"gems","amount":250},{"type":"resource","id":"gold","amount":90000},{"type":"item","id":"element_enlightenment_charm","amount":3}]},{"from":3,"to":3,"rewards":[{"type":"resource","id":"gems","amount":220},{"type":"resource","id":"gold","amount":80000},{"type":"item","id":"element_enlightenment_charm","amount":2}]},{"from":4,"to":4,"rewards":[{"type":"resource","id":"gems","amount":200},{"type":"resource","id":"gold","amount":75000},{"type":"item","id":"element_enlightenment_charm","amount":2}]},{"from":5,"to":5,"rewards":[{"type":"resource","id":"gems","amount":180},{"type":"resource","id":"gold","amount":70000},{"type":"item","id":"element_enlightenment_charm","amount":2}]},{"from":6,"to":6,"rewards":[{"type":"resource","id":"gems","amount":160},{"type":"resource","id":"gold","amount":65000},{"type":"item","id":"element_enlightenment_charm","amount":2}]},{"from":7,"to":7,"rewards":[{"type":"resource","id":"gems","amount":140},{"type":"resource","id":"gold","amount":60000},{"type":"item","id":"element_enlightenment_charm","amount":1}]},{"from":8,"to":8,"rewards":[{"type":"resource","id":"gems","amount":120},{"type":"resource","id":"gold","amount":55000},{"type":"item","id":"element_enlightenment_charm","amount":1}]},{"from":9,"to":9,"rewards":[{"type":"resource","id":"gems","amount":110},{"type":"resource","id":"gold","amount":50000},{"type":"item","id":"element_enlightenment_charm","amount":1}]},{"from":10,"to":10,"rewards":[{"type":"resource","id":"gems","amount":100},{"type":"resource","id":"gold","amount":45000},{"type":"item","id":"element_enlightenment_charm","amount":1}]},{"from":11,"to":50,"rewards":[{"type":"resource","id":"gems","amount":80},{"type":"resource","id":"gold","amount":35000},{"type":"item","id":"element_enlightenment_charm","amount":1}]},{"from":51,"to":200,"rewards":[{"type":"resource","id":"gems","amount":50},{"type":"resource","id":"gold","amount":25000},{"type":"item","id":"element_enlightenment_charm","amount":1}]},{"from":201,"to":500,"rewards":[{"type":"resource","id":"gems","amount":30},{"type":"resource","id":"gold","amount":15000}]}]},"campaign_stage":{"enabled":true,"tiers":[{"from":1,"to":1,"rewards":[{"type":"resource","id":"gems","amount":300},{"type":"resource","id":"gold","amount":100000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":15}]},{"from":2,"to":2,"rewards":[{"type":"resource","id":"gems","amount":250},{"type":"resource","id":"gold","amount":90000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":12}]},{"from":3,"to":3,"rewards":[{"type":"resource","id":"gems","amount":220},{"type":"resource","id":"gold","amount":80000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":10}]},{"from":4,"to":4,"rewards":[{"type":"resource","id":"gems","amount":200},{"type":"resource","id":"gold","amount":75000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":9}]},{"from":5,"to":5,"rewards":[{"type":"resource","id":"gems","amount":180},{"type":"resource","id":"gold","amount":70000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":8}]},{"from":6,"to":6,"rewards":[{"type":"resource","id":"gems","amount":160},{"type":"resource","id":"gold","amount":65000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":7}]},{"from":7,"to":7,"rewards":[{"type":"resource","id":"gems","amount":140},{"type":"resource","id":"gold","amount":60000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":6}]},{"from":8,"to":8,"rewards":[{"type":"resource","id":"gems","amount":120},{"type":"resource","id":"gold","amount":55000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":5}]},{"from":9,"to":9,"rewards":[{"type":"resource","id":"gems","amount":110},{"type":"resource","id":"gold","amount":50000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":4}]},{"from":10,"to":10,"rewards":[{"type":"resource","id":"gems","amount":100},{"type":"resource","id":"gold","amount":45000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":3}]},{"from":11,"to":50,"rewards":[{"type":"resource","id":"gems","amount":80},{"type":"resource","id":"gold","amount":35000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":3}]},{"from":51,"to":200,"rewards":[{"type":"resource","id":"gems","amount":50},{"type":"resource","id":"gold","amount":25000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":2}]},{"from":201,"to":500,"rewards":[{"type":"resource","id":"gems","amount":30},{"type":"resource","id":"gold","amount":15000},{"type":"random_item","pool":["talisman_fragment_1","talisman_fragment_2","talisman_fragment_3","talisman_fragment_4","talisman_fragment_5","talisman_fragment_6","talisman_fragment_7","talisman_fragment_8","talisman_fragment_9","talisman_fragment_10","talisman_fragment_11","talisman_fragment_12","talisman_fragment_13","talisman_fragment_14","talisman_fragment_15"],"amount":1}]}]},"combat_power":{"enabled":true,"tiers":[{"from":1,"to":1,"rewards":[{"type":"resource","id":"gems","amount":300},{"type":"resource","id":"gold","amount":100000},{"type":"item","id":"talisman_enhance_charm","amount":3}]},{"from":2,"to":2,"rewards":[{"type":"resource","id":"gems","amount":250},{"type":"resource","id":"gold","amount":90000},{"type":"item","id":"talisman_enhance_charm","amount":3}]},{"from":3,"to":3,"rewards":[{"type":"resource","id":"gems","amount":220},{"type":"resource","id":"gold","amount":80000},{"type":"item","id":"talisman_enhance_charm","amount":2}]},{"from":4,"to":4,"rewards":[{"type":"resource","id":"gems","amount":200},{"type":"resource","id":"gold","amount":75000},{"type":"item","id":"talisman_enhance_charm","amount":2}]},{"from":5,"to":5,"rewards":[{"type":"resource","id":"gems","amount":180},{"type":"resource","id":"gold","amount":70000},{"type":"item","id":"talisman_enhance_charm","amount":2}]},{"from":6,"to":6,"rewards":[{"type":"resource","id":"gems","amount":160},{"type":"resource","id":"gold","amount":65000},{"type":"item","id":"talisman_enhance_charm","amount":2}]},{"from":7,"to":7,"rewards":[{"type":"resource","id":"gems","amount":140},{"type":"resource","id":"gold","amount":60000},{"type":"item","id":"talisman_enhance_charm","amount":1}]},{"from":8,"to":8,"rewards":[{"type":"resource","id":"gems","amount":120},{"type":"resource","id":"gold","amount":55000},{"type":"item","id":"talisman_enhance_charm","amount":1}]},{"from":9,"to":9,"rewards":[{"type":"resource","id":"gems","amount":110},{"type":"resource","id":"gold","amount":50000},{"type":"item","id":"talisman_enhance_charm","amount":1}]},{"from":10,"to":10,"rewards":[{"type":"resource","id":"gems","amount":100},{"type":"resource","id":"gold","amount":45000},{"type":"item","id":"talisman_enhance_charm","amount":1}]},{"from":11,"to":50,"rewards":[{"type":"resource","id":"gems","amount":80},{"type":"resource","id":"gold","amount":35000},{"type":"item","id":"talisman_enhance_charm","amount":1}]},{"from":51,"to":200,"rewards":[{"type":"resource","id":"gems","amount":50},{"type":"resource","id":"gold","amount":25000},{"type":"item","id":"talisman_enhance_charm","amount":1}]},{"from":201,"to":500,"rewards":[{"type":"resource","id":"gems","amount":30},{"type":"resource","id":"gold","amount":15000}]}]}}},
            rewarded_ads: {
                schema_version: 2,
                placements: {
                    stamina_dialog_ad: {type: "stamina", amount: 5, daily_limit: 3},
                    daily_mission_talisman_fragment_ad: {type: "daily_fragment", amount: 1, daily_limit: 3},
                    card_reroll_ad: {type: "card_reroll", amount: 1, run_limit: 3},
                    combat_revive_ad: {type: "combat_revive", amount: 1, run_limit: 1},
                    stage_reward_x2_ad: {type: "stage_reward_x2", amount: 2, daily_limit: 5},
                    talisman_enhance_charm_ad: {type: "item", amount: 1, item_id: "talisman_enhance_charm", daily_limit: 1},
                    element_enlightenment_charm_ad: {type: "item", amount: 1, item_id: "element_enlightenment_charm", daily_limit: 1}
                },
                daily_mission: {completion_count: 3, fragment_quality: "low"}
            }
        },
        game_play: {
            boss_enrage_after_sec: 90, boss_enrage_hero_atk_per_sec: 0.01,
            regular_wave_warning_sec: 120, regular_wave_warning_delay_sec: 10,
            exp_to_level: [0, 1000, 2228, 5894, 13516, 26718, 47211, 76776, 117254, 170541, 238580, 323359, 426906, 551285, 698596, 870972, 1070576, 1299600, 1560264, 1854813, 2185519, 2554677, 2964606, 3417646, 3916159, 4462528, 5059155, 5708462, 6412889, 7174895, 7996957, 8881567, 9831236, 10848491, 11935873, 13095940, 14331265, 15644436, 17038054, 18514736, 20077111, 21727823, 23469528, 25304896, 27236610, 29267364, 31399865, 33636833, 35980999, 38435105, 41001905],
            element_upgrade_stones: [10, 25, 50, 100, 200]
        }
    };
    const typeOf = (value: any): string => {
        if (typeof value === "boolean") return "bool";
        if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
        if (typeof value === "string") return "string";
        return "json";
    };
    Object.keys(defaultSettings).forEach((module: string) => Object.keys(defaultSettings[module]).forEach((key: string) => {
        const value = defaultSettings[module][key];
        nk.sqlExec(`INSERT INTO remote_config_settings (module, key, value_type, value, description)
                    VALUES ($1, $2, $3, $4, 'Bootstrap setting') ON CONFLICT (module, key) DO NOTHING`,
            [module, key, typeOf(value), typeof value === "string" ? value : JSON.stringify(value)]);
    }));
    nk.sqlExec(`INSERT INTO remote_config_releases
                    (config_version, snapshot, min_app_version, latest_app_version, store_url, published_by)
                VALUES (1, $1::jsonb, '1.0.0', '1.0.0', '', 'system')
                ON CONFLICT (config_version) DO NOTHING`, [JSON.stringify(defaultSettings)]);

    const extensions = seedExtensionColumns();
    Object.keys(extensions).forEach(table => Object.keys(extensions[table]).forEach(column => {
        // Names/types come exclusively from the static allowlist above.
        nk.sqlExec(`ALTER TABLE game_${table} ADD COLUMN IF NOT EXISTS ${column} ${extensions[table][column]}`, []);
    }));
    logger.info("Game config tables created/verified.");
}

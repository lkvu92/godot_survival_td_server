function createGameConfigTables(nk, logger) {
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
  try {
    nk.sqlExec("DELETE FROM game_heroes WHERE id IN ('storm_sage', 'meteor_knight', 'glacier_lancer')", []);
  } catch (e) {
  }
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
            generic_skills  JSONB DEFAULT '[]',
            boss_skills     JSONB DEFAULT '[]',
            reward          JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS generic_skills JSONB DEFAULT '[]'", []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS attack_effects JSONB DEFAULT '[]'", []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS visual_scale REAL DEFAULT 0.364", []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS boss_visual_scale REAL DEFAULT 0.442", []);
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
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_skills (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            category        TEXT DEFAULT 'combat',
            skill_class     TEXT DEFAULT '',
            activation      TEXT DEFAULT 'auto',
            skill_type      TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            positioning     JSONB DEFAULT '{}',
            deployment      JSONB DEFAULT '{}',
            vfx_frames      JSONB DEFAULT '[]',
            criteria_unlock JSONB DEFAULT '{}',
            levels          JSONB NOT NULL DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
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
  }
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
  }
  try {
    nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS difficulty_levels JSONB DEFAULT '[]'", []);
  } catch (e) {
  }
  nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS is_boss BOOLEAN DEFAULT false", []);
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
  nk.sqlExec("ALTER TABLE game_effects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'", []);
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
  const defaultSettings = {
    system: {
      min_app_version: "1.0.0",
      latest_app_version: "1.0.0",
      supported_languages: ["vi", "en"],
      default_language: "vi",
      stamina_regen_interval_sec: 300,
      stamina_regen_amount: 1,
      ads_enabled: false,
      ads_interval_sec: 120,
      payment_enabled: false
    },
    game_play: {
      wave_duration_sec: 60,
      exp_to_level: [0, 100, 250, 450, 700],
      element_upgrade_stones: [10, 25, 50, 100, 200]
    }
  };
  const typeOf = (value) => {
    if (typeof value === "boolean") return "bool";
    if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
    if (typeof value === "string") return "string";
    return "json";
  };
  Object.keys(defaultSettings).forEach((module) => Object.keys(defaultSettings[module]).forEach((key) => {
    const value = defaultSettings[module][key];
    nk.sqlExec(
      `INSERT INTO remote_config_settings (module, key, value_type, value, description)
                    VALUES ($1, $2, $3, $4, 'Bootstrap setting') ON CONFLICT (module, key) DO NOTHING`,
      [module, key, typeOf(value), typeof value === "string" ? value : JSON.stringify(value)]
    );
  }));
  nk.sqlExec(`INSERT INTO remote_config_releases
                    (config_version, snapshot, min_app_version, latest_app_version, store_url, published_by)
                VALUES (1, $1::jsonb, '1.0.0', '1.0.0', '', 'system')
                ON CONFLICT (config_version) DO NOTHING`, [JSON.stringify(defaultSettings)]);
  logger.info("Game config tables created/verified.");
}

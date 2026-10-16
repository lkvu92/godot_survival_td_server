var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
const seedGameData = (ctx, logger, nk, payload) => {
  const data = JSON.parse(payload);
  const table = data.table;
  const rows = data.rows;
  if (!table) {
    return JSON.stringify({ error: "Missing table" });
  }
  if (table !== "config" && (!rows || rows.length === 0)) {
    return JSON.stringify({ error: "Missing table or rows" });
  }
  let inserted = 0;
  switch (table) {
    case "heroes":
      const heroIds = rows.map((r) => `'${r.id}'`).join(",");
      if (heroIds.length > 0) {
        try {
          nk.sqlExec(`DELETE FROM game_heroes WHERE id NOT IN (${heroIds})`, []);
        } catch (e) {
          logger.warn(`Could not prune obsolete heroes: ${e}`);
        }
      }
      for (const row of rows) {
        nk.sqlExec(`
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
          row.id,
          row.display_name,
          row.role || "",
          row.element || "",
          row.description || "",
          row.auto_basic_attack !== false,
          row.visual_scale || 1,
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
        nk.sqlExec(`
                    INSERT INTO game_enemies (id, display_name, element, attack_type, visual_scale, boss_visual_scale, exp,
                        is_boss, boss_scale, attributes, skills, attack_effects, generic_skills, boss_skills, reward)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, element=EXCLUDED.element,
                        attack_type=EXCLUDED.attack_type, visual_scale=EXCLUDED.visual_scale,
                        boss_visual_scale=EXCLUDED.boss_visual_scale, exp=EXCLUDED.exp,
                        is_boss=EXCLUDED.is_boss, boss_scale=EXCLUDED.boss_scale,
                        attributes=EXCLUDED.attributes, skills=EXCLUDED.skills, attack_effects=EXCLUDED.attack_effects, generic_skills=EXCLUDED.generic_skills,
                        boss_skills=EXCLUDED.boss_skills, reward=EXCLUDED.reward,
                        updated_at=NOW()
                `, [
          row.id,
          row.display_name,
          row.element || "",
          row.attack_type || "melee",
          row.visual_scale || 0.364,
          row.boss_visual_scale || 0.442,
          row.exp || 0,
          row.is_boss || false,
          row.boss_scale || 1,
          JSON.stringify(row.attributes || {}),
          JSON.stringify(row.skills || []),
          JSON.stringify(row.attack_effects || []),
          JSON.stringify(row.generic_skills || []),
          JSON.stringify(row.boss_skills || []),
          JSON.stringify(row.reward || {})
        ]);
        inserted++;
      }
      break;
    case "items":
      nk.sqlExec("DELETE FROM game_items WHERE id IN ('mat_wood','mat_water','mat_metal','mat_earth','stone_metal_high','talisman_meteorite_low','talisman_meteorite_medium','talisman_meteorite_high','talisman_heavenly_crystal_low','talisman_heavenly_crystal_medium','talisman_heavenly_crystal_high')", []);
      for (const row of rows) {
        nk.sqlExec(`
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
          row.id,
          row.display_name,
          row.description || "",
          row.category || "",
          row.rarity || "common",
          row.icon_id || "",
          row.stackable !== false,
          row.max_stack || 999,
          row.order || 0,
          row.expires_after_hours || 0,
          JSON.stringify(row.tags || []),
          JSON.stringify(row.attributes || {})
        ]);
        inserted++;
      }
      break;
    case "skills":
      for (const row of rows) {
        nk.sqlExec(`
                    INSERT INTO game_skills (id, display_name, category, skill_class,
                        activation, skill_type, description, positioning, deployment,
                        vfx_frames, criteria_unlock, levels)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, category=EXCLUDED.category,
                        skill_class=EXCLUDED.skill_class, activation=EXCLUDED.activation,
                        skill_type=EXCLUDED.skill_type, description=EXCLUDED.description,
                        positioning=EXCLUDED.positioning, deployment=EXCLUDED.deployment,
                        vfx_frames=EXCLUDED.vfx_frames, criteria_unlock=EXCLUDED.criteria_unlock,
                        levels=EXCLUDED.levels, updated_at=NOW()
                `, [
          row.id,
          row.display_name,
          row.category || "combat",
          row.skill_class || "",
          row.activation || "auto",
          row.skill_type || "",
          row.description || "",
          JSON.stringify(row.positioning || {}),
          JSON.stringify(row.deployment || {}),
          JSON.stringify(row.vfx_frames || []),
          JSON.stringify(row.createria_unlock || row.criteria_unlock || {}),
          JSON.stringify(row.levels || [])
        ]);
        inserted++;
      }
      break;
    case "stages":
      for (const row of rows) {
        nk.sqlExec(`
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
          row.id,
          row.arc_id,
          row.level || 1,
          row.display_name,
          row.description || "",
          row.order || row.sort_order || 0,
          row.exp_weight || 1,
          row.is_boss || false,
          row.background || "",
          row.music || "",
          JSON.stringify(row.enabled_if || {}),
          JSON.stringify(row.difficulty_levels || []),
          JSON.stringify(row.loot_table || [])
        ]);
        const waves = row.waves || [];
        nk.sqlExec("DELETE FROM game_stage_waves WHERE stage_id = $1", [row.id]);
        for (let i = 0; i < waves.length; i++) {
          const wave = waves[i];
          nk.sqlExec(`
                        INSERT INTO game_stage_waves (stage_id, wave_index, wave_id, display_name, entries)
                        VALUES ($1, $2, $3, $4, $5::jsonb)
                        ON CONFLICT (stage_id, wave_index) DO UPDATE SET
                            wave_id=EXCLUDED.wave_id, display_name=EXCLUDED.display_name,
                            entries=EXCLUDED.entries
                    `, [
            row.id,
            i,
            wave.wave_id || wave.id || "",
            wave.display_name || "",
            JSON.stringify(wave.entries || [])
          ]);
        }
        inserted++;
      }
      break;
    case "stage_levels":
      for (const row of rows) {
        nk.sqlExec(`
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
          row.id,
          row.stage_id,
          row.level_id,
          row.display_name || row.level_id,
          row.description || "",
          row.order || row.sort_order || 0,
          row.recommended_power || 0,
          row.exp_multiplier || 1,
          row.stamina_cost || 1,
          row.gold_reward || 0,
          JSON.stringify(row.enemy_modifiers || {}),
          JSON.stringify(row.loot_table || []),
          JSON.stringify(row.boss_loot_table || []),
          JSON.stringify(row.unlock_condition || {}),
          JSON.stringify(row.stage_rules || {}),
          JSON.stringify(row.ui || {})
        ]);
        inserted++;
      }
      break;
    case "arcs":
      for (const row of rows) {
        nk.sqlExec(`
                    INSERT INTO game_arcs (id, display_name, description, level_min, level_max,
                        element, sort_order, enabled_if, stage_ids)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        level_min=EXCLUDED.level_min, level_max=EXCLUDED.level_max,
                        element=EXCLUDED.element, sort_order=EXCLUDED.sort_order,
                        enabled_if=EXCLUDED.enabled_if, stage_ids=EXCLUDED.stage_ids
                `, [
          row.id,
          row.display_name,
          row.description || "",
          row.level_min || 1,
          row.level_max || 10,
          row.element || "",
          row.order || row.sort_order || 0,
          JSON.stringify(row.enabled_if || {}),
          JSON.stringify(row.stage_ids || [])
        ]);
        inserted++;
      }
      break;
    case "cards":
      for (const row of rows) {
        nk.sqlExec(`
                    INSERT INTO game_cards (id, display_name, card_type, rarity, icon_id,
                        description, effect_description, effect)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, card_type=EXCLUDED.card_type,
                        rarity=EXCLUDED.rarity, icon_id=EXCLUDED.icon_id,
                        description=EXCLUDED.description, effect_description=EXCLUDED.effect_description,
                        effect=EXCLUDED.effect
                `, [
          row.id,
          row.display_name,
          row.card_type || "",
          row.rarity || "common",
          row.icon_id || "",
          row.description || "",
          row.effect_description || "",
          JSON.stringify(row.effect || {})
        ]);
        inserted++;
      }
      break;
    case "effects":
      for (const row of rows) {
        const metadata = __spreadValues({}, row);
        delete metadata.id;
        delete metadata.display_name;
        delete metadata.description;
        delete metadata.default_props;
        nk.sqlExec(`
                    INSERT INTO game_effects (id, display_name, description, default_props, metadata)
                    VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        default_props=EXCLUDED.default_props, metadata=EXCLUDED.metadata
                `, [
          row.id,
          row.display_name,
          row.description || "",
          JSON.stringify(row.default_props || {}),
          JSON.stringify(metadata)
        ]);
        inserted++;
      }
      break;
    case "talismans":
      for (const row of rows) {
        const numericId = Number(row.id || 0);
        const qualityTier = numericId <= 15 ? "H\u1EA1 ph\u1EA9m" : numericId <= 25 ? "Trung ph\u1EA9m" : "Th\u01B0\u1EE3ng ph\u1EA9m";
        const elementOrder = ["metal", "wood", "water", "fire", "earth"];
        const normalizedElement = row.element || elementOrder[Math.max(0, numericId - 16) % elementOrder.length];
        nk.sqlExec(`
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
          row.id,
          row.name || row.display_name || "",
          qualityTier,
          normalizedElement,
          row.type || "attack",
          row.level || 1,
          row.max_level || 30,
          row.is_equipped === true,
          row.description || "",
          row.skill || "",
          JSON.stringify(row.stats || {}),
          row.upgrade_exp || 0,
          row.upgrade_max_exp || 20,
          JSON.stringify(row.materials || [])
        ]);
        inserted++;
      }
      break;
    case "store_catalog":
      nk.sqlExec("UPDATE game_store_products SET active = FALSE, updated_at = NOW()", []);
      for (const row of rows) {
        const rewards = Array.isArray(row.rewards) ? row.rewards : [];
        if (!row.product_id || !row.id || rewards.length === 0) {
          return JSON.stringify({ error: `Invalid store product: ${row.product_id || row.id || "unknown"}` });
        }
        for (const reward of rewards) {
          if (!reward.reward_type || !reward.reward_id || Number(reward.quantity || 0) <= 0) {
            return JSON.stringify({ error: `Invalid reward in product ${row.product_id}` });
          }
          if (reward.reward_type === "item" && nk.sqlQuery("SELECT id FROM game_items WHERE id = $1", [reward.reward_id]).length === 0) {
            return JSON.stringify({ error: `Unknown item ${reward.reward_id} in product ${row.product_id}` });
          }
          if (reward.reward_type === "hero" && nk.sqlQuery("SELECT id FROM game_heroes WHERE id = $1", [reward.reward_id]).length === 0) {
            return JSON.stringify({ error: `Unknown hero ${reward.reward_id} in product ${row.product_id}` });
          }
        }
        nk.sqlExec(`
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
          row.product_id,
          row.id,
          row.tab_id || "",
          row.name || row.title || row.id,
          row.desc || row.subtitle || "",
          row.badge || "",
          row.icon_type || "pack",
          row.icon_key || "",
          row.price || row.display_price || "",
          "inapp",
          row.fulfillment_type || "consumable",
          row.active === true,
          row.unique_purchase === true,
          Number(row.purchase_limit || 0),
          row.purchase_limit_period || "",
          JSON.stringify(row)
        ]);
        nk.sqlExec("DELETE FROM game_store_product_rewards WHERE product_id = $1", [row.product_id]);
        rewards.forEach((reward, index) => nk.sqlExec(`
                    INSERT INTO game_store_product_rewards
                        (product_id, line_no, reward_type, reward_id, quantity, metadata)
                    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
                `, [
          row.product_id,
          index + 1,
          reward.reward_type,
          reward.reward_id,
          Number(reward.quantity),
          JSON.stringify(reward.metadata || {})
        ]));
        inserted++;
      }
      break;
    case "content_configs":
      for (const row of rows) {
        if (!row.id || !row.payload) return JSON.stringify({ error: "Invalid content config" });
        nk.sqlExec(`
                    INSERT INTO game_content_configs (id, payload, active, updated_at)
                    VALUES ($1, $2::jsonb, $3, NOW())
                    ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,
                        active=EXCLUDED.active, updated_at=NOW()
                `, [row.id, JSON.stringify(row.payload), row.active !== false]);
        inserted++;
      }
      break;
    case "config":
      nk.sqlExec(`
                INSERT INTO game_config (key, value)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
            `, [data.config_key || "progression", JSON.stringify(data.config_value || {})]);
      inserted = 1;
      break;
    default:
      return JSON.stringify({ error: `Unknown table: ${table}` });
  }
  logger.info(`Seeded ${inserted} rows into ${table}`);
  return JSON.stringify({ success: true, table, inserted });
};

# C158 — Arc 3 wood creep skills

- Version: `1.1.3`
- Status: `ACTIVE`
- Updated: `2026-10-24`

## Authoritative skill data

- `spore_crawler`, `thorn_spitter`, `venom_spider`: `tia_doc` (`wood_bolt`), 100% ATK on impact plus 10% caster ATK poison DPS.
- `ent_protector`: `day_leo_hut_mau` (`wood_vine`), 100% ATK, root for 3s, 10% caster ATK poison DPS, and 20% direct-damage life steal.
- `ancient_treant`, `poison_hydra`: `van_doc_xich_dang` (`wood_swamp`), 4s AOE poison pool, vapor, four 50% thorn strikes at 2s, four 10% bursts, and 2% maximum-HP poison per second.
- `poison_hydra`: `u_hon_phe_cot` (`wood_soul`), eight homing 35% skulls after 4s; each impact has a 15% AOE burst, direct poison, and a 2s 2%-maximum-HP corrosion pool.

`poison_percent` is a harmful timed dot with `hp_percent_per_sec`; it remains independent from stacking ordinary `poison`.

## Balance schema and integration v1.1.3

Authoritative `server/data/enemies.json` seeds `game_enemies`:
- Both bosses: `boss_skills[id=van_doc_xich_dang]` uses numeric
  `initial_cooldown: 3`, `range: 500`.
- Hydra: `boss_skills[id=u_hon_phe_cot]` uses `initial_cooldown: 3`,
  `range: 600`, `explosion_multiplier: 0.15` (fraction of caster ATK).
- Hydra: `generic_skills[id=regeneration].params.percent_max_hp_per_sec: 0.005`.
  This is the generic regeneration component; base regen_percent_per_10s remains unchanged.

Existing seed RPC request `{table:"enemies",rows:[{id,boss_skills,generic_skills,...}]}`
returns `{success:true,inserted:N}`. Authenticated config bootstrap and existing
Enemy/CreepFireCast interfaces consume these fields without payload changes.
C121 applies: missing/invalid config or network blocks gameplay; no local fallback.
Presentation uses existing AtlasRegistry assets/signals with no UI or VFX changes.
Seed publication is required before online behavior reflects this update.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.3 | 2026-10-24 | Both swamps: initial cooldown 3s, range 500. Hydra souls: range 600, initial cooldown 3s, explosion 15% ATK. Hydra generic regeneration 0.5% max HP/s. |

- `1.1.2` (2026-10-23): Eight skull visuals appear immediately at distinct radial positions; each remains stationary until its launch_at, starting at 4s with skull_launch_interval 0.15s. Preserve 35% direct hit and speed 540.
- `1.1.1` (2026-10-23): U Hon Phe Cot now has skull_count 8, 35% direct ATK per skull and speed 540 (was 360); independent explosion damage remains 25% ATK. Eight evenly spaced spawn positions preserve four-second charge and existing poison.

- `1.1.0` (2026-10-22): Compact the four wood-swamp thorns around the target. `ancient_treant` uses `thorn_offset: 40`, `thorn_diameter: 120`; `poison_hydra` uses `thorn_offset: 45`, `thorn_diameter: 135`. Both supply `thorn_vertical_ratio: 0.55`. The four anchors form a ground-plane ellipse at center plus `(side_x * thorn_offset, side_y * thorn_offset * thorn_vertical_ratio)`. `thorn_diameter` controls presentation size only. Existing AOE radius, thorn collision radius, damage, effects and timings remain unchanged. Existing authenticated config RPC carries these fields; no new endpoint or local gameplay fallback.

- `1.0.0` (2026-10-21): Added Arc 3 wood creep skill data and percent-HP poison status.

Presentation anchors use the target rendered foot offset (snapshot at cast start), while damage positions remain the configured center/corners. Two rear vines render at z3 (above map, below player sprite z5); front vines at z65. Root anchors use authored lower-left .30/.94, mirrored .70/.94 on the right. The pool ground renders at z1 above background.

v1.1.0 acceptance: focused wood presentation tests and OpenGL capture PASS (four compact roots around rendered feet, mirror/depth, transformed sprite foot snapshot, unchanged damage event centers/radii and four bursts). Full creep regression and client/server static suites PASS. Two existing local wood_swamp dictionaries synchronized and read back, all other DB fields unchanged; production not deployed.


v1.1.3 acceptance: server static suite PASS; full enemy seed comparison confirms
only requested fields changed. Existing client reads initial_cooldown and skill
parameters. Gate score 9/10. DB publication and live gameplay not performed.

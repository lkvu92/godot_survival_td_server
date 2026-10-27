# C221 — Arc 6 Ngũ Tố Quy Khư

- Version: 1.1.1
- Status: IN_PROGRESS
- Updated: 2026-10-26
- Owner: Gameplay / Presentation / Backend

## Contract

Implementation plan: `docs/ARC6_NGU_TO_QUY_KHU_PLAN.md`. Arc 6 adds catalog content using the existing campaign engine. Seed inputs live only in server/data. Runtime requires authenticated published server config; missing/invalid config or network blocks entry and mutations. No offline gameplay/reward fallback.

## Data schema

`arcs`: existing fields, id `arc_ngu_to_quy_khu`, order 6, stages 6-01…6-10, display levels 51–60, valid existing element key as presentation compatibility only. Individual creeps retain their five-element assignments.

`enemies`: 15 isolated variants, `id=arc6_<source>`, copied attributes, attacks and original generic skills plus exactly one nonduplicate supported generic skill. Explicit `arc6_role`, `source_enemy_id`, `balance_reference_level=55` midpoint authoring metadata. Two separate boss definitions use Wraith casts (2/4 skills). No original enemy changed.

`stages`: 10 stages, 20 authored waves, existing entries `{enemy_id,count,interval,start_delay,boss?,modifiers}`. Seeded independent categorical choice at 20% per element, generated once in catalog. Six opening waves have no tanks. Wave 20 boss only at stages 5/10. Existing campaign pressure and difficulty computation remain authoritative.

`stage_levels`: 30 existing-schema difficulty rows; independent rune group uses equal weights 20 across five elements. EXP uses existing per-wave budget and 75/25 boss/minion share. Display level and combat calibration reference level are separate.

Arc 6 continues the established Arc 3–5 creep-stat pipeline. Each stage has a level-specific reference `51..60` and an authored Normal curve `{wave_1,wave_20}`. A regular entry linearly interpolates one shared multiplier and applies it equally to base `hp`, `atk`, and `def`; `speed_mul=0.75`. Runtime applies Epic/Legend exactly once. The curve continues Arc 5 from `6.75→8.40` at stage 6-01 through `9.00→11.50` at stage 6-10. Boss HP/DEF use the stage W20 multiplier; Wraith ATK alone uses the documented `0.45` multi-hit role coefficient. Recommendation rows are retained but marked for balance re-audit after this combat change.

Presentation assets are accessed through AtlasRegistry; reuse source animation manifests for variant IDs. Background/sweep/boss use the user-provided Arc 6 assets.

## Interfaces and RPC payloads

No new RPC or player storage schema. Existing `get_game_config` request/response modules (`arcs`, `enemies`, `stages`, `stage_levels`, `progression`) carry the new rows. Existing campaign start/result/sweep payloads retain `{stage_id,level_id}` and server validation. Generator exposes check/write and a deterministic build API. Runtime WaveManager/DataRegistry interfaces remain unchanged.

## Gates

Unique IDs/references, 200 waves/30 levels, correct roles/elements/extra skills, deterministic generation and idempotence, preserved old catalog, valid EXP and loot, static suites/backend build, Godot fixture-based integration of stats/pressure/difficulty/atlas/spawn/resume/boss. Runtime balance evidence is distinguished from structural correctness. Production publication is a separate operation.

Runtime recommendation evidence uses mortal full20-wave fixtures and a documented deterministic range-management policy; three seeds per hero are reference checks, not a population win-rate estimate or minimum-power search. `stage_levels.stage_rules.recommendation` stores the measured reference level/model/sample count. Generator rejects stale catalog digests or incomplete/insufficient reference lanes. Global static-gate baseline stamina mismatches are tracked explicitly; do not mark ACTIVE merely because feature-local checks pass.

## Changelog

|Version|Date|Change|
|---|---|---|
|1.1.1|2026-10-27|Normalize the three Arc 6 water/ice variants to their source frozen-realm rendered scale after the Arc 6 1.6 presentation multiplier.|
|1.1.0|2026-10-27|Replace the fixed Lv35 and split 0.55/0.15/0.70 tuning with the Arc 3–5 shared HP/ATK/DEF pipeline. Arc 6 stages now calibrate at Lv51–60 (stage 6-05 = Lv55), linearly continue the Arc 5 curve, and flag prior recommendations for runtime re-audit.|
|1.0.1|2026-10-27|Compensate Arc 6's 1.6 presentation multiplier on copied Arc 2 roster members so their final rendered scale matches Arc 2.|
|1.0.0|2026-10-26|Initial approved Arc 6 plan, existing-engine content contracts and acceptance gates.|

# C239 Levelled enemies and shared skill atlas

Version: 1.6.4 | Status: IN_PROGRESS | Date: 2026-11-04

## Scope and authority
Version 2 is opt-in per stage.stage_rules.enemy_framework_version. Legacy stages retain their original spawn/stat generation. Damage resolution for every stage is shared under C240. Authoritative catalog is progression.enemy_framework, transported by the existing authenticated config bootstrap RPC (request {table:"all"}; response progression includes enemy_framework). Existing game_config progression seed path is reused. No new RPC, local gameplay fallback, profile mutation or production publication. Test-only fixtures may load explicit server data in the existing harness.

## Schema
enemy_framework = {version:2,max_level:200,species:{id:{visual_definition_id,base_attributes,growth_per_level}},skill_atlas:{id:{id,element,kind,levels:[{level,damage_multiplier,cooldown,range,radius,slow_percent,slow_duration,hp_multiplier}]}}}. Species have no element or learnable-skill list. Species attributes use base+(level-1)*growth. Visual references provide presentation only; rewards are explicit on species. Stage entries have species_id, level, elements OR random_elements:{pool,weights,count}, skills:[{skill_id,level}], count, interval, start_delay and optional difficulty_overrides keyed normal/epic/legend. No stat overrides or legacy combat multipliers on v2 entries. Growth never derives from hero stats.

## Interfaces and combat
EnemyFramework.compile_stage(stage, catalog, enemy_definitions, difficulty, seed) returns {ok,waves,error}; invalid data blocks admission. compile_entry creates a spawn descriptor per individual during loading. SharedSkillService.learnable filters the global atlas solely by element; resolve and cast accept any combat actor, skill ID and level. Skills have fixed element and damage=live caster ATK*level coefficient. Passive max_hp and direct/area damage with optional slow are initial executors. Native legacy skills resolve through their existing specialized Enemy adapters; no species skill allowlist.

Elements use the C240 global damage pipeline and immutable 32x32 lookup built from the authoritative server matrix. Defender selects its safest element; fixed-element skills use their own singleton attack mask. Neutral basic attacks use 1.0 and no elemental affinity modifiers. Empty defenders receive 1.3 from five-element attacks; all-five defenders receive 1.0. Damage rules apply to all actors/modes, independent of stage framework version. Only levelled spawning/catalog admission remains opt-in.

Random elements use a private seeded RNG, unique weighted draws per spawn. Compile metadata stores stage seed and individual descriptor for resume. Resume re-resolves descriptors against current server catalog, never trusts cached attributes or skill payload. Pooled actors clear v2 fields/cooldowns. No node preallocation for the complete stage. Stat buffs remain live.

## Pilot and acceptance
Test fixture clones stage_7_05 into a separate test arc with equivalent formation/count/timing/EXP. Three difficulty levels replace legacy multipliers. Seed profiles exercise empty, singleton, dual and all-five elements. No campaign arc or recommended_power is migrated. Compare baseline and pilot on 5 heroes x 3 difficulties x 5 seeds (150 total), mortal full20 waves, ordinary offered cards, deterministic kite policy and Lv60 no gear/affinity. Additional level -5/+5 lanes establish level sensitivity. Target: level increases monotonically increase authored HP/ATK/DEF, runtime lane effects reported rather than assumed; no invalid configuration/runtime errors or timeouts; clear rate and timing differences reported, no claim of equivalent balance without evidence. Performance: compile <250 ms and peak process memory/frame statistics compared observationally, headless accelerated runs do not certify mobile budgets.

## Gates
Unit/runtime tests cover growth, invalid input, all 1024 element pairs, skill element overrides, shared player/enemy casts, deterministic random selection, difficulty exactly once, pooling and resume. Both static suites and backend build required. Acceptance report records failures and leaves status IN_PROGRESS if global gates or balance acceptance remain unresolved. No bulk migration before report review.

## Creep/boss atlas migration 1.2

Canonical authoring input is server/data/creep_boss_skill_atlas.json, transported inside progression.enemy_framework.skill_atlas with enemy_skill_bindings. All inline attacks, boss casts/passives and generic traits are catalogued and deduplicated by complete behavior plus fixed element. Existing enemy JSON fields are generated compatibility projections, checked against the canonical source; they are not independent balance sources. Bindings contain skill_id/level and preserve legacy executor IDs. Runtime resolves bindings before Enemy setup. Native executor payloads preserve targeting, windup, projectile, passive/trigger and multi-component behavior. No production publication, automatic stage-v2 migration, hero migration or pet-learning UI. Missing references/unsupported payloads reject admission, never silently use stale projections.

Native atlas entries use kind=native, executor=enemy_cast|enemy_trait, fixed element, and explicit levels with payload dictionaries. Existing authored behavior is level 1; levels 2-5 increase direct damage coefficients by 10% per level while preserving geometry/cooldown/control timing. Traits without damage remain unchanged until separately tuned. Legacy bindings stay level 1. Native skills can be equipped by v2 stage references and materialize into the existing actor adapters; stat/damage math still uses C240. Player/pet learning UI and actor-specific passive execution adapters remain separately scoped. All generic neutral traits are universally eligible.

Acceptance requires exact level-1 projection parity for every enemy, deduplication, deterministic regeneration, negative reference/level/element tests, native v2 compile routing, runtime boss regressions, both static suites and backend build. Generated metadata and local fixtures must never change player state.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.4.0 | 2026-10-30 | Complete Arc 1 local migration, independent species growth, random primary element plus 10% dual-element creeps, explicit element loadouts, native basic casts, persistent inline icons, lifecycle and UI evidence. Balance is a later phase per user instruction. |
| 1.2.0 | 2026-10-30 | Migrate all creep/boss definitions into a canonical shared atlas with explicit level bindings, native executor adapters and verified compatibility projections. |
| 1.1.0 | 2026-10-30 | C240 supersedes pilot-only damage policy: global server-matrix lookup, confirmed neutral basics; spawn v2 remains opt-in. |
| 1.0.0 | 2026-10-30 | New levelled species, shared element-filtered skill atlas, compiled spawn descriptors, multi-element lookup and isolated runtime pilot. |

## Acceptance 2026-10-30
Runtime 1,097 checks PASS; client/server static suites PASS; backend build PASS; 150 paired benchmark + 30 sensitivity cases technical PASS with source fingerprints. See [acceptance](../reports/C239_ACCEPTANCE.md). ACTIVE covers the opt-in framework and isolated pilot; broad migration remains REVIEW_REQUIRED. No production/DB writes. Optional PostgreSQL suites were not configured.

## Migration acceptance 2026-10-30

165 deduplicated native definitions, 305 enemy bindings and 99 projected enemy definitions; all have five levels. Element correction: ice skills use water. Existing legacy bindings may differ from actor element; stage-v2 admission enforces eligibility. Native execution currently targets Enemy adapters; pet/hero adapters remain future work. Production publication and stage rollout are separate. See `docs/reports/C239_ATLAS_MIGRATION.md`.

## 1.3 pilot rollout

Use migrated native skill bindings in the real pilot, preserve count/timing/EXP, validate species roles, show every defensive element, rerun 150 paired cases plus 30 sensitivity cases before tuning and single-stage rollout. Production publication remains a separate release.

## Arc 1 migration 1.4

Scope: all 10 stages of order-1 arc `arc_2` (`stage_flame_frontier`, `stage_2_02`..`stage_2_10`). Canonical migration authoring input `server/data/c239_arc1_migration.json` contains explicit species and complete stage wave definitions; local installer transports these into game_config.progression and game_stages/game_stage_waves. Existing legacy seed waves remain reference inputs for count/timing/EXP parity, not runtime fallback. No new RPC. Preserve other arcs, stage IDs, unlocks, loot, EXP, recommended_power and player data. Local publication is authorized; production excluded.

Creeps choose a uniformly random primary five-element at loading; independently 10% choose one distinct secondary element. `random_elements.second_element_chance` is a per-individual probability, not a guaranteed quota per wave. `skills_by_element` explicitly selects equipped IDs/levels/slots by primary element; no automatic skill recoloring or species allowlists. Native basic is neutral and explicit. Bosses retain fixed authored fire loadouts; HP/ATK/DEF use independent base+(level-1)*growth. Difficulty changes levels and skill levels only.

Technical gates: 10 stages x 3 difficulties compile/spawn/resume, seed reproducibility and isolation, probability distribution, field validation, pool reset, all fixed-element skills eligible, live ATK damage, basic cast once, local DB readback and authenticated config admission, inline icon screenshot evidence including dual-element and boss. Balance/clear rate is observational and must not block migration (user instruction supersedes old pilot balance gates). Server EXP cap must account for explicit v2 entry.exp.

## Arc 1 acceptance 2026-10-30

Arc 1 local migration: technical PASS, 10 stages / 185 authored waves, 28,289 mechanism checks, 30/30 full-wave technical runs, authenticated config admission and rendered Main/HUD screenshot. See `docs/reports/C239_ARC1_ACCEPTANCE.md` and `C239_ARC1_RUNTIME.json`. ACTIVE here certifies the implemented framework and Arc 1 local rollout; other arcs and production remain separately scoped. User instruction defers balance to the final phase, superseding older pilot balance gates.

## UI and early-arc correction 1.4.1

Per user correction: preserve the original creep HP bar and primary element anchor. Extra icons extend LEFT on the same baseline. Boss primary stays in its existing HUD badge; extra owned elements form one horizontal row immediately below the boss HP bar. Do not add a world-space boss element bubble. Arc 1 creeps are single-element with their prior element distribution; dual-element spawning is allowed only from campaign order 6. The previous 1.4 uniform/10%-dual Arc 1 rollout and screenshots are superseded by this correction.

Correction acceptance: see docs/reports/C239_UI_ELEMENT_CORRECTION.md. Arc 1 preserves the exact legacy 70%-arc/30%-authored distribution (all current Arc 1 species are fire), with zero dual creeps. Restored creep anchors and boss secondary HUD rows have rendered evidence.

## Compact element groups 1.4.2

User-requested AvatarGroup-small style spacing: 30px icons overlap by 12px (18px center step). Creep extras extend left from the unchanged primary anchor; boss extras remain a horizontal group below the HP bar. No data, spawn or damage change.

## Boss secondary element anchor 1.4.3

Align secondary elements to the left under the boss HP fill, following the user annotated reference. Keep the primary badge unchanged and retain compact 18px icon steps.

## Half-overlap element groups 1.4.4

User requests 50% overlap: 30px element icons use a 15px center step. Creep extras remain left of the original primary anchor; boss extras retain the approved left-aligned position below its HP bar.

## Campaign arcs 2-7 migration 1.5

Migrate all 60 stages of campaign orders 2-7 using ARC_CREATION_WORKFLOW.md. Each stage preserves its wave structure, counts, timing, EXP, loot and unlocks, with independent species growth and fixed-element atlas skills. Arcs 2-5 use one element with legacy distribution; Arc 6-7 may use independent 10% dual-element creeps. Keep boss-specific executors and neutral basic rules. Validate each arc across three difficulties, native execution, resume, pooling, server EXP and UI before local installation. No production publication; balance is a separate later phase.

### Campaign authoring and transport details

Arc 1?5 use separate generators; Arc 6?7 share `arc67_levelled_catalog.cjs`. Explicit `loadout_template_id` references deduplicated fixed-element skill maps in `enemy_framework.loadout_templates`; every branch is validated before configuration admission. Arc 6 reuses the same species base and growth as earlier arcs and selects only catalog-whitelisted `presentation_variants`. Native B?ch H? skills remain metal and Chu T??c skills remain fire; a boss element change must use separately authored compatible skills, never recolor a skill.

Local installers are scoped to one arc and update the shared framework catalog. The authenticated `--campaign` readback checks all 70 stages. Full-wave immortal runs are technical evidence only; balance and production deployment remain separate.

## C239 1.6 ? Role baselines and multi-element boss stats

Campaign enemy balance uses a server-authored immutable role baseline and a fixed-element boss baseline; these are initially derived from the five hero level-1 values agreed by the user, but are stored independently and never read hero attributes at runtime. Creep roles tank, damage, ranger, medium and runner use respectively HP/ATK/DEF/ATK SPD/SPD baselines (88,2.6,3,0.775,145), (18,6,0.25,0.725,147.5), (23.5,2.4,1.2,1.5,142.5), (48,2.3,1,0.75,224), (37,1.25,0.3,1.56,268). HP/ATK/DEF grow linearly as base ? level; attack speed, movement speed and range do not multiply with level. Species own role and presentation.

Boss baseline by element stores HP/ATK/DEF/ATK SPD/SPD: earth=(3520,5.2,22.5,1.86,290), fire=(2880,6,7.5,1.74,295), metal=(3760,4.8,18,1.8,285), water=(3840,4.6,15,1.8,280), wood=(2960,5,9,2.34,335). A boss with multiple elements takes the maximum per stat across its declared elements, independently of element order; then multiply HP/ATK/DEF by boss level. Fixed skill elements, C240 matchup, spawn policies and HUD remain unchanged. Boss baseline data are authoritative and validated; missing/neutral-only boss elements are invalid for this balance profile.

Creep levels increase every five waves. Boss base level is the maximum stage level of its arc; the boss level stays fixed at the arc maximum in all difficulties; skill levels still increase. Stage and required account levels are linearly interpolated and rounded over ten stages. This design is opt-in and does not change other game modes. Existing C239 incompatibilities in prior sections are superseded for campaign role balance only. Benchmark gameplay after implementation; technical acceptance is not a balance claim.

## Changelog 1.6.0 ? 2026-10-30

- Add independent role baselines and authoritative per-element boss baselines; multi-element bosses choose per-stat maxima.
- Migrate Arc 1?7 stage and account-level ranges, wave levels, fixed arc-max boss levels, local deployment and stage access checks.
- Local tests and observed boss timeout are documented in `docs/reports/C239_ROLE_BALANCE_LOCAL.md`; balance remains open.

## Changelog1.6.1 — 2026-11-02 seed compatibility fix

Generic legacy stages seed must preserve already-deployed v2 stage rows, waves and extension metadata rather than overwrite waves while leaving v2 rules. Report preserved_levelled in seed result; no automatic production migration. Recheck native stage lock inside the atomic seed transaction to reject a concurrent legacy downgrade. Explicit v2 authoring rejects legacy override fields in every difficulty branch before writes. Existing local catalog corruption is repaired from canonical migration inputs with backup/CAS; player and finance data untouched.

Changelog 1.6.2 (2026-11-03): C252 moves client bulk parse/validation to worker, pure element-matrix validation and opt-out of live matchup prepare for admission only. Gameplay/default compilation and authority rules unchanged; desktop regressions PASS.


## C259 authoring authority - 1.6.3 (2026-11-04)

For migrated catalogs, C259 supersedes JSON-first authoring and the earlier no-new-RPC/publication scope. Enemy tables and immutable releases author the existing progression.enemy_framework runtime projection. Optional species.element_baselines takes precedence over the initial global boss baseline; import copies identical values, preserving math. Optional catalog_version identifies the published snapshot. Stage species_id projection and C239/C240 combat behavior remain compatible. Client presentation_assets resolve only through registered AtlasRegistry sources. See [C259](C259_ENEMY_CATALOG_ADMIN.md) and [operator guide](../ENEMY_CATALOG_ADMIN.md).

Changelog 1.6.3 (2026-11-04): DB authoring authority, independent per-boss baseline override, published catalog version and registered presentation assets; baseline migration preserves all existing framework parameters and wave entries.


## Changelog 1.6.4 (2026-11-04)

C259 neutral presentation IDs receive empty legacy binding records and retain explicit v2 stage loadouts. Arc 7 legacy catalog admission runs only for legacy Arc 7 stages; v2 stages use the already-completed framework admission checks. Legacy regression still rejects a missing elemental compatibility definition. No combat math changes.

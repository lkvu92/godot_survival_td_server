# C237 ? Arc 7 Van Yeu Co Linh

- Version: 1.4.0
- Status: ACTIVE
- Updated: 2026-10-29

## Scope and canonical plan

Canonical design: ../ARC7_VAN_YEU_CO_LINH_PLAN.md.
10 stages, 20 waves each; seven creep archetypes, Bach Ho boss stage 5 and Chu Tuoc boss stage 10. Fixed hero Lv60 balance reference. Seeded five-element variants, 15 authored attacks and 30 source VFX sheets. Implemented with server catalog, guarded runtime casts, presentation registration and measured Lv60 acceptance.

## Schema and interfaces

Existing server-authoritative enemies/stages/stage_levels/arcs modules carry the catalog. Enemy fields: id, element, attributes, generic_skills, boss_skills, balance_reference_level. Stage fields: id, arc_id, waves, stage_rules. Wave entries: enemy_id, count, interval, start_delay, modifiers. Proposed arc7_version and generation_seed belong to stage_rules; balance_reference_level is 60. New skill parameter schemas must be specified before runtime implementation.

Use existing authenticated bootstrap and stage RPC request/response contracts with stage_id and level_id. No new RPC or profile schema in v1. DataRegistry consumes validated config; WaveManager resolves entries; Enemy/boss scheduler executes skills; AtlasRegistry supplies all presentation resources. Randomness is materialized in the catalog and persists through resume.

## Presentation assets (implemented)

AtlasRegistry exposes arc_background_7 using assets/bg/arc7_van_yeu_co_linh_bg.jpg (572x1024), and get_sweep_background(arc_van_yeu_co_linh) using assets/ui/clear-map-widget/van-yeu-co-linh.png (512x170). Preserve the previous arc7_bg.jpg. All ten stages share the forest background in v1; stage catalog now references the forest background. Built-in imagegen produced both assets; originals are retained. Attribute pipeline audit and generation prompts are recorded in the canonical plan and ARC7_ASSET_REPORT.md.

## Runtime schema v1.2

Arc7 attack/boss skill types are beast_melee, beast_dash, beast_bolt, tiger_claw, tiger_pounce, tiger_roar, tiger_bloodline, vermilion_volley, vermilion_sweep, vermilion_rain, vermilion_domain. Creep motif is distinguished by id C01..C07. Required finite fields: radius>0, damage_multiplier>=0, warning_time>=0, recovery>=0. Dash adds dash_distance>0,dash_duration>0; projectile adds projectile_speed>0,projectile_lifetime>0,hit_radius>0; boss skills add id, cooldown>0, initial_cooldown>=0,range>0. Rain uses three deterministic locked points and fall_interval; domain uses inner_radius<radius,duration,tick_interval,dot_multiplier. Optional hp_below_pct gates the one-shot B04; basic=true identifies the ordinary attack among four boss skills. Telegraph belongs to Arc7Cast, not the old boss warning scheduler. Concurrent Arc7 casts on one actor are disallowed.

Generic beast_bloodline params: hp_below_pct=.30, atk_multiplier=1.35,move_speed_multiplier=1.15,max_triggers=1,duration_seconds=null; manual_activation=true for B04 only. debuff_resistance duration_multiplier=0 and effect_ids=[root] uses the existing selective control path. Bloodline is permanent until death/pool reset and never heals. Serialized generic_skill_spent prevents retrigger after resume.

Arc7Cast stores skill, elapsed, attack snapshot, origin/locked center/direction, fired event IDs, missile positions/lifetimes, hit target IDs per wave, domain tick state and dash state. Enemy run state includes arc7_casts; vectors use JSON objects/arrays. Restoring a cast reconstructs visuals but never replays fired damage. Cancellation removes all owned visuals/hazards, generation guards reject pooled casters. Enemy snapshots preserve element from definition; WaveManager must never reroll Arc7 variants or substitute an unrelated roster member. Invalid Arc7 skill config blocks campaign load.

Presentation manifest adds enemy_presentations entries (portrait and animation source) resolved before aliases; animation normalized_frame_width=512 handles small source sheets without modifying originals. All 30 VFX use actual native 3x3 grids and normalized pivots. get_arc7_vfx_* methods resolve only registered entries.

## Seed parity v1.3

Add nullable game_enemies.collision_radius REAL and balance_reference_level INT through the existing seed extension mechanism. processEnemy removes null extensions for legacy rows; Arc7 stores exact collision radii and Lv60 metadata, so DB bootstrap and headless catalog fixtures use identical physics. Selective local sync migrates these two columns transactionally before seeding, preserving all unrelated rows and profiles.

## Offline fallback

None. Missing/invalid config or disconnect blocks gameplay and mutations, returning to retry/login. No local gameplay JSON fallback.

## Acceptance

Verify deterministic generator, actual asset grids/pivots, 35 creep and 10 boss variants, exact boss placement, four skills per boss, fixed Lv60 reference, single difficulty scaling, selective root immunity, one-time enrage, damage lifecycle, safe telegraphs, pooled-state reset, resume and final-wave completion. Run backend build, client/server static checks and mortal runtime benchmark across all five Lv60 heroes. Acceptance: 240/240 mortal Godot runs across 10 stages, 3 difficulties and 5 heroes. Stages 1/5/10 use three seeds; other stages one seed. Ordinary offered cards, neutral element matchups, no gear/affinity/ThanLuan. This verifies the declared kite profile, not minimum CP or population win rate. Client static suite, backend build, server static suite, compiled PostgreSQL roundtrip and Arc7 integration pass. Legacy cross-repository suite stops at an unrelated Hero5 range assertion (expected >=768, current 700..780); no Hero5 balance was changed. Local seed/release v47 verified, no profile writes. Gate score 9/10; production deployment not performed.

## Changelog

|Version|Date|Change|
|---|---|---|
|1.4.0|2026-10-29|Complete catalog/runtime/VFX, SQL parity, root/bloodline/resume gates, 240 mortal cases, measured recommendations and local release 47.|
|1.3.0|2026-10-29|Persist collision radius and balance reference through compiled seed/DB processing; require SQL roundtrip parity.|
|1.2.0|2026-10-29|Specify Arc7 cast/bloodline/serialization/validation schema before implementation.|
|1.1.0|2026-10-29|Audit current attribute pipeline; prepare forest background and sweep minimap, register AtlasRegistry lookups.|
|1.0.0|2026-10-29|Register Arc7 integration plan, Lv60 baseline, random element catalog and beast/boss skill scope.|

## Acceptance artifacts

Server docs/reports/ARC7_INTEGRATION_REPORT.md, ARC7_RUNTIME_ACCEPTANCE.json, ARC7_ASSET_AUDIT.json and ARC7_PREVIEW.png contain evidence and limitations. H? Khi?u uses actual bounded actor displacement because the generic instant knockback status has no Player movement implementation.

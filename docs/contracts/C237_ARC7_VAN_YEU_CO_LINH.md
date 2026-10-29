# C237 ? Arc 7 Van Yeu Co Linh

- Version: 1.8.1
- Status: ACTIVE
- Updated: 2026-10-29

## Scope and canonical plan

Canonical design: ../ARC7_VAN_YEU_CO_LINH_PLAN.md.
10 stages, 20 waves each; seven creep archetypes, Bach Ho boss stage 5 and Chu Tuoc boss stage 10. Fixed hero Lv60 balance reference. Seeded five-element variants, 15 authored attacks and 30 source VFX sheets. Implemented with server catalog, guarded runtime casts, presentation registration and measured Lv60 acceptance.

## Schema and interfaces

Revision 1.7.0: Bạch Hổ skills carry tiger_version=2. B01 performs three35%
ATK punches .2s apart, with random visual contacts inside the current target's
hitbox and10% paralysis(.5s) per hit. B02 applies2s movement/attack speed x1.3,
then two100% ATK target-following claws .5s apart,50% four-second bleed per hit
(default10% ATK/s). Range is checked independently at every strike.
B03 locks a2s target-ground field;1s paralysis rolls30%(.5s). Tails last1s,
deal100% once and roll50% stun(.5s). Four30% kicks follow in a persisted shuffled
cardinal order .25s apart; each pushes50px away from its own emission point.
B04 Cuồng Dã is passive activation=self_hp_below, hp_below_pct=.5 on the BOSS
caster HP, cooldown300s. Six5% ATK expanding waves at0..5s sample
boss position per pulse and roll15% paralysis(.5s). A6s overhead seal blinks;
movement x1.3, attack speed x1.25 and one-time harmful-status cleanse. Later
control still lands; the passive waves persist while normal actions are blocked.
B04 is nonexclusive/background. B02 can chase during its active cast but cannot
start another active attack. Timed buffs persist independently of cast visuals;
overlapping B02/B04 buffs take the stronger per-stat value, not their product.
All timers, cooldowns, buff state, random contacts/cardinals, pulse centers and
hit ledgers persist through save/resume and clear on death/pool reuse. No new
RPC/storage collection or local gameplay configuration; existing config JSON
and run-snapshot dictionaries carry the additional fields.

Revision 1.6.1: Z02 shots converge on the locked snapshot center rather than
random interior points. Launch directions remain separated; no coefficient,
cooldown, payload or config changes. Saved in-flight shot geometry is retained.

Revision 1.6.0: Chu Tước Z01-Z04 carry vermilion_version=2. Z01 is a locked
target-centered 100% ATK palm plus 5% ATK/s burn. Z02 is a 2s fixed field,
six 20% ATK feathers spaced .2s from distinct angles, on-contact 10% impact
and 4s bleed. Z03 is a 2s 30% slow field with phoenix and four .5s-spaced
50% ATK eruptions applying 5% ATK/s burn. Default burn duration is 4s.
Z04 is passive on lethal HP: four 5% ATK expanding waves at 0/1/2/3s and
40% area slow for 4s, then 50% HP recovery; cooldown exactly 300s, unaffected
by recovery modifiers. Lethal intercept emits no death/reward/wave-clear event.
Pending rebirth time, its active cast, shot destinations and hit ledgers persist
in the existing run snapshot. Rebirth is untargetable, cannot cast/move, cannot
be interrupted by control, and resets on pool reuse. Final death behaves normally.
Permanent generic timer infinity serializes as -1 and restores to infinity,
so the rebirth snapshot remains valid JSON rather than emitting 1e9999.
All geometry, durations and coefficients are server catalog fields; artwork is
presentation-only through AtlasRegistry. New revision retains legacy skill type
names for snapshot compatibility; old catalog/casts continue their old behavior.

Revision 1.5.0: normalize each Arc7 role to the corresponding Arc6 base median,
scaled by the median five-level Hero growth (Lv55 to Lv60) for HP/ATK/DEF.
Preserve species ratios within each role. Continue authored stage curves from
Arc6 9.00..11.50 to Arc7 9.25..11.90 through 11.50..15.50. Use Arc6 role counts
per wave, shared formation, speed_mul .75 and unchanged shared wave EXP.
Boss HP/DEF use Arc6 Wraith base times five-level growth; ATK uses its effective
base including .45 multi-hit coefficient, preserving Arc7 boss relative ratios.
The previous acceptance digest is invalid; new mortal measurements are required.

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

## Standardized presentation 1.4.1

Arc7 actor animation cells declare 512x512, VFX cells 400x400, all 3x3/9 frames. Actor sheets that remain off-size normalize at load through the established manifest reader; no source bitmap changes. VFX declares 1200x1200 output; B03A remains 1200x825 on disk and fits each native 400x275 cell into a transparent 400x400 canvas to preserve ring perspective. Runtime visual size remains controlled by world width/actor scale. Evidence renders cover roster plus all animation states and all 30 VFX layers.

## Changelog

|Version|Date|Change|
|---|---|---|
|1.8.1|2026-10-29|Audit Phoenix lethal passive through control: Z04 is protected from action-interruption cancellation, still cleans up on death/pool. Require caster HP<=0. Restore only launched wave visuals, avoid duplicated wave0, expand all four rings outward and retain4s/50% revival/300s cooldown.|
|1.8.0|2026-10-29|Correct Cuong Da to caster/boss HP strictly below50%: activation=self_hp_below, hp_below_pct=.5. Trigger immediately on nonlethal damage and before control/target gates in physics. All control is ignored for passive activation; cleanse occurs once; later control cannot cancel the six waves. Supersedes prior player-HP interpretation.|
|1.7.1|2026-10-29|Reserve overhead tiger seal for B04; B02 uses a separate body buff visual. Render six explicit outward-expanding waves synchronized to collision fronts; retain strict player HP below50% activation and300s cooldown.|
|1.7.0|2026-10-29|Bach Ho triple punches, tracking claws, fixed trap and directional kicks, player-HP-triggered Cuong Da with six waves, one-time cleanse, independent speed buffs and resume ledgers.|
|1.6.1|2026-10-29|Six-angle Vermilion feathers converge on fixed snapshot center.|
|1.6.0|2026-10-29|Chu Tước target palm, six-angle feather snapshot, phoenix eruption field and lethal-triggered 50% rebirth after four waves.|
|1.5.0|2026-10-29|Continue Arc6 population/stat engine using Lv60 role-normalized bases; invalidate previous balance evidence.|
|1.4.1|2026-10-29|Adopt explicit 512 actor and 400 VFX cells; recapture Godot visual test evidence.|
|1.4.0|2026-10-29|Complete catalog/runtime/VFX, SQL parity, root/bloodline/resume gates, 240 mortal cases, measured recommendations and local release 47.|
|1.3.0|2026-10-29|Persist collision radius and balance reference through compiled seed/DB processing; require SQL roundtrip parity.|
|1.2.0|2026-10-29|Specify Arc7 cast/bloodline/serialization/validation schema before implementation.|
|1.1.0|2026-10-29|Audit current attribute pipeline; prepare forest background and sweep minimap, register AtlasRegistry lookups.|
|1.0.0|2026-10-29|Register Arc7 integration plan, Lv60 baseline, random element catalog and beast/boss skill scope.|

## Acceptance artifacts

Server docs/reports/ARC7_INTEGRATION_REPORT.md, ARC7_RUNTIME_ACCEPTANCE.json, ARC7_ASSET_AUDIT.json and ARC7_PREVIEW.png contain evidence and limitations. H? Khi?u uses actual bounded actor displacement because the generic instant knockback status has no Player movement implementation.

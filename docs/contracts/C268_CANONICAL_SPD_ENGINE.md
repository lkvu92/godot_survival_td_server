# C268 Canonical SPD engine (factory first)
Version: 1.1.0
Status: IN_PROGRESS

## Changelog
- 1.1.0 (2026-11-05): User correction: all five heroes start at 100 SPD; persistent growth alone differentiates their base speed. Wood retains the highest existing growth. This supersedes C238's old wood-speed 2x Lv70 target, not its other stat targets.
- 1.0.0 (2026-11-05): Shared SPD-point engine, hero seed migration, basic cadence/CP/UI parity; skill travel remains disabled pending per-skill audits.

## Units and scope
100 SPD = 1 attack/sec for every actor at the canonical engine interface. rate=SPD/100; interval=100/SPD, zero/negative/nonfinite disables basic attacks. No inherited 0.2-second cap or 2-second subtraction formula. Missing runtime test-actor SPD defaults to the reference 100; authenticated hero catalogs must supply real stats.
Hero attributes.attack_speed and flat equipment attack_speed/spd are points. Hero seed bases are now 100 SPD for every hero (v1.1 supersedes the initial x100 carryover); level_up_stats.attack_speed remains a multiplicative factor, percent cards/equipment remain percentages. Existing consumable reducing basic cycle by 25% keeps its documented interval multiplier 0.75 (effective SPD /0.75); slows/domain modifiers multiply the attack rate. Enemy legacy source catalogs remain explicitly attacks/sec and enter the shared service through an APS->SPD adapter; do not silently reinterpret their balance values.

## Authority and transport
Existing authenticated progression gains required combat_speed={version:1,hero_unit:"spd_points",enemy_source_unit:"attacks_per_second",reference_spd:100,skill_flight_enabled:false}. Missing/malformed units reject client admission, never infer units from number magnitude. No new RPC or user-storage schema. Hero current_attribute is derived again by canonicalHeroStates from authoritative hero rows; no user level/EXP/equipment mutations. Local migration is atomic, backed up, CAS guarded and scoped to hero attack_speed plus progression unit metadata. Paired client/server publication is required before production; no production publication in this task.
New run states mark attack_speed_unit="spd_points". Unmarked/foreign saved hero stats are rejected before resume mutations; no magnitude heuristics. Existing profile stats are refreshed through server canonical projection.

## Interfaces
Client CombatSpeedService owns pure rate/interval conversion, modifier composition and future travel multiplier SPD/100. Player and combat power use it. Enemy uses explicit legacy APS adapter while retaining existing minimum/trait behavior. Server cpBasicAttackRate mirrors pure conversion; backend growth/equipment factory preserves canonical units. Character UI/admin show SPD and derived attacks/sec, not raw points labelled /s.
Remove the superseded C267 blanket projectile hook and per_spd/cap proposal. No projectile, moving VFX, AoE phase, effect duration, damage, cooldown or skill emission changes in this phase; flight multiplier is a tested unbound primitive only. C267 remains deferred to per-skill/hero audits.

## Validation
80/100/120/150 SPD -> .8/1/1.2/1.5 attacks/sec, inverse intervals; zero/NaN guards; no hidden high-SPD cap; additive/percent gear, consumable/slow/domain composition; fixed basic damage; core client/server CP parity; explicit migration and idempotence; malformed/missing-unit bootstrap and old-run rejection. Existing focus, stat/resume, consumable, growth and relevant skill/talisman checks; build/typecheck, document unrelated suite failures.

## Scoped result
Core unit/factory checks PASS, local unit migration applied with readback and runtime restart. Full regression gate remains open for server daily-pack test failure and native ScrollBarUI crash. See docs/reports/C268_SPD_ENGINE_ACCEPTANCE.md; no skill-flight activation or production publication.

## 1.1 current base-speed rule
Every hero seed attributes.attack_speed is 100 points at Lv1. Persistent SPD(L)=100 * level_up_stats.attack_speed^(L-1), before equipment/buffs. Existing growth factors remain water/earth/metal 1.01, fire 1.012 and wood 1.016488. No inferred per-hero APS carryover, no cap retune, no changes to other attributes/growth or skill flight. Explicit local follow-up normalizes only the five hero base SPD fields with backup/CAS/readback; canonical profile projection recalculates derived stats without changing level/EXP/ownership.

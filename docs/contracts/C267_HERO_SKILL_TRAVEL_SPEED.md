# C267 Hero skill travel speed from SPD
Version: 1.0.0
Status: IN_PROGRESS

## Changelog
- 1.0.0 (2026-11-05): Multiply hero skill projectile travel speed by server-configured SPD scaling.

## Authority and schema
Existing authenticated progression snapshot gains optional hero_skill_travel_speed: {version:1, enabled:true, per_spd:0.005, max_bonus:0.75}. Seed lives only in server/data/progression.json. Existing config RPC and game_config progression transport unchanged. No new RPC/profile/storage or client JSON fallback. Missing optional section means feature disabled for older snapshots; present malformed section rejects admission.

## Runtime
Multiplier=1+min(max(attack_speed,0)*per_spd,max_bonus). Apply exactly once in SkillManager._spawn_projectile to catalog combat hero_N_skill_M plus derived split/flank/punch IDs. Exclude hero_basic_attack, talismans and nonhero actors/producers. Snapshot current SPD at projectile spawn; existing projectiles retain speed. Existing fixed or move-relative authored speed stays the base. Explicit arc_duration and homing_launch_time are divided by multiplier to keep the same path/launch distance; implicit arc duration derives from scaled speed. Swept collision remains unchanged.
Only travelling Projectile objects are covered: line/homing/arc/boomerang and derived skill projectiles. Do not change cooldown, global gap, cast/charge, delayed emission intervals, AoE wave expansion, falling-seal impact schedule, DOT cadence/duration, hit count, damage, range or VFX animation cadence. Movement buffs continue to affect legacy move-relative base speed; SPD multiplier caps independently at 1.75 with the initial server config.

## Validation
Test all five heroes and derived IDs, zero/negative/capped SPD, missing/disabled/invalid config, fixed/move-relative speeds, explicit/implicit arc durations and pooled leases. Actual high-speed swept hits must not skip or duplicate enemies. Existing hero speed, rotation, focus and talisman suites must pass. Seed tests assert proposed curves and exclusions. Report seed/local/production publication status separately; no production rollout implied.

## Unit conflict ? 2026-11-05, awaiting design decision
User identified attack_speed attribute described as attacks/sec (hero seed 1.45?1.95), while existing Player and combat-power code use it as linear SPD points. At 1.5, existing basic cooldown is 1.9925 sec rather than 0.6667 sec; proposed travel bonus would be only 0.75%. The point-SPD proposal is therefore NOT accepted for activation. Seed and local DB enabled=false; code is staged only. Do not migrate basic attacks/attributes or activate the travel multiplier until units and conversion are decided with the user. Existing basic behavior remains untouched. Test fixture explicitly enables the staged implementation to validate geometry/scope, not production balance. No production rollout.
Validation: C267 geometry/scope and seed tests, online-only malformed-config rejection, Hero3Rebalance, AutoSkillRotation and all three talisman suites PASS; client static PASS; backend npm run build PASS. Full server static suite stops at test_daily_pack_entitlements.cjs:60 (error vs success); that test reads packs/items and unchanged monetization/resource runtime, not progression travel config. Full acceptance remains open.

## Superseded by C268
Point-SPD additive/capped formula and blanket projectile hook removed. Canonical engine now uses 100 SPD=1 attack/sec; flight primitive is SPD/100, unbound until per-skill phase audits. No flight activation in C268.

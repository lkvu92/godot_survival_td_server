# C148 Creep fire skills
Version: 1.1.2 | Status: ACTIVE | Updated: 2026-10-21

## Changelog
| Version | Change |
|---|---|
| 1.1.2 | Double fireball visual size, halve claw visual size and ground lava brute stomp/rings at the caster sprite foot; gameplay radii and damage remain server-defined. |
| 1.1.1 | Crop legacy ranged projectile sheet into 400x376 frames; keep pyromancer presentation on the fireball animation with legacy server definitions and reset animation on pooled reuse. |
| 1.1.0 | Bind and verify Arc 1 skills across normal/epic/legend campaign spawning and restore; reconcile saved boss cooldowns with current server skill definitions. |
| 1.0.0 | Replace fire creep placeholder attacks with cultivation-themed claw, fireball, stomp, triple meteor and fire formation skills, layered asset playback and configured damage phases. |

## Data authority and schema
Balance is versioned only in `server/data/enemies.json`, published through the existing authenticated config snapshot. No new RPC is added: existing config request/response carries the enemy dictionaries. Missing/invalid online configuration blocks gameplay under C121; there is no local gameplay JSON fallback.

Regular enemies carry `attack_skill: {id,display_name,type,damage_multiplier,radius}`. Types are `fire_claw`, `fire_ball`, `fire_stomp`. Stomp adds `pulse_count,pulse_interval,pulse_multiplier,pulse_radius_multiplier,stun_chance,stun_duration`. The ordinary attack cadence and ranged projectile speed remain in enemy attributes.

Boss `boss_skills` entries use `fire_meteor` and `fire_formation`, with `id,display_name,type,damage_multiplier,radius,range,warning_time,cooldown`. Meteor adds `meteor_count,scatter_radius,fall_duration,meteor_interval,explosion_multiplier,crater_duration,dot_multiplier,dot_interval,pulse_count,pulse_interval,pulse_multiplier,pulse_radius_multiplier`. Formation adds `duration,dot_multiplier,dot_interval,side_multiplier,side_delay,side_offset,column_radius`. Rune radius is 100; each pillar hit radius is independently 48.

Percentages are fractions of the caster's attack damage, not target maximum HP. Damage is resolved by existing combat damage/defense rules. Lingering damage uses full one-second ticks, three for crater and four for formation. A cast snapshots its origin/ground target and must not follow a moving target after placement. Delayed phases stop safely when battle/source ownership becomes invalid.

## Behavior and interfaces
Enemy ordinary attacks dispatch `attack_skill`; boss scheduler dispatches `boss_skills.type`. All textures/frames resolve through AtlasRegistry; gameplay uses configured world radii, and VFX fit their active artwork to that diameter independently of transparent sheet margins. Ground layers are behind actors; crater is below explosion. Fireball animation plays once and holds its final frame during travel.

Full enemy mapping, timings, layering and explicit assumptions are in [Creep fire skills](../CREEP_FIRE_SKILLS.md). Existing generic enemy passives remain intact. Meteor replaces the old mock magma/infernal boss entry; dragon owns both meteor and formation with independent cooldowns.

## Acceptance
Validate authoritative seed schema, published-config loading, Godot parsing and focused combat tests: one hit per claw/projectile, two independently timed stomp pulses and stun rolls, exactly three meteor impacts/explosions/craters with three waves each, four formation ticks and three pillar hit phases, correct cooldowns, cancellation, non-loop fireball and grounded frame sizing. Run applicable client/server static checks and backend build. Mark ACTIVE only after verified evidence is recorded; production publication is separate from implementation.

## Backend persistence
`game_enemies.attack_skill` is nullable JSONB, added idempotently for existing databases. Enemy seed INSERT and ON CONFLICT UPDATE preserve the object; processEnemy decodes PostgreSQL object, JSON string or byte array before existing authenticated config publication. Absent skill is null and does not fabricate gameplay.

## Cooldown clocks
Each boss skill cooldown starts on release. Independent cooldown clocks keep ticking during control effects and another skill charge; they are not paused by the boss action scheduler.

## Verification (2026-10-21)
Gate score: 8.5/10. Backend `npm run build` and canonical runtime packaging PASS. Real disposable PostgreSQL `tests/test_seed_integrity.cjs` PASS: existing-table migration, repeated migration, enemy seed INSERT/upsert, SQL NULL for absent skills, JSONB object/string/UTF8 byte decoding, exact attack_skill/boss_skills published-config roundtrip, and existing seed rollback/security regressions. Fixture was stopped after testing.

Client root verification PASS: Godot headless `--path client --scene res://tests/TestCreepFireSkills.tscn -- E:/LKVU/survival_td_godot/server/data/enemies.json`, gameplay/scheduler/visual checks, and client static runner. All 99 frames resolve to non-null 400px cells. Final suite includes nullable legacy/non-fire attacks. Manual in-arena visual review is not claimed. Production configuration was not reseeded or published; deployment remains a separate operation.

## Arc 1 campaign integration (1.1.0)
All ten arc_2 stages use the current server enemy skills in normal, epic and legend. Difficulty modifies ATK (1, 1.5, 2.25) before skill percentages apply; cooldowns and phase counts stay unchanged. Restoring a run reuses current server boss definitions and resolves saved optional skill IDs through the server catalog, rather than installing saved gameplay definitions. Current arc passives are appended on fresh and restored spawn. Saved cooldowns are applied only to current skill IDs; newly added skills retain configured initial cooldowns. Tests cover all thirty stage/difficulty combinations and a legacy mock boss save. No RPC or offline fallback change.

### Arc 1 integration verification (1.1.0)
Godot TestArc1FireIntegration PASS: ten stages, thirty stage/difficulty combinations, 1800 real wave-entry spawns and 1800 restored actors. Checks all six enemies in each mode, independently computed entry-times-difficulty ATK scaling, correct current skills, arc boss passive, no mock/duplicate skills, saved current cooldown preservation, and legacy mock saves upgraded to current definitions. Focused TestCreepFireSkills regression and client static checks PASS. Gate score 8.5/10. No production deployment or reseed performed.

## Legacy projectile presentation (1.1.1)
The legacy basic_fire.png texture is 1200x1128 with 3x3 cells (400x376), never a single projectile texture. Its bare registry ID resolves to the first cell; numbered IDs provide playback. Pyromancer presentation selects the 400x400 fireball frames even when older online definitions omit attack_skill; this is visual selection only and does not create local gameplay balance. Both animations play once and hold the last frame in flight, resetting on pooled reuse.

### Projectile and other-effect verification (1.1.1)
TestCreepFireSkills PASS: legacy pyromancer without attack_skill uses cropped400x400 fireball frames; other legacy ranged creeps use cropped400x376 basic_fire frames; bare legacy registry ID returns frame0; both hold final frame and reset on projectile reuse. All11 actual CreepFireVisual sprites render an AtlasTexture400x400 at first and final animation frames, and all99 frame IDs resolve to400x400. Client static runner PASS. No manual arena rendering review claimed; gate score8.5/10.

## Visual adjustment 1.1.2
Fireball artwork width96 world pixels (was48); claw artwork scale0.5 relative to configured visual diameter. Lava brute stomp and both concentric rings share a snapshotted offset to the rendered sprite bottom, transformed to world space so boss/sprite scale is respected. Only presentation changes; server damage and gameplay radii stay unchanged. Focused Godot TestCreepFireSkills PASS; gate score8.5/10.

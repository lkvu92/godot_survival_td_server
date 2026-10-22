# C172 — Primordial Wraith elemental skills

- Version: `1.0.0`
- Status: `ACTIVE`
- Updated: `2026-10-22`

## Authority and data schema

The canonical `primordial_wraith` enemy receives four `boss_skills` dictionaries
in the authoritative server enemies seed. Existing config RPC/bootstrap carries
these rows without a new endpoint. Missing or invalid config blocks casting;
there is no offline gameplay fallback. Existing enemy stats and rewards remain.

Each skill declares `id`, `display_name`, `type`, `range`, `radius`, `warning_time`,
`cooldown`, `initial_cooldown`, timings, damage multipliers, and effect arrays.
Multipliers use caster ATK before the existing defense/element damage pipeline.
DOT `dps_multiplier` is converted to caster ATK times that multiplier. Status
durations, chances, defense reduction and all geometry come from server config.

## Cast interfaces and phases

`WraithBossCast.setup(caster, definition, center)` extends `CreepFireCast`.
Enemy dispatch recognizes four types:

| Type | Skill ID | Timeline |
| --- | --- | --- |
| wraith_volley | ngu_hanh_lien_xung | Charge .7s; release metal, water, wood, fire, earth every .18s. Moving projectiles use swept opposing-hero collision, expire after 3s. Each hit deals .45 ATK plus .12 splash. Final earth hit adds .25 ATK ground shock. |
| wraith_binding | can_khon_ngu_hoa_toa | Fixed target formation charges .8s; active 2.8s, pull toward fixed center at 100px/s respecting control immunity; .12 ATK ticks every .5s. Root and silence last 2s. |
| wraith_calamity | ngu_nguyen_diet_gioi_tran | Fixed 235px area warns 1.3s, then 4s of .24 ATK ticks every .5s and a .45 ATK expanding final pulse. Bleed and burn each .05 ATK/s for 3s; armor break 20% for 4s. |
| wraith_ultimate | thai_so_hon_don_kich | Charge 1.8s; claws slam .45s later for 1.4 ATK; .5s dark implosion; five expanding .25 ATK pulses .22s apart; final pillar .5 ATK. Slam stun .5s. |

Every hit checks living opposing heroes within actual radius at hit time. Domain
centers remain fixed so telegraphs can be dodged. Death, control, pool reuse or
scene exit cancels future events/projectiles and removes owned domain effects.

## Presentation

Authored sprite sheets live under `res://assets/boss/primordial-wraith` and are
registered through AtlasRegistry. Five element colors follow metal, water,
wood, fire, earth order. Sheet playback does not authorize damage. Layer ground
arrays, projectiles/objects, then particles according to skill phase.

## RPC payload and access

Existing config request/response shapes remain unchanged (`enemies` rows gain
the dictionaries above). Admin Test 3 uses existing `admin_test_access` with
the existing exact account allowlist `lkvu92@gmail.com`; this contract adds no
auth bypass and grants no economy rewards.

## Changelog

- 1.0.0 (2026-10-22): Define four elemental Wraith casts and canonical VFX root.

## Acceptance evidence

Godot 4.6.3 `TestPrimordialWraithSkills` PASS using explicit authoritative server
fixtures: ordinary nonboss Enemy.setup dispatches all four skills in configured
initial cooldown order; normal rank, HP 400 and ATK 42 remain unchanged. Cooldowns
progress without boss age/enrage. Five true-element projectile hits plus splash
and earth shock total 310% ATK with identical coarse/fine frame stepping, swept
collision, dodge and expiry. Binding charge, five ticks (60%), actual Player root,
silence, collision-aware pull and control immunity pass. Calamity eight ticks plus
final wave total 237%; actual burn/bleed DOT handler and armor-break expiry pass.
Ultimate slam at 2.25s, .5s implosion, five waves and pillar total 315%. Allied
creeps are excluded; death/control/pool generation cancel pending attacks. Owned
VFX tween cleanup exits cleanly with no errors. Server build and static suite PASS.
No running database was published during these checks.

Local development sync: `node tools/sync_wraith_skills_local.cjs` seeded and read back only Wraith boss_skills in loopback Nakama. Existing enemy balance/other enemies verified unchanged. No production deployment.

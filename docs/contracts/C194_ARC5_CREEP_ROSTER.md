# C194 Arc 5 four-creep roster

Version: 1.0.0
Status: ACTIVE

## Schema and authority
Arc 5 (arc_titan_realm) regular roster is granite_colossus, sand_stalker,
seismic_shaman, amber_spirit. primordial_wraith remains in the enemy catalog
for its separate boss/admin content; it must not spawn in Arc 5 campaign waves.
Existing enemy JSON schema and seed RPCs remain. New amber_spirit row reuses
the former grunt's HP400/ATK42/DEF18, move58, attack speed0.8, crit8%/1.8,
reward EXP/gold120, resistance duration multiplier0.5 and collision radius20.
It uses ranged earth_orb (range340, projectile speed360): 100% ATK, 65px AOE,
0.5s snapshot detonation, 20% paralysis0.2s, as specified by C169 for Amber.
It has no boss skills. No increase to grunt HP, ATK or reward budgets.

## Interfaces and presentation
Replace only 303 enemy_id references in all ten Arc 5 stages. All counts,
intervals, start delays, modifiers, EXP weights, boss entries and other arcs
remain identical. Shared waves apply to normal/epic/legend. Grunt role maps
to amber_spirit; rusher unlock wave4 and tanker wave7 remain.
WaveManager allowlist uses the four regular creeps. Old remote wraith entries
map specifically to Amber (including resumed saved enemies) instead of a random
role. New authoritative seed must still be published; no local gameplay JSON.
AtlasRegistry registers existing Amber avatar and five 3x3/nine-frame sheets;
run uses authored earth_monster_01_run.png. UiSkin/signals unchanged.
C121 missing config/disconnection still blocks gameplay and mutations.

## Acceptance
Compare canonical stages before/after with only Arc 5 ID substitutions masked;
verify preserved stats, counts, wave timing, EXP and boss entries. Check all
four creep animation states via AtlasRegistry and actual Enemy animation.
Full static checks client/server and Godot parser required. No deployment.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Replace Arc 5 wraith grunt with authored Amber Spirit; preserve wave budgets and add complete asset registration. |

Validation: 303 ID-only substitutions verified against the pre-change in-memory stage snapshot; all other fields identical. Full server and client static suites PASS. Campaign role regression covers 50 stages/150 modes, unchanged tank HP ratio and four-creep Arc5 roster. Godot TestArc5Sprites PASS: 1395 frames, 125 sheets, actual Enemy animation and legacy wraith-to-Amber resolution. Gate score 9/10. Live difficulty acceptance remains gameplay-dependent; no seed/publication/deployment performed.

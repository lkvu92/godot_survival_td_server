# C153 ? Exact wave EXP after opening count reduction
Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-21

## Changelog
| Version | Change |
|---|---|
| 1.0.0 | Restore exact in-run EXP per wave with reduced creature counts; use runtime level20 threshold1900 and give explicit wave EXP precedence over inherited direct-level boss rewards. |

## Behavior and schema
All fifty campaign stages,shared normal/epic/legend,require sum(count*modifiers.exp)=Player.get_exp_to_next_level at the corresponding wave ordinal. Levels1?19 require25/35/50/70/95/125/160/205/255/315/385/465/560/670/800/950/1120/1310/1520; level20 uses the runtime fallback round(1520*1.25)=1900. With a fresh level1,zeroEXP actor and each wave completely killed before the next,each clear gives exactly one level and zero excessEXP. Overflow waves still award only for actual kills; no forced level changes at wave start/end.

Keep total counts and per-species counts fromC152 unchanged. Only EXP allocations change; when integer per-entry rewards cannot reach the exact sum,split an entry into equivalent positive-count entries with consecutive EXP values. Preserve all original metadata/timing/othermodifiers and original primary entry indexes; append split remainder entries. Boss/minion groups use75%/25% shares only when a mismatched boss wave needs adjustment. Wave IDs,role rules,HP/ATK,spawn cadence,difficulty,permanent progression and player saves remain unchanged. No RPC or gameplay schema addition; existing server stage modifiers are authoritative underC121.

Enemy explicit modifiers.exp overrides inherited reward.level_up; an explicit modifiers.level_up still takes precedence if authored. This removes the old boss direct-level bypass that otherwise ignores EXP. Existing pure direct-level rewards without explicit EXP remain intact.

## Interfaces and acceptance
Offline tool exports getWaveExp(oneBasedWave),rebalanceWaveExp(stages)->changedWaveCount. --check is read-only, --write explicit. No client local content fallback. Tests must compare requirements to actualPlayer table/fallback,verify all881waves*3modes,simulate actual Player kill callbacks including boss rewards,keep exact per-species counts/metadata and role rules,check rounding/idempotence and real explicitEXP reward precedence. Server seed/publish and updatedclient distribution are needed online; no live deployment performed here.

## Verification
173 mismatched waves repaired(150opening waves and23wave20s); all881waves now exact. Actual pre/post comparison preserves count per species and every non-EXPmodifier/timing field. Permanent server tests cover thresholds1?49,exactinteger split allocation,metadata/count preservation,boss shares,roles and idempotence. Godot actual Enemy.setup and Player._on_enemy_killed regression PASS:50stages,150modes,2643full wave clears,49443kill callbacks; each clear exactly+1level and zeroEXP surplus. ExplicitEXP/inheritedlevel-up precedence tests PASS. First-clear reward regression,client static and backend build/runtime packaging PASS. Gate score8.5/10. No live publish performed; client and stage snapshot changes both needed online.

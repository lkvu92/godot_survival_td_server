# C197 Hero 5 three-layer skill rebalance

Version: 1.1.2
Status: ACTIVE

## Schema and authority
Server skill seed supplies existing/new optional stats through existing config
RPCs; authenticated snapshot required (C121), no local gameplay JSON fallback.
Skill1 direct damage60/75/85/100/120 percent ATK, plus separate explosion
25/30/35/40/45 percent ATK; radius45/50/60/70/80; knockback30/35/40/45/50;
fan step10deg; range700/720/740/760/780. Remove old hardcoded 50/50 split.
Skill2 formation lasts2s nonloop, plays once then holds final frame. Initial
AOE70/85/100/115/130 ATK percent. Runes start at1s, loop for1.5s, three
ticks at1.5/2/2.5s, each25/30/35/40/45 ATK percent plus max-HP percent.
Confirmed max-HP percentages per rune tick: 0.2/0.3/0.6/0.8/1 percent;
levels[].stats.rune_hp_percent stores 0.002/0.003/0.006/0.008/0.01.
Cooldown6.5/6/5.5/5/4.5; radius80/90/100/120/140; range720/740/760/780/800;
each damaging hit rolls35% holy_stun for0.1/0.125/0.15/0.175/0.2s.
Skill3 cooldown11/10/9/8/7; palm impact after0.35s, nonloop. Impact radius
70/75/80/85/90 and matching hand sprite scale; damage100/110/120/130/140.
Crack starts on impact, lasts1s nonloop, burns0.5/0.6/0.7/0.8/1 percent
max HP over1s in its area (two half-second pulses, affected targets rechecked).
No former 35% ATK crack hit or guaranteed stun. Propagating rings start on
impact and every0.2s, count1/2/2/3/3, same max radius100/110/120/130/140
for each ring. Each ring deals30/40/50/60/70 percent ATK once per target,
20% holy_stun0.1/0.15/0.2/0.25/0.3s. No fixed-radius instant wave damage
or max-HP wave damage. Existing expanding-ring hit ledger/collision retained.
Skill4 is specified by the 1.1.0 override below. Existing target snapshot fixes each cast center. AtlasRegistry
already maps all requested asset paths; UiSkin unchanged. Reusable SkillVfx
supports hold_last_frame without fading, resets that flag on pooled acquisition.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Separate finger explosion; delayed rune pulses; palm impact, crack burn and propagating ATK rings. |

Historical 1.0.0 progress (before HP clarification): full server/client static suites PASS; Godot TestHero5Rebalance checks all five skill levels, independent direct/explosion coefficients, final-frame hold, rune delay/three pulses, mixed ATK+HP helper using an explicit synthetic HP test value, palm delay, exact crack HP budget, same-radius propagating once-per-target waves. Skill2 authoritative rune_hp_percent curve remains unset pending the missing fifth user-provided level; contract intentionally IN_PROGRESS and no publication performed.


## 1.1.0 Golden body and actual-hit marks (2026-10-24)
Skill4 phantom is fixed at cast origin, nonloop2s. Cleanse harmful debuffs
on cast; harmful-status immunity and full damage immunity both last first0.5s,
with no residual50% damage reduction for the remaining phantom lifetime.
Punch frames use hero_5_skill1_effect1. Damage40/40/50/55/60, count12/14/16/18/20,
interval0.2s, target radius700/730/760/790/820 from current hero position at
each emission. Punches originate at current hero position, not phantom.
Within a cast, first actual hit per target is full; subsequent actual hits50%.
Projectile optional hit_damage_resolver resolves this before damage, shared
cast ledger keyed by target instance and pool generation; no counter on launch.
On actual hit, a target-centred hero_5_skill4_effect2 mark follows the target.
Per-caster mark keeps total and consecutive counts. Pair gap<=0.5s continues
streak; gaps>0.5 break streak; gaps>1s reset both counts and visual. Three
consecutive hits within1s proc one0.5s holy stun per streak, no extra stun on
fourth/fifth hits. Each consecutive follow-up adds5% to base marker size.
Marker animation restarts on hit, nonloop, holds last frame, expires after1s
idle. Caster/target generation checks prevent pooled reuse/cross-caster leaks.
No legacy buddha_stack bonus damage or old map-coverage selection remains.
Skill4 cooldown unchanged; existing AtlasRegistry asset keys retained/reused.
New optional fields and Projectile callable have pooled resets. Existing RPCs,
server authority and C121 unchanged. Skill2 max-HP curve is completed by the 1.1.1 confirmation below.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-24 | Fixed phantom, half-second protection, current-hero punches and actual-hit consecutive marks. |

1.1.0 acceptance: full client/server static suites and explicit skill4 curves PASS. Godot TestHero5GoldenBody verifies harmful cleanse, full damage/status immunity only0.5s, fixed nonloop2s phantom, moving-hero punch origins, all five counts/0.2s timing, real Projectile hit callbacks/resolver, launch misses not counted, actual-hit repeat50%, pool callback reset, mark centre/scale/expiry, inclusive0.5s/1s boundaries, one stun per streak and caster/generation isolation. TestHero5Rebalance regressions PASS. Skill4 gate score9/10. At 1.1.0 acceptance, the contract remained IN_PROGRESS for the HP curve; resolved by 1.1.1. No seed/publication/deployment.

## 1.1.1 Confirmed rune HP curve (2026-10-24)

Each of the three rune pulses now deals25/30/35/40/45 percent ATK plus
0.2/0.3/0.6/0.8/1 percent target max HP. Store the latter as fractional values
0.002/0.003/0.006/0.008/0.01, never as0.2 through1. Same fixed centre,
three pulses at1.5/2/2.5s, existing35% stun and all other stats remain.
No RPC/schema change; C121 server authority unchanged.

| Version | Date | Change |
|---|---|---|
| 1.1.1 | 2026-10-24 | Fill all five user-confirmed rune HP coefficients and replace synthetic test with authoritative values. |

1.1.1 validation: complete server/client static suites PASS. TestHero5Rebalance now uses the real five-level rune_hp_percent values without synthetic override and verifies each of three pulses adds both ATK and target-max-HP terms. Prior skill4 acceptance remains valid. No missing curve remains. Gate score9/10; no seed/publication/deployment.

## 1.1.2 Presentation binding (2026-10-24)

[C199](C199_HERO5_ASSET_GRID.md) owns canonical Hero5 visual roles and
3x3/400px texture normalization. In particular Skill1 impact cannot be replaced
by stale remote frame metadata. Gameplay coefficients/timing are unchanged.

| Version | Date | Change |
|---|---|---|
| 1.1.2 | 2026-10-24 | Link canonical presentation grid/role policy without changing skill balance. |

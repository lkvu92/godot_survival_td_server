# C137 - Layered talisman skills 16, 26-30

Version: 1.1.4 | Status: ACTIVE | Updated: 2026-10-19

## Authority
`server/data/skills.json` owns all balance and cast timelines. `client/data/atlas_registry.json` registers the exact files declared by each `client/assets/skill_vfx/skill_phap_bao/skill_talisman_*/skill_components.json`; runtime accesses them only through `AtlasRegistry`. `LayeredTalismanCast` validates every required field before casting, and `levels[].cast_config` may override presentation or balance.

Each real impact owns one damage phase and per-target ledger. Effects that are expressly visual-only (formations, rifts, dust, vines, ash, scroll and aura) never damage. The sum of normal phase ratios remains the configured `damage_pct` for the cast; 28 remains an incoming-damage conversion skill.

## Current assembly and damage

| Skill | Asset assembly and timing | Damage budget |
|---|---|---|
| 26 Tru Tien | Uses `main_xuanyuan_sword.png`, `main_effect.png`, `ground_rift_effect.png`, and `sword_intent_particles_effect.png`. Four swept slashes at -15, 0, +15, then 0 degrees, 0.20s apart; the final straight slash is 1.5x scale and each sweep travels the full viewport diagonal. | Each slash crosses its own lane once per target for 1/4; total 120%. Existing execute and defense-ignore rules remain. |
| 27 Hon Don | `stasis_formation_effect.png` appears beneath the selected target first. `main_effect.png` descends once and damages at its final impact frame; its phantom scale is 1.155 (30% smaller). `frozen_time_dust_effect.png` is visual-only. Three `time_ripple_ring_effect.png` instances expand from the impact, 0.35s apart, to 2x formation size. | Bell 40%; each ripple 20%. Each ripple damages and applies stasis only when it crosses the target; total 90%. |
| 28 Am Duong | `taiji_ground_formation_effect.png` stays centered beneath Hero. `yin_yang_fish_aura_effect.png` is centered on the Hero foot anchor and uses 1.2 scale (1.5x its prior scale). Each absorbed hit creates `healing_reversal_effect.png`; `counterattack_spikes_effect.png` originates at Hero and is 2.4 scale. | No free damage. Absorption heals 70% and schedules 30% true counter damage, guarded against recursion. |
| 29 Hoa Trung | `main_effect.png` is the scroll; `creation_vortex_effect.png` loops throughout pull. `mountain_mirage_effect.png` rises once. `life_drain_vines_effect.png` is a short per-enemy bind visual only. | Vortex ticks three times every 0.50s for 20% each; mountain 40%; total 140%. The permanent 20% ATK/speed reduction does not recreate a stale vine VFX. |
| 30 Khai Thien | `main_effect.png` descends to the selected target foot anchor, hits at contact and triggers an accessibility-aware screen shake. `primordial_void_rift_effect.png` begins then remains through the final pillar. Three `fire_pillar_effect.png` eruptions occur 0.25s apart at rift bottom-right (1x), center (1.5x), top-left (3x); the first two push targets into the next pillar. `heat_ash_effect.png` is visual-only. | Axe 60% true damage. Each pillar 13.333?% true damage plus burn status; total direct damage 120%. Shields and invulnerability still apply. |

SkillManager also requires a target for 26, 27, 29 and 30; only the self-field 28 can cast without one. The talisman manifest presentation now shows the equipped talisman icon and display name together.

## Lifecycle and verification
`TalismanLayer` advances every 3x3 frame for both one-shot and looping sheets. Attached freeze overlays follow freeze status; transient vine overlays expire with their own layer duration; pooled enemies cannot inherit an old visual because generation is checked. Long physics steps still resolve every crossed phase once.

Run from `client` when a Godot executable is available:
```
Godot --headless --path . --scene res://tests/TestLayeredTalismans.tscn -- <absolute-server-data-directory>
```
Also run `powershell -ExecutionPolicy Bypass -File tests/run_static_tests.ps1` and from `server`, `node tests/test_layered_talisman_config.cjs`.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.1.4 | 2026-10-19 | Reduced bell phantom by 30%; skill 30 now strikes target feet with screen shake and chains scaled fire pillars through directed knockback. |
| 1.1.3 | 2026-10-19 | Skill 26 now uses four 0.20s sweeps, with a 1.5x final straight slash that reaches the whole viewport. |
| 1.1.2 | 2026-10-19 | Centered skill 28 aura exactly on the Hero foot anchor and increased its scale by 1.5x. |
| 1.1.1 | 2026-10-19 | Recalibrated skill 28 aura to the Hero anchor and made counter VFX follow the Hero during its burst. |
| 1.1.0 | 2026-10-19 | Corrected component-to-runtime assembly, target-centric stasis, phase hitboxes and fixed damage budgets for skills 26-30; added talisman cast name. |
| 1.0.0 | 2026-10-18 | Initial layered talisman implementation. |

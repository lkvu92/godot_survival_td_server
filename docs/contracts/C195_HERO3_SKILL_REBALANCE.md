# C195 Hero 3 skill rebalance

Version: 1.1.0
Status: ACTIVE

## Schema, interfaces and authority
Server skill seed JSON remains authoritative; existing seed/config RPCs remain.
Skill 1 uses projectile_speed=320 world px/s (replacing speed_pct scaling),
knockback distance35 and angle_step10 at every level. Other stats unchanged.
SkillValueService.get_projectile_speed prefers an explicitly configured
projectile_speed; other skills retain existing speed_pct behavior. Description
rendering shows fixed px/s where configured. No local gameplay fallback (C121).
Skill 2 cooldown 8/7.5/7/6.5/6 seconds.
Skill 3 sequence_count6/8/10/12/14; damage_pct12.5/15/17.5/20/25;
final_damage_pct100/130/140/150/160; cooldown12/11/10/9/8;
knockback40/45/50/55/60; sequence_interval0.1 seconds.
Skill 4 skill_2_cooldown_reduction0.15/0.20/0.25/0.30/0.35;
skill_3_crit_damage_bonus0.10/0.15/0.20/0.25/0.30;
move_speed_pct0/5/10/15/20 with a stat_percent move_speed passive effect
at the resolved level. Existing Player percentage replacement avoids stacking
the prior level; dodge flat increments remain unchanged. No unlock changes.
Existing visuals use AtlasRegistry and UiSkin; no new assets or signals.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Hero 3 four skill curves, fixed-speed blades and formation movement bonus. |

Validation: full server/client static suites PASS; explicit five-level curves PASS; Godot TestHero3Rebalance verifies movement replacement, unchanged dodge increments, exact fixed blade speed under formation buffs, crit bonus and fan directions, plus legacy move-relative speed. TestHero3FallingSeal combat/VFX regressions PASS. Gate score 9/10. No seed/publication/deployment.

## Revision1.1.0 speed schema
Skill1 projectile_speed becomes416px/s at all five levels (+30%).
Skill3 adds arc_speed_pct=182/192.5/203/217/234.5 (% hero movement): 70% of existing speed_pct, used only by ordinary stage1 swords. Existing speed_pct remains260/275/290/310/335 for the final sword. SkillManager resolves the arc-only value through SkillValueService using a copied stats dictionary. Legacy remote configs without arc_speed_pct retain their speed_pct. Existing RPC payload/config schema remains additive, no local config fallback (C121). Damage, count, interval, range and visuals unchanged.

| 1.1.0 | 2026-10-24 | Skill1 flight+30%; Skill3 ordinary swords flight-30%; preserve finisher speed. |

Validation1.1.0: all-five-level speed curves and unchanged finisher speed pass; Godot TestHero3Rebalance PASS at416px/s under movement buffs; client/server static suites PASS. Gate score9/10. No publication/deployment.

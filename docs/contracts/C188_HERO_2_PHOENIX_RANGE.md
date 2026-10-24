# C188 Hero 2 Phoenix size and cast range

Version: 1.0.0
Status: ACTIVE

## Schema, RPC and interfaces

hero_2_skill_2 level stats carry radius=100/115/130/145/160 pixels,
cast_range=700 pixels and range=1024 pixels. The new numeric cast_range limits
initial target acquisition only; range remains the projectile travel budget.
VFX scale is old_scale * new_radius / old_radius, rounded to six decimals,
so the authored image shrinks in proportion to the collision radius.
Existing authenticated config RPC carries stats with no request changes.
SkillManager consumes cast_range via SkillValueService.get_fixed. Missing
or nonpositive cast_range blocks casting. Other skill behavior is unchanged.
C121: validated server config and connection required; no local gameplay fallback.
Existing AtlasRegistry assets are reused; no new UI or signals.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Reduce Phoenix radius/visual size; separate 700px cast range from 1024px flight. |

Validation: server/client static suites PASS; seed radius/cast/travel checks PASS;
Godot editor parser PASS. Gate score 9/10. No DB seed or deployment performed.

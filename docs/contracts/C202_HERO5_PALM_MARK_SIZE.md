# C202 Hero 5 palm and mark display sizes

Version: 1.0.0
Status: ACTIVE

## Presentation schema and interfaces
Reuse C201 manifest display_scale_multiplier: hero_5_skill4_effect2=0.7,
hero_5_skill3_sprite=2.0. BuddhaMark.setup applies0.7 to its initial base scale;
existing5% consecutive-hit growth is relative to this reduced base at all levels.
SkillManager's falling-palm stage1 visual applies2.0 to both its initial/end
scale at all five levels. No effect on crack/waves, palm radius, damage,
collision, timing, stun, punch or phantom sizes. Source PNGs remain3x3/400px.
All asset access stays in AtlasRegistry. No balance JSON/RPC/signals/UiSkin
changes and no local gameplay fallback (C121). Client presentation only.

## Acceptance
At every level assert palm moving visual start/end scales exactly2x configured
values and mark first-hit sprite scale exactly0.7x explosion_vfx_scale.
Existing tests prove damage/propagation/stun/mark increments remain unchanged.
Run corresponding Hero5 runtime regressions and complete static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Reduce initial Skill4 mark30%; double Skill3 stage1 palm artwork at every level. |

## Validation
Gate score: 9/10. TestHero5Rebalance and TestHero5GoldenBody PASS with explicit all-five-level size assertions; client and server static suites PASS.

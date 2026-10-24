# C201 Hero 5 finger display size after 400px normalization

Version: 1.0.0
Status: ACTIVE

## Presentation and interfaces
Hero5 Skill1 correctly uses hero_5_skill1_sprite.png,3x3/nine400px cells.
Its old vfx_scale0.0686..0.0882 yields only27.44..35.28px cell width.
Manifest display_scale_multiplier=3.135 (1254/400) restores the prior intended
world footprint of86.0244..110.6028px without changing gameplay.
AtlasRegistry.get_vfx_display_scale_multiplier(frame_id) reads optional
presentation metadata, default1 for all other sheets. Only the independent
gold-finger travelling SkillVfx applies the multiplier; hidden damage carrier,
hit radius, range, damage, explosion artwork/size and Skill4 punches unchanged.
Existing original scale data is not modified, so no balance publish is required.
No new RPC, PNG rewrite, UiSkin change or signals; C121 remains authoritative.

## Acceptance
Verify actual cast resolves requested PNG with400px cells and world width
86.0244/92.169/98.3136/104.4582/110.6028px across five levels; movement visual
uses compensated size and normal direct/explosion damage remains unchanged.
Run asset/grid and layered Hero5 regressions and both static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Compensate obsolete tiny finger scale after switching to400px cells. |

Acceptance: actual Hero5 casts at all five levels verify400px atlas frames and
compensated world widths86.0244/92.169/98.3136/104.4582/110.6028px.
Asset-grid test verifies requested PNG, independent explosion multiplier1,
unchanged60+25 damage and all90 cells. Both full static suites PASS.
Gate score9/10. No server balance edit, seed/publication or PNG rewrite.

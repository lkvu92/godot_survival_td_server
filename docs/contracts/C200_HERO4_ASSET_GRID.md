# C200 Hero 4 animation grid

Version: 1.1.0
Status: ACTIVE

## Presentation schema and scope
Six Hero4 animation sheets in the client AtlasRegistry manifest explicitly
declare columns3/rows3/frame_count9/frame_width400/frame_height400 and
normalize_grid=true. They are hero_4_skill_1,hero_4_skill_2,hero_4_skill_3a,
hero_4_skill_3b,hero_4_skill_4a,hero_4_skill_4b. Current source PNGs already1200x1200;
reuse C199 cached normalization only if future source exports differ in size.
Extend loading-screen normalizer warm-up to Hero4 paths as well as Hero5.
No PNG editing, balance/RPC/config-server changes; no local gameplay fallback
(C121). All assets still accessed through AtlasRegistry; UiSkin/signals unchanged.

## Needle animation update
The user replaced hero_4_skill_4_2_animation.png with a1200x1200 sheet,
3x3/nine400px frames. hero_4_skill_4b is now the sixth animated sheet;
needle_vfx_frames in server skills.json contains frame_0 through frame_8.
Client canonical needle_vfx_frames role ensures old one-frame remote metadata
also resolves the complete animation. Reuse the existing projectile animation
cadence/looping (0.06s per frame). Needle damage/speed/scale/poison unchanged.
Only *_projectile.png UI icons remain whole-image1254x1254.

## Acceptance
Verify all54 animation frames have exact400x400 row-major regions and use
the registered PNG. Actual Skill1 projectile frames resolve correctly through
the real cast. Confirm real needles animate all nine cells and UI icons remain full-image; run poison/trap
and vortex regressions plus full client/server static checks.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-24 | Replace former whole-image needle with user-provided3x3/nine400px animation and canonical role. |
| 1.0.0 | 2026-10-24 | Explicit400px Hero4 grid with full-image needle/icon exception and loading warm-up. |

Historical1.0.0 acceptance: Godot TestHero4AssetGrid PASS45 frames with exact400px cells,
registered source paths, real dart cast, whole needle and four full icons.
TestHero4Vortex and TestHero4PoisonTraps PASS. Complete client/server static
suites PASS. Gate score9/10. No gameplay seed, PNG rewrite or publication.


1.1.0 validation: Godot TestHero4AssetGrid PASS54 cells/six sheets and
real flying needle animation frames0..8 then loop0, with stale one-frame
metadata overridden cosmetically. TestHero4Vortex emission/DPS/stun/poison
regressions and complete server/client static suites PASS. Gate score9/10.
Server seed frame array now has9 IDs; no live seed/publication performed.

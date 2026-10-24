# C199 Hero 5 canonical visual roles and 400px frame grid

Version: 1.1.0
Status: ACTIVE

## Presentation schema and interfaces
Client atlas manifest adds hero_skill_vfx_roles[skill_id][role]=sheet_id,
with all four Hero5 skills explicitly mapped to approved presentation assets.
Skill1 explosion_vfx_frames always resolves hero_5_skill1_effect1 (user PNG),
not stale frame IDs/level overrides from old remote metadata. Primary/named
SkillVisualFrames ask AtlasRegistry for the canonical presentation role first;
all other heroes/unknown roles retain existing resolution. This is cosmetic
mapping only, never local gameplay JSON or balance override. C121 remains.

Ten Hero5 animation sheets (*_sprite and *_effect*) declare3x3/nine frames,
frame_width400/frame_height400 and normalize_grid=true. Source PNGs remain
unchanged. A non1200x1200 source is normalized to a cached1200x1200 texture
before row-major400px extraction; exact-size sources use original textures.
Preserve transparency; normalize once per path/size, not per animation frame.
Icons *_projectile.png are whole-image icons, not animation cells; preserve
their existing regions. No skills balance, RPC/payload, UiSkin or signal changes.

## Cache and acceptance
AtlasRegistry owns all access and normalized textures; tower asset scope release
must evict normalized texture and frame-cache derivatives for released paths.
Test all90 frames, region400x400,1200x1200 texture, row-major layout, exact
requested PNG path, cache identity and normalizer scope cleanup. Use an actual
Hero5 projectile hit with deliberately stale remote explosion IDs to prove the
spawned impact visual uses the right asset, not only metadata string checks.
Run Hero5 combat/VFX regressions and both static suites. No PNG regeneration,
server mutation or config publication required for this presentation fix.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Bind Hero5 visual roles and normalize animation grids to3x3/400px cells with scoped caches. |

Acceptance: TestHero5AssetGrid PASS all90 frames/ten sheets,400x400 regions,
1200x1200 textures, row-major cells, cache identity and scoped derivative
cleanup. Actual projectile collision with deliberately wrong root/level remote
frame arrays spawns the requested PNG at all nine frames, keeping60+25 damage.
Whole-image icons remain1254x1254. Hero5 layered/golden-body and Hero3 falling
seal regressions plus full client/server static suites PASS. Gate score9/10.
PNG source files and server skill data are unchanged; no seed/publish/deploy.

## Skill4 punch animation revision
Canonical punch_vfx_frames now resolves hero_5_skill4_effect1, 3x3 nine 400px frames. Projectile options set vfx_hold_last_frame=true: play once then retain frame8 until impact. Skill1 explosion and Skill4 target mark are unchanged. Existing RPC payloads/schema, damage, timing and online-only rules unchanged. No gameplay fallback.

| 1.1.0 | 2026-10-24 | Correct Skill4 flying punch asset and hold its final frame without looping. |

Validation 1.1.0: TestHero5GoldenBody PASS at all five levels, canonical punch asset and frame8 retention after30 animation ticks; client/server static suites PASS. Gate score9/10.

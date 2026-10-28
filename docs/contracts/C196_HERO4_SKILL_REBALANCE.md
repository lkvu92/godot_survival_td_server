# C196 Hero 4 poison skill rebalance

Version: 1.5.0
Status: IN_PROGRESS

## Revision 1.5.0 — Skill 1 recovery after C238

Supersedes Skill1 direct damage from v1.4: 40/55/70/85/100% ATK per dart. Preserve poison DPS 12.5/15/17.5/20/22.5 for 2s, cooldown 2.4/2.2/2/1.8/1.6, dart count 1/2/2/3/3, range, speed, visuals and every other skill. The purpose is to restore the primary skill after reduced persistent ATK growth; attack speed does not replace its own skill cooldown. No changes to poison stacking, RPC schema or offline rules. Authoritative source is server/data/skills.json; local rollout updates only this skill's levels with backup/readback, preserves other skills and copies the published settings snapshot for a new config version. Refresh authenticated bootstrap; no production deployment.

Raw direct volley budget, assuming every dart hits the same target: 20/45/50/82.5/90 → 40/110/140/255/300% ATK per cast. This excludes crit/DEF, missed darts and poison. Poison uses strongest/refresh, so do not multiply its duration budget by dart count. At hero Lv70 (ATK 1927.80), skill Lv5 per-dart direct damage before mitigation increases 578.34 → 1927.80; all-three-hit direct volley 1735.02 → 5783.41. This is a coefficient check, not measured combat DPS.

### Changelog addition

| Version | Date | Change |
|---|---|---|
| 1.5.0 | 2026-10-29 | Recover Skill1 direct-hit curve after C238; preserve poison and timing. |

## Schema and server authority
Validation 1.4.0: raw-budget/data regression and retained revision1.3 invariants PASS; Godot Hero4Piercing PASS including both-leg poison falloff and unchanged slow; Hero4PoisonTraps and Hero4Revision13 PASS; client static PASS. Source comparison proves every other skill including Skill4 unchanged. Selective local DB update changes only levels/description of Skill1–3, preserves other fields/skills/settings, and advances config41→42. Backup: workspace .tmp/hero4-poison-redistribution/1793093934907/. Updated client is required for Skill2 poison falloff; no production deployment. Existing vortex stun-dummy regression remains outside this revision; no full-suite acceptance claim.

Revision 1.4.0 supersedes prior damage curves: Skill1 direct hit is20/22.5/25/27.5/30 percent ATK; its existing2s poison remains12.5/15/17.5/20/22.5 DPS percent ATK. Skill2 converts half its prior85/95/105/115/125 direct coefficient into2s poison: direct42.5/47.5/52.5/57.5/62.5, poison DPS21.25/23.75/26.25/28.75/31.25. Its poison carries optional `scale_dps_with_range: true`; Projectile applies the same snapshotted spatial100%→30% multiplier to resolved DPS and direct damage on each leg, without altering slow or mutating shared effect dictionaries.

Skill3 already has poison. Move half its prior direct100.1/107.6/116/126.5/140 into the existing poison over its existing3/3.5/4/4.5/5 seconds: direct50.05/53.8/58/63.25/70; poison DPS61.683333333/70.371428571/79.5/89.055555556/99. Preserve all cooldown/range/count/visual/slow/unlock values and all Skill4 values.

Damage conservation is an isolated-hit raw budget: direct + DPS×duration. Existing strongest-poison/refresh semantics, crit/DEF/element calculations, target survival and repeat hits can change actual delivered totals; this revision does not introduce additive stacks or promise identical battle DPS. Data remains server-authoritative; no new RPC/storage schema/fallback. Local develop publication may selectively update only these three skill rows, with backup/readback, same active settings and a config version increment; no production writes.

Revision 1.3.0 supersedes the older values below: Skill1 poison DPS is
12.5/15/17.5/20/22.5 percent ATK per second (duration 2s, direct hit unchanged).
Skill2 visual vfx_scale is multiplied by 1.3 at every level; collision radius,
range, damage and piercing falloff remain unchanged. Skill4 in-run
createria_unlock.level changes 10 to 15; persistent hero_level_unlock stays 30.
Skill4 primary ground vortex renders at absolute Z=4 below the hero actor Z=5;
needle projectiles retain their existing layer. AtlasRegistry assets, UiSkin,
RPC schemas and online-only config requirements remain unchanged. No fallback.

Validation 1.3.0: five-level data/description curves PASS; Godot
TestHero4Revision13 verifies real primary vortex VFX at absolute Z=4 for all
five levels; TestHero4Piercing PASS with updated server config. Client static
runner PASS. Three local DB skill rows verified, all other skills unchanged;
local config version advanced. No production deployment. Gate 4 pending:
full server static runner stops at the existing Arc6 seed/generator mismatch.
Skill seed JSON is authoritative, no RPC changes or local fallback (C121).
Skill1: damage40/45/50/55/60, poison DPS percent25/30/35/40/45 for2s,
cooldown2.4/2.2/2/1.8/1.6, range680/700/720/740/760, count1/2/2/3/3.
Skill2: damage85/95/105/115/125, cooldown6.5/6/5.5/5/4.5,
range700/720/740/760/780, slow15/17.5/20/22.5/25 percent.
Skill3: poison DPS percent45/55/65/75/85 for3/3.5/4/4.5/5s,
radius85/95/105/115/125, trigger125/145/165/185/205,
slow10/15/20/25/30 percent, range725/750/775/800/825,
lifetime12.5/15/17.5/20/25s, max_traps3/4/5/6/9 per caster.
At cap retire oldest live armed trap without detonating; ignore expired or
exploded traps. Explosion artwork scales 1.3 times prior size, loops for1.5s;
damage/status apply once, not once per VFX loop. Other trap stats unchanged.
Skill4: total vortex damage120/130/140/150/160; needle damage25/27.5/30/35/40;
needles4/5/6/7/8; radius80/85/90/95/100; needle range250/275/300/325/350.
Vortex lasts2.5s, five equal damage ticks at0/0.5/1/1.5/2s. Each tick rolls
20% stun0.1s independently per enemy. Artwork loops and spins400 degrees/s.
Needles begin0.5s, random angles0.1s apart. Replace HP-percent poison stack:
each hit adds snapshot hero ATK*0.05 to existing poison DPS and adds0.5s to
remaining poison duration, starting at0.5s when none exists. Combined poison
DPS caps at5000 while active; ordinary poison refresh cannot exceed the cap.
Existing regular poison uses max potency/refresh; additive fields affect only
these needles. Poison expiry and pooled reset clear cap and source state.
Status ID remains poison, carrying additive_dps/duration_extension/dps_cap;
display duration follows accumulated timer. Existing sprites via AtlasRegistry,
UiSkin unchanged. New stats are optional for older compatible snapshots.

## Validation
Explicit curves, owner-specific trap cap/expiry, one-shot explosion damage,
loop/spin lifetime, five-tick damage budget and stun distribution, random needle
timing, additive poison synergy/cap/duration/expiry/pool reset must be tested.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.4.0 | 2026-10-27 | Halve Skill1 direct damage; shift half Skill2/3 direct coefficients into poison, preserving isolated raw budgets and spatial falloff. |
| 1.3.0 | 2026-10-27 | Halve Skill1 poison DPS, enlarge Skill2 art 30%, select Skill4 at combat Lv15 and render its ground vortex below heroes. |
| 1.0.0 | 2026-10-24 | Four skill curves, trap cap/VFX and five-tick spinning vortex with additive ATK poison. |

Acceptance: full server/client static suites and Godot parser PASS. TestHero4Vortex verifies all five needle counts, independent random angles, first0.5s/interval0.1s, five equal damage ticks summing to the configured total, 20% per-target stun distribution over10000 trials, 400deg/s spin and 2.5s loop lifetime. TestHero4PoisonTraps verifies Enemy and Player-based target poison synergy, duration extension,5000 DPS cap, expiry/clear reset, all five trap caps, owner isolation, oldest removal without explosion, expired slots, exactly-once damage and looped1.5s VFX. No new assets, no deployment/publication. Gate score9/10.

## Revision1.1.0 Skill3 visual sizes
Multiply Skill3 vfx_scale and explosion_vfx_scale by0.6 at every level: reduce idle trap and explosion artwork40%. Server seed remains authoritative through existing config snapshot RPC. No schema/interface additions, hitbox/range/damage/duration changes or offline fallback. Assets remain AtlasRegistry-managed3x3/400px.

| 1.1.0 | 2026-10-24 | Reduce Skill3 trap and explosion visual sizes40%. |

Validation1.1.0: exact five-level visual scale curves, TestHero4PoisonTraps and both static suites PASS. Gate score9/10. No publication/deployment.

## Revision 1.2.0 ? 2026-10-26: Skill 2 piercing distance falloff

H?i Ho?n ??c Lu?n pierces all hostile actors intersecting each swept movement segment, once per target on each outward/return leg. The outbound endpoint is clamped to the configured range. Skill stats add damage_min_range_multiplier=0.30 at every level. Direct damage multiplier is lerp(1,minimum,clamp(distance from original launch point to target / effective max range,0,1)); return hits use the same spatial curve, rising again toward the original launch point. The origin is snapshotted, so caster movement cannot change existing projectiles. No target-count attenuation or frame-dependent damage. Existing damage coefficients, slow, count, speed, cooldown, range and visuals remain. Projectile pool setup clears this option for other skills. Server config remains authoritative; no RPC changes or offline fallback.

| Version | Date | Change |
|---|---|---|
| 1.2.0 | 2026-10-26 | Skill2 swept piercing on both legs and linear direct damage 100% to30% at max range. |

Validation1.2.0: TestHero4Piercing PASS for all five level options, multiple targets crossed in one frame, exact100/82.5/65/47.5/30% spatial damage, returning-leg hits, endpoint clamp, off-line exclusion and pool option reset. Client static PASS. Local config version33 contains minimum multiplier0.3. Separate TestHero4Vortex fails its pre-existing dummy stun-distribution assertion; that test path and status behavior were not changed in this revision.

## Validation 1.5.0 (2026-10-29)

PASS targeted revision13 and poison-redistribution regressions; complete server/client static runners PASS. Source comparison against HEAD confirms only Skill1 direct damage and its tooltip rows changed. Local DB update/readback PASS, every other skill and field preserved, previous growth/levels kept; new config version copies existing published settings. No runtime code change or restart needed. Refresh login/bootstrap for new skill config. Real combat playtest remains pending; no production deployment.

# C196 Hero 4 poison skill rebalance

Version: 1.1.0
Status: ACTIVE

## Schema and server authority
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
| 1.0.0 | 2026-10-24 | Four skill curves, trap cap/VFX and five-tick spinning vortex with additive ATK poison. |

Acceptance: full server/client static suites and Godot parser PASS. TestHero4Vortex verifies all five needle counts, independent random angles, first0.5s/interval0.1s, five equal damage ticks summing to the configured total, 20% per-target stun distribution over10000 trials, 400deg/s spin and 2.5s loop lifetime. TestHero4PoisonTraps verifies Enemy and Player-based target poison synergy, duration extension,5000 DPS cap, expiry/clear reset, all five trap caps, owner isolation, oldest removal without explosion, expired slots, exactly-once damage and looped1.5s VFX. No new assets, no deployment/publication. Gate score9/10.

## Revision1.1.0 Skill3 visual sizes
Multiply Skill3 vfx_scale and explosion_vfx_scale by0.6 at every level: reduce idle trap and explosion artwork40%. Server seed remains authoritative through existing config snapshot RPC. No schema/interface additions, hitbox/range/damage/duration changes or offline fallback. Assets remain AtlasRegistry-managed3x3/400px.

| 1.1.0 | 2026-10-24 | Reduce Skill3 trap and explosion visual sizes40%. |

Validation1.1.0: exact five-level visual scale curves, TestHero4PoisonTraps and both static suites PASS. Gate score9/10. No publication/deployment.

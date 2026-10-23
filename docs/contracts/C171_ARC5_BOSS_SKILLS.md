# C171 — Arc 5 earth boss skills

- Version: `1.0.1`
- Status: `ACTIVE`
- Updated: `2026-10-22`

## Authority and schema

1.0.1 (2026-10-23): Increase earth_stones projectile_speed from 420 to 630 for earth_titan and primordial_god. Launch interval, orbit, damage, lifetime and hit radius unchanged.
Server enemies.boss_skills supplies earth_stones and earth_dragon dictionaries.
Numeric ranges, radii, durations, cooldowns, orbit geometry, projectile speed,
damage multipliers and effects are authoritative seed fields. Existing config
RPC/bootstrap carries them; no new RPC or offline gameplay fallback.

## Timeline and targeting
Sa Thạch Toái Kích (earth_titan, primordial_god): fixed target-center gravity
ring for 2s, movement x0.5, attack speed x0.7. Six looping stones and downwash
rings form a 60-degree hexagon around caster, rotate during charge, stones
upright at -90 degrees. At 2s they turn to zero; unreleased stones retain
fixed hexagonal offsets following caster. Release at 2,2.8,3.6,4.4,5.2,6s.
Each stone aims at current enemy target at release and flies straight, with
swept collision against opposing heroes. Hit deals 50% ATK, independent 25%
stun 0.2s, plus one 15% ATK AOE explosion. Misses expire after 5s.

Hoàng Long Phá Địa (primordial_god): same looping gravity ring for 2s.
Rune pulls opposing heroes continuously for 1.5s, ticks 10% at .5,1,1.5s.
Vortex follows from 1.5 to 3s; 5% ATK/s is integrated as 2.5% every .5s
(2,2.5,3s), total 7.5%. At 2.5s nonloop crater and dragon bite deal 250%
ATK and stun 1s. Full sequence damage 287.5% ATK if every phase hits.
Targets may leave the fixed area. Pull uses collision-aware movement and
respects control immunity. Bosses never damage or pull allied creeps.

## Interfaces and presentation
Enemy dispatches these types through EarthBossCast (extends CreepFireCast).
Cancellation on death, control, pooling, scene exit clears domains and all
future launches/projectiles. AtlasRegistry registers eight authored 3x3 sheets;
frame size is derived from source, including rectangular crater cells.
CreepFireVisual dynamically centers/scales these assets. No balance stats or
other Arc skills change. Unspecified ranges/cooldowns use explicit seed values.

## Changelog
- 1.0.0 (2026-10-22): Replace both Arc 5 mock boss skills with earth sequences.

## Acceptance evidence
Godot 4.6.3 TestArc5BossSkills PASS: 6 stones, 2s charge, fixed waiting
hexagon, swept hits, 390% full volley, 287.5% dragon total, rune pull speed,
gravity cleanup, dodge, control/pool cancellation, eight VFX cells and sizing.
Seeded real-hit stun sample: 4956/20000 = 24.780% (expected 25%).
Existing TestCreepFireSkills and client/server static suites PASS.
Validation used explicit seed fixtures; no running server DB was updated.

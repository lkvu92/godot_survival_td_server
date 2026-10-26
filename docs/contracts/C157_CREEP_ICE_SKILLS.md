# C157 — Arc 2 ice creep skills

- Version: `1.0.1`
- Status: `ACTIVE`
- Updated: `2026-10-26`

## Authoritative mapping

- `snow_skeleton` (`creep_1`), `horn_cactus` (`creep_2`), `crystal_bat`, `frost_wolf`: Băng Vuốt, 100% ATK at the target.
- `snow_mage`: Băng Đạn, 100% ATK; 20% move slow and a separate 20% chance to reduce attack speed by 20%.
- `frost_giant`, `frost_lancer`: Băng Trụ Chấn Địa, 100% ATK; 15% freeze for 0.5s and separate 20% attack-speed slow for 1.5s.
- `ice_golem`, `ghost_low`: Cực Băng Tam Trọng Thiên: 2s 30% slow mist, 150% boulder hit, 20% impact with 50% freeze for 1s, then three 10% shockwaves at 0.8s with independent 20% freeze for 0.5s.
- `ghost_low`: Băng Linh Lung: 2s 30% slow mist, 150% wisp strike, 50% cocoon hit with 1.5s freeze, then 50% splinter burst.

All percentages are caster ATK. Damage uses the shared combat resolver. Ice assets are registered as nine-frame 3x3 sheets; gameplay radii determine hits independently of transparent image margins.

`creep_1` and `creep_2` are the cutout/asset labels for authoritative roster IDs `snow_skeleton` and `horn_cactus`; the skill is attached to those real IDs.

## Changelog

- `1.0.0` (2026-10-21): Added Arc 2 regular and boss ice-skill data, cast phases, VFX registration and attack-speed slow status.

## Revision 1.0.1 ? final Arc2 boss mapping

After C139 the final boss of displayed Arc2 is ghost_medium at stage_1_10 wave20. It receives the existing ghost_low ice_trinity and ice_linglong definitions, with C222 cast ranges700/550. Boss stats, rewards, stage entries and all skill timings/damage/effects are preserved. Existing enemies.boss_skills transport and Enemy dispatch apply; no RPC/client changes or offline fallback.

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-26 | Attach both existing Water skills to actual final Arc2 boss ghost_medium. |

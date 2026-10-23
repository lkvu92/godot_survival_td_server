# C169 — Arc 5 earth creep attacks

- Version: `1.0.0`
- Status: `IN_PROGRESS`
- Updated: `2026-10-22`

## Schema and authority
Existing authenticated enemies config carries attack_skill dictionaries.
Fields: type, display_name, range, radius, damage_multiplier, effects;
earth_orb also has detonation_delay. No new RPC or local gameplay fallback.
Missing/invalid remote config blocks gameplay under C121.

## Interfaces
Enemy._try_attack dispatches earth_punch and earth_orb to CreepFireCast.setup.
Both snapshot ATK and target center. Punch hits immediately in 85px AOE for
100% ATK, with independent 15% stun for 0.5s per target. Orb condenses at
the snapshotted center, detonates after 0.5s in 65px AOE for 100% ATK, with
20% paralysis for 0.2s per target. No travelling projectile or legacy slow.
Death, control or pool reuse cancels delayed damage. Ordinary attack cadence
and stats remain unchanged. Unspecified damage and radii use these seed values.

## Presentation
Hám Địa Bạo Quyền: granite_colossus, sand_stalker, 2-basic-punch.png,
nine 400px cells. Ngưng Sa Bạo Châu: seismic_shaman and requested amber_spirit
(identity pending), 1-sand-ball.png, nine 418px cells. AtlasRegistry owns assets.
The orb sheet condenses once over 0.5s; its final sphere frame expands and
fades over 0.25s at detonation. Punch plays once over 0.5s.

## Verification
Godot 4.6.3 headless: punch proc 3111/20000 (15.555%, expected 15%);
orb proc 3951/20000 (19.755%, expected 20%). Six-standard-error bounds pass.
Tests check 0.5s detonation, fixed center, dodge, interruption, exact status
duration, authored cell sizes/centering and world diameter. Client and server
static suites pass. amber_spirit mapping remains pending user clarification;
only the three existing requested enemy definitions are changed.

## Changelog
- 1.0.0 (2026-10-22): Add named Arc 5 earth punch and delayed orb attacks.

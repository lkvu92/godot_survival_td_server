# C187 Hero 2 skill 1 spread

Version: 1.0.0
Status: ACTIVE

## Behavior and schema

Hero 2 skill 1 adjacent projectile angles are 10 degrees (previously 15).
Projectile counts by skill level remain 1/1/2/2/3. Offsets are [0], [0,10],
and [-10,0,10]; the center ray remains homing and side rays remain straight.
No schema or RPC payload/interface changes. Existing authenticated config carries
updated skill descriptions from server/data/skills.json. No new assets or UI.
C121 applies: complete server config/connection required, no local fallback.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Narrow Hero 2 Skill 1 adjacent rays to 10 degrees; three-ray full cone 20 degrees. |

Validation: server/client static suites PASS; Godot editor parser PASS.
Gate score 9/10. Skill descriptions match 10 degrees; assets unchanged.
No seed publication or production deployment.

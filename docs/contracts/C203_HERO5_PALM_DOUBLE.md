# C203 Hero 5 Skill 3 doubled scale and range

Version: 1.1.0
Status: ACTIVE

## Schema and interfaces
Double existing server-authoritative level stats: range, radius, wave_radius,
wave_ring_width, wave_collision_padding, vfx_scale, crack_vfx_scale,
wave_vfx_scale at all five levels. Retain C202 palm display multiplier 2:
the final rendered palm is twice its immediately previous size.
Crack shares palm radius. All wave start/end sizes double proportionately.
No damage, cooldown, duration, wave count or stun changes. Above-height is
animation travel rather than combat range and remains unchanged.
Existing config snapshot RPC/schema and SkillManager interfaces unchanged.
Publish server skills through the normal catalog pipeline; no local gameplay
fallback is allowed under C121. Assets remain AtlasRegistry managed.

## Acceptance
Verify exact doubled curves and unchanged other fields; run Hero5 combat
regression plus both repository static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Double all Skill3 visual scales and combat distances relative to C202. |

## Validation
Gate score 9/10: exact eight-field curves pass; Hero5 runtime combat regression PASS, including doubled palm/edge wave reach; both full static suites PASS. No publication/deployment performed.

## Revision 1.1.0
Multiply the three visual scales vfx_scale, crack_vfx_scale, wave_vfx_scale by 0.8 relative to 1.0.0, at all five levels. Preserve all combat distances and other stats. Existing server snapshot schema/RPC, presentation multiplier and online-only rules remain unchanged.

| 1.1.0 | 2026-10-24 | Reduce all Skill3 visual sizes20%, retaining combat range. |

Validation1.1.0: exact scale curves, Hero5 runtime regression and both static suites PASS. Gate score9/10.

# C179 Campaign tank HP

Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-23

## Change

Campaign tank base HP is reduced from 2.50x–2.63x to 1.50x the base HP of the
standard grunt in the same arc. This applies to Lava Brute, Horn Cactus, Ent
Protector, Shield Sentinel, and Granite Colossus.

| Tank | Base HP before | Base HP after | Arc grunt ratio after |
|---|---:|---:|---:|
| Lava Brute | 420 | 240 | 1.50x |
| Horn Cactus | 480 | 285 | 1.50x |
| Ent Protector | 580 | 345 | 1.50x |
| Shield Sentinel | 700 | 420 | 1.50x |
| Granite Colossus | 1050 | 600 | 1.50x |

Granite Colossus retains its `max_hp_buff` of 1.15x, making its effective
spawn HP 1.725x its grunt: still within the 1.25x–1.75x target. DEF, movement,
attack values, skills, rewards, wave composition, timing, and difficulty
multipliers are unchanged.

## Verification

`tests/test_campaign_wave_roles.cjs` verifies each raw tank/grunt ratio is
exactly 1.50x and each effective spawn ratio, including max-HP buffs, is within
1.25x–1.75x. The existing role and campaign seed checks remain required.

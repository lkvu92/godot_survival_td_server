# C141 Hero skill 1 range

Version: 1.1.0
Status: IN_PROGRESS  
Date: 2026-10-21

## Contract

Set the range at every level of `hero_1_skill_1` through `hero_5_skill_1`
within 60%--70% of the 1280-unit design viewport height: 768--896 units.
Existing values inside this interval remain unchanged; values below or above it
are clamped to its nearest bound. Each result must also exceed that hero's
`basic_attack_range` by at least 15%.

The authoritative values live in `server/data/skills.json` and are published
through the existing Nakama skill seed. All other skill properties and skill
IDs stay unchanged. The client uses the resolved range for target selection
and projectile travel; existing talisman range bonuses continue to apply.

Data schema: unchanged numeric `levels[].stats.range`. RPC payloads: unchanged.
Interface: existing skill configuration snapshot. Offline fallback: none.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-21 | Clamp every hero skill 1 range to 768--896 units (60%--70% of the design viewport height); include hero 2 and enforce the 15% minimum above basic attack range. |
| 1.0.0 | 2026-10-19 | Increase skill 1 range by 15% for heroes 1, 3, 4 and 5. |

## Verification

All 25 levels for hero skills 1--5 must be within 768--896 units and at least
1.15 times their corresponding `basic_attack_range`. JSON parsing and scoped
range checks must pass. No live Nakama database is seeded as part of this data
change.

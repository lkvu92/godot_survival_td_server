# C141 Hero skill 1 range

Version: 1.0.0  
Status: IN_PROGRESS  
Date: 2026-10-19

## Contract

Increase `levels[].stats.range` by exactly 15% for `hero_1_skill_1`,
`hero_3_skill_1`, `hero_4_skill_1`, and `hero_5_skill_1` at all five levels.
The authoritative values live in `server/data/skills.json` and are published
through the existing Nakama skill seed. All other skill properties and skill
IDs stay unchanged. The client uses the resolved range for target selection
and projectile travel; existing talisman range bonuses continue to apply.

Data schema: unchanged numeric `levels[].stats.range`. RPC payloads: unchanged.
Interface: existing skill configuration snapshot. Offline fallback: none.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-19 | Increase skill 1 range by 15% for heroes 1, 3, 4 and 5. |

## Verification

All 20 new values equal the previous value multiplied by 1.15; other skill
levels are unchanged. JSON parsing and scoped whitespace checks pass. The
repository-wide static suite stops at the missing
`tests/test_new_profile_inventory.cjs` file after its earlier checks pass.
Gate 4 remains pending that existing test-suite issue. No live Nakama database
was seeded as part of this data change.

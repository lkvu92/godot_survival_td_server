# C222 — Boss skill cast ranges

- Version: 1.0.0
- Status: IN_PROGRESS
- Updated: 2026-10-26

## Data and interfaces

User-approved enemy `boss_skills` array slot 1 has `range: 700`; slot 2, when present, has `range: 550`. This includes campaign bosses, both Arc 6 Wraith variants, the source Wraith definition and the dummy boss. No missing skills are created. Skill 3/4, damage radii, basic attack range, cooldowns and effects retain existing values. Dedicated tribulation configuration is outside this enemy boss-skills schema.

Existing config seed and get_game_config payloads carry the dictionaries. Enemy's existing range gate consumes the values; no new RPC, interface or client fallback. Authenticated complete published configuration remains required.

Arc 6's earlier full-run balance evidence predates these targeting changes and must not be treated as measured evidence for the revised ranges. Current recommendation values are retained pending another balance audit.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-26 | Set enemy boss skill 1 cast range to 700 and skill 2 to 550. |

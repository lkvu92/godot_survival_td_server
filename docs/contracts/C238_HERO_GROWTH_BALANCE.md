# C238 Hero growth balance round 2

Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-29

## Contract

Implement the user-approved round-2 growth curves for all five heroes. Preserve Lv1 attributes, prices, requirements, elements, ranges and every skill. Authoritative schema stays `game_heroes.level_up_stats` (numeric JSON object); `server/data/heroes.json` is versioned seed input. See [simulation and exact curves](../HERO_STATS_CURRENT.md).

Persistent stats hp/atk/def/move_speed/attack_speed/attack_range multiply once per level; crit_rate/crit_damage/regen_percent_per_10s add once per level. Existing clamps remain 100% crit, 1000% crit damage and 10% HP/10s regen. Hero cap remains 70 and cannot exceed account level.

In-run Player._apply_level_up_stats uses the same growth data: multiplicative stats add run base x (factor - 1) x 0.25 per temporary level; additive stats add the full increment. Preserve this formula, healing from increased max HP and buff application. Therefore this balance intentionally also changes temporary level gains and speed-dependent skills. No skill coefficient changes.

## Interfaces and rollout

Existing seed_game_data request `{table:"heroes",rows:[hero objects]}` and config heroes/all response schemas are unchanged. progressionHeroAttributes and Player methods remain unchanged. Clients need a fresh authenticated bootstrap after local hero config synchronization. No local gameplay fallback; C121 blocks gameplay on missing/invalid snapshots.

Only local Docker project survival_td_local is eligible for local synchronization. Update only the five existing hero growth objects; verify readback and preserve every other hero field. Do not rewrite player profiles or cached historical attributes, deploy production, or publish unrelated draft settings. canonicalHeroStates recalculates current_attribute from authoritative hero config and saved level when loading the player. Preserve ownership, level and EXP; no mass profile migration is included.

## Acceptance

Verify Lv1/50/70 against the actual backend calculator; check H4 remains fastest, H2 leads the basic-attack proxy at Lv50/70, H3 has highest DEF and H5 highest HP. Run backend build and both static runners. Full combat difficulty and animation throughput remain playtest limitations, not proven balance.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-29 | Round-2 hero growth, exact simulation, per-hero documentation and scoped local rollout. |

## Verification (2026-10-29)

PASS backend build and runtime packaging; C238 tests exercise actual compiled progressionHeroAttributes/canonicalHeroStates at Lv1/50/70, exact curves, role ordering and stale-stat refresh while preserving ownership/level/EXP. PASS complete server static runner (including C238) and client static runner. Local growth-only transaction verified all five rows and preserved every other hero field; backup stored under server/tmp/c238-hero-growth-before-*.json. A new local config version copies the existing published remote snapshot, without publishing draft settings. Local Nakama restarted; healthcheck HTTP 200 and post-restart DB verification PASS.

Gate score: 9/10 for implementation/config acceptance. No production deployment. Real combat difficulty, skill DPS and H4 animation throughput remain unmeasured; these are playtest follow-ups, not assertions of proven balance.

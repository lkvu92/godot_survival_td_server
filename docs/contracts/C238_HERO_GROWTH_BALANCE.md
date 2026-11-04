# C238 Hero growth balance round 2

Version: 1.1.2 | Status: ACTIVE | Updated: 2026-11-04

## Contract

Implement the user-approved round-2 growth curves for all five heroes. Preserve Lv1 attributes, prices, requirements, elements, ranges and every skill. Authoritative schema stays `game_heroes.level_up_stats` (numeric JSON object); `server/data/heroes.json` is versioned seed input. See [simulation and exact curves](../HERO_STATS_CURRENT.md).

Persistent stats hp/atk/def/move_speed/attack_speed/attack_range multiply once per level; crit_rate/crit_damage/regen_percent_per_10s add once per level. Existing clamps remain 100% crit, 1000% crit damage and 10% HP/10s regen. Hero cap remains 70 and cannot exceed account level.

In-run Player._apply_level_up_stats uses the same growth data: multiplicative stats add run base x (factor - 1) x 0.25 per temporary level; additive stats add the full increment. Preserve this formula, healing from increased max HP and buff application. Therefore this balance intentionally also changes temporary level gains and speed-dependent skills. No skill coefficient changes.

## Approved round-3 adjustment (2026-10-30)

Keep all Lv1 stats, all skills and Hero 1/3/5 unchanged. Use the Lv70 mean of Hero 1/3/5 as the reference: Hero 2 ATK targets +50%, Hero 4 attack speed targets +100%. Hero 2 HP targets +15% and Hero 4 HP +10% relative to their previous Lv70 HP; these are endpoint targets achieved through growth, not flat bonuses at all levels. Additive crit-rate/crit-damage increments use percentage points per level.

| Hero | Growth stat | Previous | New |
|---|---|---:|---:|
| hero_2 | hp | 1.055 | 1.057139 |
| hero_2 | atk | 1.08 | 1.078060 |
| hero_2 | crit_rate | 0.005 | 0.0033 |
| hero_4 | hp | 1.055 | 1.056458 |
| hero_4 | attack_speed | 1.02 | 1.016488 |
| hero_4 | crit_damage | 0.02 | 0.012 |

Authority, schema, bootstrap and in-run formula are unchanged. Local synchronization must preserve all other hero fields and copy only the current published config snapshot when advancing its version. Do not publish production. Historical C239 reports measured round-2 hero growth and do not establish acceptance for round 3.

## Interfaces and rollout

Existing seed_game_data request `{table:"heroes",rows:[hero objects]}` and config heroes/all response schemas are unchanged. progressionHeroAttributes and Player methods remain unchanged. Clients need a fresh authenticated bootstrap after local hero config synchronization. No local gameplay fallback; C121 blocks gameplay on missing/invalid snapshots.

Only local Docker project survival_td_local is eligible for local synchronization. Update only the selected hero growth objects (round 3: hero_2 and hero_4); verify readback and preserve every other hero field. Do not rewrite player profiles or cached historical attributes, deploy production, or publish unrelated draft settings. canonicalHeroStates recalculates current_attribute from authoritative hero config and saved level when loading the player. Preserve ownership, level and EXP; no mass profile migration is included.

## Acceptance

Verify Lv1/50/70 against the actual backend calculator; check H4 remains fastest, H2 leads the basic-attack proxy at Lv50/70, H3 has highest DEF and H5 highest HP. Run backend build and both static runners. Full combat difficulty and animation throughput remain playtest limitations, not proven balance.

## Changelog

1.1.2 admin display correction: show exact level_up_stats coefficients and choose
multiply/add notation by the stat's contract, never by the magnitude of its
numeric value. HP/ATK/DEF/move_speed/attack_speed/attack_range are multiplicative;
crit_rate/crit_damage/regen_percent_per_10s are additive. This is display-only and
does not change hero growth data or either runtime growth formula.

| Version | Date | Change |
|---|---|---|
| 1.1.2 | 2026-11-04 | Correct admin growth labels for additive versus multiplicative stats; retain raw DB coefficients. |
| 1.1.1 | 2026-10-30 | User-authorized production catalog-only rollout of the six approved H2/H4 growth fields; preserve other catalog fields, seed data outside scope, profiles and published settings. |
| 1.1.0 | 2026-10-30 | Approved H2 ATK/HP/crit-rate and H4 HP/attack-speed/crit-damage growth adjustment; Lv70 endpoint targets and updated stat tables. |
| 1.0.0 | 2026-10-29 | Round-2 hero growth, exact simulation, per-hero documentation and scoped local rollout. |

## Verification (2026-10-29)

PASS backend build and runtime packaging; C238 tests exercise actual compiled progressionHeroAttributes/canonicalHeroStates at Lv1/50/70, exact curves, role ordering and stale-stat refresh while preserving ownership/level/EXP. PASS complete server static runner (including C238) and client static runner. Local growth-only transaction verified all five rows and preserved every other hero field; backup stored under server/tmp/c238-hero-growth-before-*.json. A new local config version copies the existing published remote snapshot, without publishing draft settings. Local Nakama restarted; healthcheck HTTP 200 and post-restart DB verification PASS.

Gate score: 9/10 for implementation/config acceptance. No production deployment. Real combat difficulty, skill DPS and H4 animation throughput remain unmeasured; these are playtest follow-ups, not assertions of proven balance.

## Verification round 3 (2026-10-30)

PASS actual backend calculator at Lv1/30/50/70, exact six growth changes, endpoint ratio targets (H2 ATK 1.5x reference, HP 1.15x previous; H4 attack speed 2x reference, HP 1.10x previous), additive crit targets and stale-stat refresh preserving progress. Base attributes, all skills, Hero 1/3/5 and every other field are unchanged.

PASS complete client/server static suites and backend build/runtime packaging. PASS local growth-only transaction and readback for hero_2/hero_4 using `tools/sync_hero_growth_local.cjs --apply --heroes=hero_2,hero_4`; unselected rows and all other hero fields were preserved. Backup: `server/tmp/c238-hero-growth-before-*.json`. Published config version advanced by copying the current published snapshot; no draft settings or player profiles were written. Local healthcheck HTTP 200. No production deployment; clients need fresh login/bootstrap.

Six mortal full-stage probes (H2/H4 x Normal/Epic/Legend, seed239, Lv60, pilot, ordinary offered cards, kite) produced no runtime errors/timeouts. H2 died at waves 10/7/7 (historical round2 same seed: 8/7/7); H4 died at waves 8/6/3 (historical: 8/7/5). These are diagnostic observations, not a measured population win rate or proof of equivalent difficulty. [Runtime evidence](../reports/C238_HERO24_ROUND3_RUNTIME.json). The user's stat targets are implemented; further combat tuning remains separate from formula/config acceptance.

Lv70: H2 HP16,650.11 / ATK5,363.94 / AS3.30 / CRR34.77% / CD313%; H4 HP16,368.39 / ATK1,927.80 / AS6.03 / CRR50.5% / CD262.8%.

Gate score: 9/10 for formula/config implementation and local rollout. The historical round2 verification above remains unchanged as history.

## Production rollout authorization (2026-10-30)

The user explicitly requested deployment after accepting the round-3 local rollout. This authorizes production catalog-only deployment to the existing `nakama-server` / `nakama-postgres` stack at api.lkvustudio.com (14.225.217.231). Only H2 hp/atk/crit_rate and H4 hp/attack_speed/crit_damage growth fields are in scope. Preserve other growth fields and all other hero rows/attributes/skills. Back up production hero rows and seed file, compare against the read-only audited digest, apply a guarded transaction, update the matching six seed fields for subsequent releases, verify DB/seed and served get_game_config rows, and check external health. No runtime build/restart, C239 publication, full-catalog seed, draft-settings publication or profile writes are authorized by this scoped rollout. Catalog tables are read directly by get_game_config; per SEEDING.md a new remote settings release is not needed. Earlier no-production statements describe the completed local-only step; this explicit later user instruction authorizes the scoped production operation.

## Production verification (2026-10-30)

VERIFIED: six approved growth fields updated in production DB and remote seed; guarded before/after full-table checks preserved all other fields. Loopback and public HTTPS get_game_config return the new values; local health HTTP200. Active published settings version17 and snapshot hash unchanged; no runtime restart or player writes. Backup and public health-route observation: [production rollout report](../reports/C238_PRODUCTION_ROLLOUT.md). Fresh login/bootstrap and a new battle are required.

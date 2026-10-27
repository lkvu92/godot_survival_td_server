# C134 Victory reward multiplier and System ad configuration

Version: 1.0.2 | Status: IN_PROGRESS | Updated: 2026-10-28

## Authority and configuration

Stamina storage is capped at `system.stamina_storage_max` (canonical configuration/default **200**) for all grants, including current and legacy daily-pack/IAP snapshots. Natural regeneration/refill target remains `system.stamina_max` (**30**). Snapshot reward amounts remain intact, but applied stamina cannot exceed available storage; repeated daily claims without spending stamina must stop accumulating at 200. Client reads the same published System values; no RPC/schema or offline behavior changes. Regression fixtures must verify the configured storage cap rather than expecting 330/630 or capping purchase rewards at the natural regeneration target.

All rewarded placements read the published `system.rewarded_ads` JSON in remote_config_settings (module=system,key=rewarded_ads,value_type=json), not hardcoded amounts or the legacy game_content_configs/rewarded_ads row. Keep the existing schema `{schema_version,placements,daily_mission}`; placements provide type, amount, optional daily_limit/run_limit, item_id and enabled. Defaults provide stamina +15/3 per UTC day, fragment mission 3 views for 1 fragment, one charm per day each, card reroll 3/run, revive 1/run; new stage_reward_x2_ad gives multiplier 2 with 5 successful rewards per UTC day. Missing/invalid config fails closed; zero limits/disabled placements block new claims. Server quotas and current UI use the same published settings. A generated targeted SQL patch bootstraps this system setting from the existing active ad catalog plus the new placement, then requires immutable config publication. No player reseed.

## Victory multiplier

Settlement atomically saves server-generated EXP, first-clear bonus, loot and hero identity in its run record. Only the most recent settled winning normal-stage run can be doubled; no defeat, training arena, active run, client-provided reward or reroll. prepare_rewarded_ad carries `{run_id}` and binds the credit to this run. Verified/no-ads delivery uses the existing rewarded ledger and UTC quota reservation. Additional rewards equal snapshot × (multiplier-1), applied once across profile, hero, inventory and run via version-checked storageWrite. A run marker makes retries/crashes/multiple ad sessions idempotent. EXP observes existing cultivation gates and Hero caps; no extra stage completion, durability loss or random loot roll.

HUD places an ad icon with multiplier beside the plain “Phần thưởng” label, only after successful winning settlement. Show remaining quota, busy/claimed/disabled states, and update totals from server reward summary after claiming. Prevent leaving the result during the request. Ad cancellation/failure/offline grants no local rewards. No-ads entitlement follows the same limits and run binding.

## Interfaces and acceptance

Existing prepare/confirm rewarded RPCs gain stage_reward_x2_ad context and canonical stage_reward response. award_stage_progression adds stage_reward summary. No client supplies multipliers or reward quantities. Cover victory/loss/training, duplicate sessions, CAS failure/recovery, quota exhaustion/date rollover, config changes, paused HUD and configurable stamina/charm/fragment/reroll values. Build runtime, client static checks and focused server/Godot tests. Production runtime, system-setting patch and config publication are separate rollout operations.

| Version | Date | Change |
|---|---|---|
| 1.0.2 | 2026-10-28 | Confirm user-approved storage cap 200 across daily-pack/current/legacy tests; preserve regeneration target 30 and purchased reward snapshots. |
| 1.0.1 | 2026-10-26 | User-approved stamina ad default +15; canonical seed aligned with System bootstrap and settings documentation. Daily quota stays three. |
| 1.0.0 | 2026-10-18 | Initial server-authoritative victory multiplier, five/day default and centralized System ad configuration. |

## Local validation (2026-10-18)

Runtime build, focused reward/settlement/config tests, client static checks, TestResultRewardAds and TestSystemRewardedUI passed. Native disposable PostgreSQL verified System migration, preservation of operator overrides, idempotency, five daily slots, sixth rejection and user isolation. Full server static runner remains blocked by its existing missing tests/test_new_profile_inventory.cjs; existing TestResultScroll expects 330px while the current layout uses 250px. Contract remains IN_PROGRESS pending those suite issues and live mobile/SSV acceptance.

Rollout: review server/temp/rewarded-system.sql, apply with the matching runtime, then publish a new immutable config release. No live database or deployment was changed.

Operator documentation: [System Settings guide](../SYSTEM_SETTINGS.md) covers every placement, defaults, validation, UTC quotas, draft/publication and troubleshooting.

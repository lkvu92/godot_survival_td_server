# C135 Weekly leaderboard rewards

Version: 1.0.0 | Status: IN_PROGRESS | Updated: 2026-10-18

## Authority and period

Server-only score snapshots for cultivation_realm, campaign_stage and combat_power. Weekly interval is Monday 00:00 UTC (07:00 Vietnam), [start,end). Ranking is current achieved score, not weekly gain; only players with an authenticated profile sync/gameplay update in that week participate. Startup backfill never qualifies inactive players. Equal scores use time score was achieved, then account ID. No client score, tier, reward, clock or rank is trusted. Existing lifetime boards remain separate from weekly reward standings.

Published system.leaderboard_rewards contains schema_version=1, enabled, claim_days=30 and boards with enabled and 13 non-overlapping tiers: individual 1..10, 11..50, 51..200, 201..500. Each tier contains from,to,rewards with type resource/item/random_item, id/pool, amount. Defaults are the approved table: top1 each board 300 gems/100000 gold; Tu vi 3 enlightenment charms, Campaign 15 random same-type low fragments, Power 3 enhance charms. Full table lives in server/data/leaderboard_rewards.json. Snapshot config/release version is frozen at period creation; later releases apply to the next period. Missing/invalid config creates no period or local fallback. Existing finalized entitlements remain claimable when new periods are disabled.

## Persistence and concurrency

PostgreSQL periods, scores and awards are server-only. All score writes and finalization serialize with a transaction advisory lock using database time; late requests belong to the new period. Finalization atomically ranks eligible non-archived/non-disabled accounts, materializes top500 rewards with one persisted random fragment type and closes the period. Unique (period,board,user) prevents duplicate entitlements. Scheduled tick via trusted HTTP-key/admin RPC plus lazy tick on player sync/list/status recovers missed jobs and restart; never reconstruct past scores from current profiles. First deployment starts a partial current week, with no historical awards.

Claims use a server-only storage marker keyed by period+board in the same version-checked storageWrite as profile and inventory. Replay returns current canonical state, never grants again. SQL awards are immutable; authoritative claimed status comes from marker, avoiding a cross-store commit gap. Expiry uses database time: close+claim_days. Item reward snapshots persist across catalog/config changes; archived/disabled accounts cannot claim through account guard. Account linking keeps the selected profile and its markers/awards; archived-profile unclaimed awards do not transfer, matching consumable balance rules.

## RPC and UI

get_weekly_leaderboard_rewards({board_id}) -> success, server_time_ms, period(start/end/config_version), tiers, records top50 with ranks, my_record, awards[{period_id,board_id,rank,score,rewards,expires_at_ms,claimed,expired}]. claim_weekly_leaderboard_reward({period_id,board_id}) -> success, already_claimed, rewards, profile, inventory. weekly_leaderboard_tick accepts no client dates/config and is restricted to runtime HTTP-key requests (no user) or CONFIG_ADMIN_USER_ID.

Leaderboard adds Thuong tuan dialog for selected category, countdown, weekly rank, reward tiers and previous claims. Uses UiDialog, UiSkin, ScrollBarUI; server response alone changes inventory/profile. Offline/account change/requests in flight block claims and late UI writes. Mapped display labels only are local; no balance fallback.

## Acceptance and rollout

Test all 13 tier boundaries, triple-board totals, equal scores, Monday boundary, inactivity, archived accounts, concurrent finalization, duplicate claims and CAS recovery, stored random selection, config freeze/invalid data, expiry, disabled categories, online UI/mobile scroll. Build runtime and run static/focused tests. Deploy matching runtime, stage/publish System setting, schedule tick every minute; no live deployment is part of implementation.

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-18 | Approved weekly rewards, atomic finalization/claims, configuration and UI. |

## Local validation (2026-10-18)

PASS: runtime build/packaging; approved default/draft parity and publish validation; PostgreSQL finalization with 1500 awards and concurrent workers; all rank boundaries, ties, inactive/archived/disabled accounts, config freeze, retained random item selection, forged reward rejection, atomic storage CAS/replay and expiry; Nakama JSONB byte decoding; seed/config roundtrip and publication integration; scheduler unit tests; client static checks and C118 combat-power/C134 rewarded regressions; TestWeeklyLeaderboard desktop/mobile scroll, busy/failure/claimed/expired/offline states.

The complete server static runner still stops at its pre-existing missing tests/test_new_profile_inventory.cjs. Contract remains IN_PROGRESS pending that suite issue and live Nakama/mobile acceptance. No production data, deployed runtime, config publication or host scheduler was changed. Rollout is documented in server/docs/WEEKLY_LEADERBOARD_REWARDS.md.

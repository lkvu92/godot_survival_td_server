# C144 Stage grades and campaign sweep

Version: 1.0.3 | Status: ACTIVE | Date: 2026-10-20

## Authority and schema

No Redis. Server configuration owns grading (S >90%, A >80%, B >70%, C >60%, D otherwise on victory), quantity multipliers 1/.9/.8/.7/.6, fixed base quantities, 90-second rounds, one campaign ticket plus one stamina per successful round. Defeat has no grade. Best grades are keyed by stage and difficulty; historical ungraded clears never imply S. Current run grade determines ordinary rewards; only exact S mode permits sweep. Training/admin stages excluded. Grading HP is the current defended objective: existing campaign has no separate base actor and defeats on player death, so use hero remaining HP/max HP. Future base-defense content must explicitly configure its objective. HP report must be bounded and bound to the active run; existing client combat authority limitations must be documented.

Authoritative player storage holds sweep state, reservations, round receipts and activity lock. All reward/resource/activity mutations use version-checked atomic storage batches, including the shared profile fence. No cross-store distributed transaction. Scheduler index is recoverable projection only. Account/server scoping follows C143. Server timestamps determine eligibility and cancellation; cancellation settles rounds due at or before server cancellation time, releases unused reservations and unlocks only after settlement. Retry cannot duplicate a receipt. A worker crash before commit changes nothing; after commit retries return committed results.

Session: {session_id,request_id,stage_id,level_id,hero_id,total_rounds,completed_rounds,started_at_ms,next_due_at_ms,status,cancel_at_ms?,reserved_tickets,reserved_stamina,config_snapshot,state_version,receipts}. Terminal states completed/cancelled; blocked errors retain explicit recovery/cancellation path. One active session per user. Shared profile activity excludes every combat entry, including tribulation/admin. Concurrent combat/sweep starts fence on the same version; no read-only lock check. Closing app never abandons sweep.

## RPC and interfaces

Authenticated, version/account guarded RPCs: get_sweep_options {}, preview_sweep {stage_id,level_id,hero_id}, start_sweep {stage_id,level_id,hero_id,rounds,request_id}, get_sweep_status {}, cancel_sweep {session_id}. Responses {success,code?,message?,session?,server_time_ms,options?,preview?}. Start is idempotent by request ID. Worker RPC is server-secret protected, bounded batch, concurrency safe, and continues offline. Socket notification includes session/version; status RPC is recovery source. No local gameplay fallback.

Inventory and stamina mutation paths preserve reserved amounts. Ordinary clear rolls exclusive ticket outcomes 25% zero/60% one/15% two, never on sweep, never multiplied by grade/ads. Quantity floor(base_quantity*grade), min one only for an awarded positive item line; preserve item selection/drop probabilities. Sweep EXP is standard map hero/user EXP without first-clear bonus; modifier hook defaults to one. Configuration is snapshotted per session. Gold source counted once.

## Presentation

Home widget below rank, dialog filtered arc/stage/mode S, owned hero selector, inventory-framed previews, default min available stamina/tickets/config cap. Client locks all combat navigation while sweeping and before authoritative recovery. Mini-map uses AtlasRegistry backgrounds per arc, UiSkin controls, pooled hero run/attack and enemy run/death, 18 five-second encounters per 90-second round, boss last. Animation never grants rewards. Show progress/cancel/recovery and restore after reconnect.

## Acceptance

Old S/new A preserves best S and grants A quantities; exact-mode eligibility; strict HP boundaries; simultaneous combat/sweep has one winner; all combat routes blocked; worker pre/post-commit crashes; reconnect after missed notification; cancel at 90 seconds; reservations protected; final/cancel unlock; bounded-load processing without gameplay starvation. Backend build, client parser, static runners and focused integration tests required. Do not mark ACTIVE until evidence is recorded.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.2 | 2026-10-20 | Daily packs grant 5/15 sweep tickets; gem-only shop offer 20 per ticket and dedicated ticket filter. |
| 1.0.0 | 2026-10-20 | Initial grade, sweep, atomic activity exclusion, scheduler and UI contract. |

## Validation and acceptance

Gate score: 9/10. Backend build/packaging, full server static with PostgreSQL, native disposable Nakama concurrent HTTP tests, standalone client static, Godot parser, TestSweepService and full TestSweepUI interactions PASS. See [acceptance evidence](../STAGE_SWEEP_ACCEPTANCE.md). Production was not deployed. Bounded-load checks establish batch/deadline limits, not production latency guarantees. Optional legacy cross-repository projectile assertion remains separately recorded.

## Restart upgrade compatibility (1.0.1)

Startup upgrades an existing published release missing stage_sweep by appending an immutable copy containing only the validated versioned server sweep defaults. Preserve all existing published settings and never publish unrelated pending drafts. Add the missing campaign ticket idempotently, without changing existing catalog tuning or player data. Existing custom published sweep rules remain untouched. Bootstrap validation failures are explicit actionable errors, not silent generic retry loops. Regression: old release restart upgrades once; repeat restart creates no release; published custom rules and pending drafts preserved; client accepts the migrated snapshot.

Changelog 1.0.1 (2026-10-20): repair Loading after restart against pre-C144 releases and missing ticket catalog.

## Campaign ticket commerce

Daily small daily_deal grants5 campaign sweep tickets per claim; large flash_sale grants15, each with daily_pack_days30 metadata. New purchase snapshots inherit updated rewards; existing entitlements/pending orders keep their purchase snapshot. Huyen Thien Cac sells1 campaign_sweep_ticket for20 gems only under a dedicated Tickets category, item remains consumable with sweep/ticket tags. Server seed inputs own catalog prices; no client-local economic rules. Verify daily30-day totals150/450, replay/CAS and gem shop purchase/no gold offer.

## Card shop category correction (1.0.3)

Use cards as the shared offer category and The (Vietnamese card) as its player label. Remove tickets category. Ticket offer must exist in live server progression, not only seed input; gem view includes the same gem-only20/quantity1 offer. Seed the local targeted offer and item without replacing unrelated configuration. Reconnect reloads server catalog.

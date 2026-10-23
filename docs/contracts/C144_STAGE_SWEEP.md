# C144 Stage grades and campaign sweep

Version: 1.4.1 | Status: ACTIVE | Date: 2026-10-20

## Authority and schema

No Redis. Server configuration owns grading (S >90%, A >80%, B >70%, C >60%, D otherwise on victory), quantity multipliers 1/.9/.8/.7/.6, fixed base quantities, 90-second rounds, one campaign ticket plus one stamina per successful round. Defeat has no grade. Best grades are keyed by stage and difficulty; historical ungraded clears never imply S. Current run grade determines ordinary rewards; only exact S mode permits sweep. Training/admin stages excluded. Grading HP is the current defended objective: existing campaign has no separate base actor and defeats on player death, so use hero remaining HP/max HP. Future base-defense content must explicitly configure its objective. HP report must be bounded and bound to the active run; existing client combat authority limitations must be documented.

Authoritative player storage holds sweep state, reservations, round receipts and activity lock. All reward/resource/activity mutations use version-checked atomic storage batches, including the shared profile fence. No cross-store distributed transaction. Scheduler index is recoverable projection only. Account/server scoping follows C143. Server timestamps determine eligibility and cancellation; cancellation settles rounds due at or before server cancellation time, releases unused reservations and unlocks only after settlement. Retry cannot duplicate a receipt. A worker crash before commit changes nothing; after commit retries return committed results.

Session: {session_id,request_id,stage_id,level_id,hero_id,total_rounds,completed_rounds,started_at_ms,next_due_at_ms,status,cancel_at_ms?,reserved_tickets,reserved_stamina,config_snapshot,state_version,receipts}. Terminal states completed/cancelled; blocked errors retain explicit recovery/cancellation path. One active session per user. Shared profile activity excludes every combat entry, including tribulation/admin. Concurrent combat/sweep starts fence on the same version; no read-only lock check. Closing app never abandons sweep.

## RPC and interfaces

Authenticated, version/account guarded RPCs: get_sweep_options {}, preview_sweep {stage_id,level_id,hero_id}, start_sweep {stage_id,level_id,hero_id,rounds,request_id}, get_sweep_status {}, cancel_sweep {session_id}. Responses {success,code?,message?,session?,server_time_ms,options?,preview?}. Start is idempotent by request ID. Worker RPC is server-secret protected, bounded batch, concurrency safe, and continues offline. Socket notification includes session/version; status RPC is recovery source. No local gameplay fallback.

Inventory and stamina mutation paths preserve reserved amounts. Ordinary clear rolls exclusive ticket outcomes 25% zero/60% one/15% two, never on sweep, never multiplied by grade/ads. Quantity floor(base_quantity*grade), min one only for an awarded positive item line; preserve item selection/drop probabilities. Sweep EXP is standard map hero/user EXP without first-clear bonus; modifier hook defaults to one. Configuration is snapshotted per session. Gold source counted once.

## Presentation

Entry at CharacterSelect beside deploy for exact selected stage/mode S and owned hero. Quantity-only dialog retains that context; default min available stamina/tickets/config cap. Home widget below rank is visible only for active/recovering sessions. Client locks all combat navigation while sweeping and before authoritative recovery. Mini-map uses AtlasRegistry backgrounds per arc, UiSkin controls, pooled hero run/attack and enemy run/death, 18 five-second encounters per 90-second round, boss last. Animation never grants rewards. Show progress/cancel/recovery and restore after reconnect.

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

Daily small daily_deal grants5 campaign sweep tickets per claim; large flash_sale grants15, each with daily_pack_days30 metadata. New purchase snapshots inherit updated rewards; existing entitlements/pending orders keep their purchase snapshot. Huyen Thien Cac sells1 campaign_sweep_ticket for20 gems only under the shared cards category (player label: Thẻ), item remains consumable with sweep/ticket tags. Server seed inputs own catalog prices; no client-local economic rules. Verify daily30-day totals150/450, replay/CAS and gem shop purchase/no gold offer.

## Card shop category correction (1.0.3)

Use cards as the shared offer category and Thẻ as its player label. Remove tickets category. Ticket offer must exist in live server progression, not only seed input; gem view includes the same gem-only20/quantity1 offer. Seed the local targeted offer and item without replacing unrelated configuration. Reconnect reloads server catalog.

Documentation: [Vietnamese feature guide](../../../client/docs/STAGE_SWEEP.md), [backend operations](../../../server/docs/STAGE_SWEEP.md). Current UI/commerce sections supersede historical layouts described in earlier changelog entries.

## Completion reward visibility (1.0.4)
Stage-level config includes completion_loot derived server-side from the same sweepRewardTable used by combat settlement, at S/base quantities, plus ordinary-combat-only ticket outcomes. Existing raw loot tables remain intact. Training/admin have no ticket or fragment preview. Ticket row exposes quantity_outcomes [{quantity:0,probability:.25},{quantity:1,probability:.60},{quantity:2,probability:.15}] from published sweep rules, drop_rate=.75, min_qty=0,max_qty=2. Ticket rewards remain independently rolled once only on ordinary victory, outside grade/ads and never sweep. Fragment preview exposes effective unconditional probability group_drop_rate*weight/sum(weight), preserving the 70% group roll and conditional 85/15 tier, 75/25 element distribution for final campaign boss Legend only. Client displays server completion_loot without local gameplay rules, with quantity/probability tooltip. Regression: real local catalog roll simulations and server config/settlement shared reward table, no tickets for losses/training/sweep, no fragments on normal/epic/nonfinal.

### 1.0.4 verification
PASS backend build/canonical packaging, server static regressions (including exact ticket boundaries and shared fragment table preview), client static, Godot parser and TestCompletionPreview with an actual local server catalog snapshot. Read-only local catalog audit: 150 campaign stage/mode previews include tickets; exactly five final-stage Legend previews include 25 eligible H?/Trung fragment candidates with total unconditional drop probability 0.7. Stratified 10,000 ticket rolls yield 2500/6000/1500; 20,000 production fragment rolls on the live local catalog yielded 13,879 drops (69.395%). Native isolated Nakama/PostgreSQL integration PASS for migration/reseed/config, ordinary/sweep concurrency and settlement. Local runtime restarted and healthcheck PASS. No player inventory mutated by probability simulations. Completion loot is a server-derived read projection, not a duplicated writable loot table.

## Instant finish (1.4.0, 2026-10-20)
Double-click/tap minimap opens UiDialog confirmation after authoritative status refresh. Response instant_finish quote contains unit_cost_gems=5, remaining_rounds and cost_gems. Due rounds are free; charge only rounds not yet due at server request time. finish_sweep {session_id,max_cost_gems} rejects costs above consent, insufficient gems, cancellation and blocked sessions. Server settles ALL remaining rounds with normal ticket/stamina and reward rules in one version-checked profile/inventory/heroes transaction including gem debit. No partial debit/grant; concurrent worker/cancel/purchases serialize via CAS. Completed session replay returns success without recharging. UI blocks duplicates, binds confirmation to session, recovers uncertain responses and refreshes balance; no offline fallback.

Changelog 1.4.0: minimap instant finish confirmation, server quote at 5 gems per outstanding timed round, atomic settlement and replay protection.

Validation 1.4.0: backend build/packaging and both static runners PASS. Atomic runtime regressions PASS: 3-round completion, due-round exclusion, quote consent cap, insufficient gems, pre/post-commit crash replay and worker CAS race. Godot project parser and TestSweepUI PASS: single click ignored, double-click confirmation quote15, explicit confirmation only, duplicate submit blocked and widget hidden on completion. Full isolated native Nakama/PostgreSQL integration PASS. Local runtime restarted and healthcheck PASS; no production deployment. Gate score 9/10.

## Loading regression fix (1.4.1)
Completion-loot projection must reuse read-only SQL results within the single stage-level catalog request, rather than re-query the published config for every reward quantity. Cache scope is the current projection only, never cross-request or writable gameplay data. Preserve identical probability/quantity output and online-only admission. Verify actual saved-session bootstrap and get_game_config before accepting.

Validation 1.4.1: reproduced saved-session Godot get_game_config timeout before fix; now actual LoadingScreen reaches MainMenu successfully. Live catalog HTTP latency 0.672s, identical decoded catalog before/after fix. Regression with150 stage levels asserts one rules decode and no repeated SQL; backend build, both static suites and sweep runtime tests PASS. Rebuilt local runtime active. Separate existing missing Home texture assets/ui/ui.png warning does not block loading.

## Client lifecycle patch 1.4.3 (2026-10-23)
Home and StageSelect disconnect sweep callbacks on exit and guard late callbacks before accessing SceneTree. No backend API, balance or persistence change. Canonical client contract: ../client/docs/contracts/C144_STAGE_SWEEP.md.

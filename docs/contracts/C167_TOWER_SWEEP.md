# C167 Tower sweep and rewards

Version: 1.0.0
Status: IN_PROGRESS

This contract supersedes historical C160/C161/C166 statements that tower rewards
are preview-only, sweep is unavailable, and challenge does not consume an entry.

Extend C144 preview_sweep/start_sweep with {sweep_type:"tower",floor,hero_id,
rounds,request_id}; keep existing status/cancel/finish RPCs and worker. One
profile.sweep activity serializes campaign and tower with CAS, including combat.
Tower requires a cleared floor, an owned hero, one tower_sweep_ticket (consumable
atlas2), two stamina and one tower entry per round. Reserve the batch, debit only
settled rounds; cancellation releases the remainder. Five free entries daily at
UTC+7, existing cap20. Duration is system.tower_sweep.round_duration_ms=90000.
Reward items use repeat_rewards only; never first-clear bonuses on sweep.
EXP is ceil(next-level EXP * .005 * user level * floor /100 /5000)*5000,
resolved server-side at settlement for first/repeat rewards and preview. User
and selected hero gain EXP; EXP/Gold boosts apply. Missing rules fail closed.
Tower ticket boss-only ordinary victory drop: normal .05, epic .075, legend .10;
one ticket, separate from grade/ad bonuses and never recursive on sweep.
Receipts persist in the same transaction as inventory/profile/heroes/tower.
Client reuses quantity dialog and Home widget; town background and demon sprite.
No client grants/offline fallback. Test grant is scoped to the explicitly named
local account/character and has a durable idempotency marker.

## Verification (2026-10-22)

Docker build/canonical packaging, server/client static suites, tower status tests,
C167 compiled-runtime tests, Godot parser and TrialTowerUI pass. C167 tests cover
eligibility, shared session exclusion, quantity/duration, rounding, reservations,
90-second completion, stamina/entry/ticket debit, cancel/CAS, instant finish,
first-clear rewards and durable replay. Existing SweepUI assertions pass with
pre-existing missing MainMenu fixture-node errors; not claimed as a clean gate.
Local s001/g1 account lkvu92@gmail.com now has 1000 tower_sweep_ticket; re-running
the scoped sync tool preserves that count rather than granting another 1000.
Local content and immutable system config release synced. Runtime restart and
live acceptance deferred because that account has an unexpired tower combat run.
Production untouched. Full acceptance remains IN_PROGRESS until activation.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-22 | Shared tower sweep, dynamic EXP, entry costs and boss ticket drops. |

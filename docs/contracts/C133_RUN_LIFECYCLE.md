# C133 Run lifecycle

Version: 1.1.0 | Status: ACTIVE | Date: 2026-10-17

## Schema and RPC

`abandon_run` accepts `{run_id?: string, encounter_id?: string}` with at least one identity. It operates only on the authenticated account, validates all provided identities before mutation, and uses version-checked storage writes. A matching active stage becomes `abandoned` with `abandoned_at_ms`; terminal runs are idempotent. No stage rewards or stamina refund. A matching active tribulation is resolved as interrupted failure using existing attempt/EXP penalty rules, once. Response `{success, profile?, message?}`. A stale identity never abandons a newer run. Missing state or storage conflicts fail without local fallback.

`load_player_profile` accepts `fresh_login: boolean` (default false). Fresh login abandons an old active stage and recovers interrupted tribulation; ordinary refresh must preserve both. Client bootstrap clears stale local flags, then awaits fresh-login recovery. Explicit exit pauses simulation and awaits abandon_run before clearing client flags/changing scene. Failure retains run state and offers exit retry. Account/version guards apply. Existing completed victory/defeat settlement remains authoritative.

## Interfaces and acceptance

PlayerService.abandon_run(run_id, encounter_id); Main._on_main_menu_requested owns async exit; HUD cancellation resets its navigation guard on failure. Both stage and tribulation cancellation are safe to retry. Test normal exit, terminal/replayed/stale IDs, expired run, login recovery versus profile refresh, tribulation penalty once and transaction conflicts.

## C144 integration (2026-10-20)

C144 adds a shared version-fenced activity lock for every combat entry versus sweep. Abandon/fresh-login recovery clears combat activity only and preserves durable sweeps. Sweep completion/cancellation releases its own activity after atomic settlement; see C144_STAGE_SWEEP.md.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-20 | C144 stage grading, sweep and activity/reservation integration. |
| 1.0.0 | 2026-10-17 | Explicit abandon plus fresh-login recovery; preserve active runs during profile refresh. |

Local validation: backend build/packaging and compiled lifecycle tests pass, including stale/terminal/expired IDs, atomic conflict, penalty once and login versus refresh. Consumable, single-login and first-clear regressions pass. Godot actual exit failure/retry test and client static checks pass. Full server static runner still references pre-existing missing test_new_profile_inventory.cjs. No production runtime or player data changed by this implementation; updated server and client must both be rolled out.

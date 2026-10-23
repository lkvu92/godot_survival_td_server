# C160 Trial Tower Status

Version: 1.1.0
Status: ACTIVE

## Scope and authority

Authenticated, version-gated `get_trial_tower_status` RPC behind account and
character admission. No combat completion or sweep endpoint. Request accepts
only standard app/config/server/generation context; client cannot set progress.
Server DB content config `trial_tower` defines 20 floors, +10% stats per floor,
five tickets daily, cap 20. The JSON includes display-ready reward entries for
EXP, Gold, Gem, Pháp Tắc fragments and first-clear boost cards. The first floor
starts at 2,000,000 EXP, approximately five percent of the current Lv.30 user
level requirement; the reward curve increases to 5,500,000 EXP on floor 20.
Missing/invalid config returns failure; no local client gameplay fallback.

## Storage and response

Character-scoped `player_trial_tower/main`: `{highest_cleared:int,tickets:int,
last_ticket_day:int}`. Permissions read/write zero, optimistic version check,
three retries on competing writes. Initial status has zero clears and five
tickets. UTC+7 day boundaries; elapsed days grant five each up to cap. The day
marker advances even at cap, preventing banked overflow. Backward clock never
grants tickets. Fail closed on malformed persisted progress.

Response `{success:true,snapshot:{floors,highest_cleared,tickets,daily_tickets,
ticket_cap,server_time,next_ticket_at}}`, plus standard config_version envelope.
Each floor `{floor,stat_multiplier,first_rewards,repeat_rewards}`; each reward
currently exposes `{kind,amount?,item_id?,label}` for display. Status never grants
floor rewards and never modifies highest_cleared; settlement of this schema is
the next C161 implementation step. Failure `{success:false,code,
message}`. Data seeding uses the existing content_configs pipeline.

## Validation

Build runtime; test daily boundaries, skipped days, caps, concurrent requests,
invalid config/state, authentication and character storage isolation.

Validated: runtime build/postbuild, tower unit tests, isolated native Nakama
`test_multiserver_runtime.cjs --trial-tower-only`, seed CLI tests and client UI
checks pass. Tower-only config seeded to local development runtime. Full native
multi-server suite reaches mailbox checks and fails with CHARACTER_INCOMPLETE;
the tower assertions pass before that failure. No production deployment.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-22 | Added the 20-floor reward curve and structured display entries, including Pháp Tắc fragments and first-clear EXP/Gold boost cards. |
| 1.0.0 | 2026-10-22 | Authoritative tower status and daily ticket accrual. |

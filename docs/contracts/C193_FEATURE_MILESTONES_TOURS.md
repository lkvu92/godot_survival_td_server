# C193 Feature milestones and matching tours

Version: 1.0.3
Status: ACTIVE

## Config and authority

Server system.feature_unlocks adds mailbox (Lv1). Checkin2, daily_quests3,
shop4, sweep5, leaderboard10, elements15, talisman20, trial_tower25, laws30.
Daily quests route to the existing daily mission in EventsDialog; no invented
quest rewards. Laws displays Phap tac and retains the existing Than Luan screen;
progression.than_luan.unlock_level and validators become 30. Existing Epic10/
Legend22 and arc-clear predicates unchanged. Future guild_war, ancient_battlefield,
multiverse stay planned/disabled with null required levels and updated descriptions.
Server remains admission authority; existing earned rights remain durable.

## Tours and interfaces

Existing feature_unlocks state/RPC preserved; mailbox/daily tours added. Home
node tours resolve actual mailbox/checkin/daily/shop/leaderboard/elements/talisman/
tower/laws buttons. Sweep v2 is guided across scene changes: Home journey,
first campaign arc by order, its first stage, character selection, sweep button.
The final step is informational so a disabled button can be highlighted and
dismissed; it never starts a sweep. ACK only on full tour completion. Weak
scene targets and account/server scope cancellation remain. Tours never grant
stage access, S rank, EXP, tickets, stamina, items or rewards.

## Sweep UI and offline rules

Before feature unlock hide sweep button. After unlock show it on eligible
campaign character selection; disable unless owned hero, stage grade S, and no
combat exclusion. Tooltip explains S requirement. The same display applies on
the tour's last step. Existing server preview/start still enforces all rules.
C121 remote-only snapshot/auth required; disconnect blocks actions.
No new bitmap assets; AtlasRegistry/UiSkin used. Existing signal interfaces remain.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.3 | 2026-10-24 | During sweep tour select and center first campaign stage after layout; latest-unlocked focus must not override tour targets. No RPC/schema/offline changes. |
| 1.0.2 | 2026-10-24 | VPS deploy/up/start automatically publish seeded config before active compatibility verification; explicit seed remains draft-only. Publication failure aborts deployment success. |
| 1.0.1 | 2026-10-24 | Forward explicit local seed publication flags to seed_all; seed feature_unlocks and realm_milestones atomically from versioned JSON; reject unsupported arguments instead of silently retaining an old snapshot. |
| 1.0.0 | 2026-10-24 | Revise feature levels, expose mailbox/daily node tours and guided sweep route; align laws unlock to 30. |

Validation: runtime build/postbuild, full server static suite and client static
suite PASS. Explicit milestone map, mailbox/daily admission, durable rights,
atomic mails, fresh-character pending mailbox tour, laws Lv29/30 boundary and
Godot Than Luan parity PASS. Generic tours and actual seven-step sweep route
through ArcSelect/StageSelect/CharacterSelect PASS: disabled informational final
step, no underlying action, Lv4 hidden/Lv5 disabled/S enabled, no grants. Actual
Home construction resolves all nine node tour targets and disables all three
future features. Owned the CharacterSelect scroll helper across scene changes
and avoid recreating identical button fonts; clean route teardown PASS.
Gate score 9/10. No config publication, database update or runtime deployment.

1.0.1 validation: complete server static suite and 44 Python CLI regressions
PASS. Local seed --publish verified active release 12 (mailbox Lv1, laws Lv30).
Publication uses existing authenticated operator RPC and compatibility check;
no player/financial writes or production publication. Previous no-publication
statement records the 1.0.0 implementation only. Gate score 9/10.

1.0.2 validation: nine deployment shell integration tests PASS using synthetic
commands, including implicit publication for deploy/up/start, explicit flag
compatibility, quoted settings paths and failure propagation without a success
message or subsequent active check. Full server static suite and 47 CLI tests
PASS. No VPS connection or production publication performed. Gate score 9/10.

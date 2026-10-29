# C237 Bạch Hổ rework — local release53

Current1.8.1 supersedes the player-HP interpretation below: B04 uses Bạch Hổ
caster HP strictly below50% (self_hp_below/hp_below_pct), activates immediately
on nonlethal damage or before control/target gates, even through control.
Dedicated tests cover actual damage under stun/freeze/sleep/coma/paralysis/
silence/root, exact50% exclusion, healthy player, no-target physics fallback,
300s cooldown and all six expanding waves. Catalog/backend/SQL PASS.
Selective correction apply published54, backup
nakama/backups/C237-arc7-1793282464696.json. Subsequent verify sees55 with
zero differences, no pending settings, matching running build. No player writes.
Phoenix lethal passive now protected from action cancellation, with exactly
four expanding wave visuals and50% revival after4s through control. C112 source
lifetime regression also PASS; fixture shutdown warning remains documented.

Revision1.7.1 is a client presentation correction: separate B02 body aura from
Cuong Da seal and explicitly expand each of six wave visuals. HP threshold,
cooldown and server coefficients unchanged; local release53 remains valid.
Tiger regressions, Arc7 integration and client static pass. See six wave
captures and correction notes in the client acceptance report.

Authoritative generator and enemies.json now carry tiger_version=2 for all
five Bạch Hổ variants. C237 v1.7.0 documents coefficients, timers and defaults.
No base stats, population curves or other Arc7 boss definitions changed in this
rework. Client implementation, VFX and Godot evidence are in sibling
client/docs/reports/C237_tiger_rework/ACCEPTANCE.md.

PASS: deterministic catalog/idempotence, all-five-variant tiger coefficient
checks, Arc7 backend, npm build/packaging, isolated PostgreSQL compiled seed
roundtrip, dedicated Godot Tiger, Arc7 integration, client static. Mortal smoke
stage7_05 normal Hero3 Lv60 seed237 PASS; TIGER_REWORK_MORTAL.json is only one
case and does not establish broad balance. Vermilion behavior tests PASS with
shutdown leak warning. Full backend static stops at unrelated Arc6 unlock SQL
mock test_arc6_backend.cjs:67. Global static gate not claimed.

Selective local check found10 enemy/config differences and zero unpublished
unrelated settings. Apply published53 with backup
nakama/backups/C237-arc7-1793274790550.json; verify found zero differences.
Unrelated configuration preserved, no player writes, no production deployment.
No runtime restart: this release changes data; the local audit still reports
process start older than packaged build.

Defaults chosen where unspecified: bleed10% ATK/s, passive paralysis0.5s,
punch cadence0.2s, kick cadence0.25s. Passive HP trigger follows the requested
Hero/player HP, strictly less than50%, with300s cooldown unaffected by recovery.
Two speed buffs use the stronger value per stat. New harmful effects still land
after the one-time cleanse; passive waves continue while normal actions stop.

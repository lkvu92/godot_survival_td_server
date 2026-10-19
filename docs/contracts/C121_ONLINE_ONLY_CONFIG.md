# C121 Online-only gameplay configuration

Version: 1.0.2
Status: ACTIVE
Updated: 2026-10-19

## Authority and storage

Supersedes offline-first rules in older contracts and AGENTS.md per user request.
Server database is the gameplay configuration authority. Server data/ JSON is
seed/version-control input only. Client ships only data/atlas_registry.json (asset
presentation); no gameplay JSON, user fixtures, disk config cache, local skill
priority or recursive merges. Existing local economy/profile files are ignored.
Cosmetic settings and authentication tokens may remain on disk; run state is
memory-only and cannot resume across application launches.

## RPC schema

Authenticated get_game_config {table:"all",app_version,config_version} returns
schema_version:2 and arrays heroes,enemies,skills,items,arcs,stages,stage_levels,
cards,effects,talismans,enemy_skills,boss_skills; dictionaries progression,packs,
first_topup,daily_checkin,events,stamina,tribulation,vip,rewarded_ads.
Existing config-version metadata is retained. Extra catalogs enemy_skills,
boss_skills and the full tribulation configuration are DB-backed
game_content_configs payloads seeded explicitly by the server CLI.

## Client interfaces and lifecycle

DataRegistry starts empty. reload() clears memory; validate_remote_data(dict)
checks schema, catalogs, duplicate IDs and required dictionaries.
reload_from_remote(dict)->bool validates before publishing one complete snapshot;
failure clears readiness, never admits partial/local/stale data. is_ready()->bool.
Server sort_order maps to the client's existing order field without changing
values; talisman display_name maps to name. No balance is inferred from IDs.
ConfigService validates before marking content loaded; logout/account switch
clears settings/content memory. Fresh login and resume require server bootstrap.
Transport failure/disconnection pauses active gameplay and routes to loading
retry; invalid authentication routes to login. Periodic authenticated heartbeat
detects an otherwise silent disconnection. No offline economy fallback or local
settlement grants. Registration initialization belongs to load_player_profile.
New profiles start with an empty inventory. Loading an existing profile never
grants a talisman solely because the account has none; talismans remain available
through explicit reward and purchase flows. Existing owned items are preserved.

## Rollout and tests

Deploy/build server and seed its new content configs before releasing this client.
An old/incomplete server fails closed on the loading screen. No automatic live
DB mutation or production deployment is authorized by this code change.
Test empty/corrupt/partial payload, duplicate IDs, full roundtrip, remote removal,
authoritative skill values, disconnect/retry/account cleanup, blocked offline
actions and packaging absence. Build backend and run server/client static suites
and Godot headless runtime tests. No new assets or visual styles.

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-16 | DB-only gameplay catalogs, complete RPC, memory-only client snapshots and fail-closed connectivity. |
| 1.0.1 | 2026-10-16 | Stop granting Thanh Phong Kiem automatically during profile load. |
| 1.0.2 | 2026-10-19 | Remove reintroduced server-side Thanh Phong Kiem auto-grant from load_player_profile. A new inventory remains empty; an existing empty inventory stays empty; owned items are preserved. No client-minted item, offline fallback, or production data migration. |

Local acceptance: GATE 1 contract/index/registry complete; GATE 2 Nakama build
and Godot 4.6.3 scene compilation PASS; GATE 3 existing assets/skin preserved,
loading/retry integration retained; GATE 4 full client static/integration suite,
server static suite, eight CLI regressions, isolated PostgreSQL seed/RPC
roundtrip and Godot online-only runtime regression PASS. Gate score: 9/10.
Tests exercise startup empty, complete DB snapshot, removed records, malformed
and duplicate payloads, missing catalogs, remote skill authority, offline mutation
rejection, memory cleanup and rejection of disk run/profile state while keeping
cosmetic settings. Transport routing/account-generation guards are statically
checked; no live Nakama network-chaos, Android export or production deployment
is claimed. Export presets exclude development tests/fixtures.

Deployment order: build/restart backend, run seed_all.py --content-only, verify
schema-v2 authenticated get_game_config, then release client. Seeding is an
explicit operations step; these local tests did not modify production.
Server JSON remains versioned seed input only; no shared-data repository is
needed. Authenticated clients can inspect configuration received at runtime;
removing packaged JSON is not a secrecy guarantee.

# C119 Config and seed integrity

Version: 1.1.0
Status: ACTIVE
Updated: 2026-10-23

## Schema and interfaces

Add nullable columns for hero basic_attack_range; arc boss_skill_ids and
enemy_visual_scale_multiplier; stage boss_skill_ids, boss_skill_entry_indexes,
fragment_drop, spawn_sequence and stage_rules; card min_hero_level,
selection_weight, support_family and TEXT tier; talisman item_id, skill_id,
category, quality, stat_growth and durability/repair fields. Nullable additions
avoid overriding existing client fallback before reseeding. Skills preserve
extension fields in metadata JSONB, flattened by processSkill; canonical fields
take precedence. Existing aliases (order/name/createria_unlock) remain supported.

## RPC

seed_game_data request: {table, rows, replace_all?:boolean}; config uses
{table:"config",config_key,config_value}. Success: {success:true,table,inserted}.
Failure: {error:string}; malformed or invalid batches perform no writes.
Only HTTP-key calls without a user session or CONFIG_ADMIN_USER_ID may seed.
All writes in one seed request execute as one PostgreSQL DO statement/transaction;
separate requests are independent. Hero pruning and catalog deactivation require
replace_all=true. SQL values are safely dollar quoted inside the atomic block.

remote_settings rows: {module,key,value_type,value,is_active?,description?};
updates draft only. Publication remains a separate authenticated
publish_config_release admin call. No startup/normal seed enables ads/payments.
The operator supplies an explicit settings JSON file and optionally publication
credentials. Existing published snapshots are immutable. Verify seeded rows by
database readback in the same atomic request before success.

## Offline and presentation

No Godot/UI/assets change. Client local JSON fallback remains unchanged. Online
seeding failure exits nonzero, stops subsequent steps and never reports complete.
Scripts support endpoint configuration and timeouts; no live seed/deploy in tests.

## Acceptance

Build Nakama; test compiled RPC validation, mappings, atomic execution, zero
values, explicit replacement, metadata and draft-only remote settings. Test Python
failure propagation/publication with mocked HTTP. Run tests/run_static_tests.ps1.
Live PostgreSQL/production acceptance must be reported separately if unavailable.

Local acceptance: GATE 1 complete (contract/registry/index); GATE 2 backend build
PASS; GATE 3 not applicable (server-only, no presentation changes); GATE 4 server
static checks, seven Python CLI regressions and PostgreSQL 16 integration PASS.
Integration uses compiled RPCs with an SQL adapter against an isolated local
database: additive/idempotent migrations, every supplied config catalog,
metadata/field roundtrips, zero values, SQL-injection probes, permissions,
wave/catalog rollback via failure triggers, draft isolation and admin publication.
Gate score: 9/10. No live Nakama container, Android or VPS deployment acceptance
is claimed. No production database was seeded or flags enabled.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-23 | Persistent VPS publisher credential, required sweep validation, active release checks and actionable CLI errors. |
| 1.0.0 | 2026-10-16 | Preserve config fields, atomic validated seeding, explicit remote settings and reliable CLI. |

## VPS publication (1.1.0)

configure_runtime.py creates a persistent 256-bit publish credential in
nakama/<output>.publish-token (0600), injects CONFIG_PUBLISH_TOKEN into the
private runtime config and supplies it to the CLI through the environment.
Never commit, print or send it in command arguments. Rotation requires replacing
the token and recreating Nakama. HTTP-key plus this separate credential authorize
operator_config_release; user sessions are rejected on this endpoint. It bypasses
game session/version gates, while the existing UUID admin endpoint remains.
Request: {publish_token, check_active?:boolean, store_url?:string}.
Response: {status:ok,config_version} or {status:error,code,message}.
check_active is read-only. Publication requires valid tower_sweep and stage_sweep
using the runtime validators, plus existing typed checks; invalid drafts never
create releases. CLI errors show only sanitized server codes/messages. No offline
fallback, automatic draft publication or automatic monetization activation.
After startup and seeding, deploy checks the active snapshot and exits nonzero
if it is incompatible. This detects failure after startup; it is not a zero
downtime rollout or automatic rollback. Operators publish a reviewed valid draft.

Validation for 1.1.0: backend build and runtime packaging PASS; full server static
suite PASS, including 44 Python tests and operator authorization/publication
regressions. Gate score 9/10. PostgreSQL integration and live VPS rollout were
not executed for this revision. Presentation gate is not applicable.

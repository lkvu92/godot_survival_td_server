# C260 Development config policy

Version: 1.1.0 | Status: IN_PROGRESS | Updated: 2026-11-04

## Scope

Local development may disable application/config version compatibility checks
without disabling authentication, account/server scoping, schema/reference
validation or server-authoritative gameplay. Production remains strict.

The server-owned gate is `APP_ENVIRONMENT=develop` plus
`CONFIG_VERSION_CHECK_ENABLED=false`. Missing/unrecognized environments or flags
are strict. Production cannot disable checks even if the flag is false. A request
payload/client preference cannot opt into this policy. Local Compose defaults
the flag to false; setting it true restores strict behavior.

## Bootstrap and runtime

Authenticated get_config_bootstrap adds config_version_check_enabled:boolean.
In development live mode it reads active remote_config_settings directly,
skips app min/latest-version upgrade prompts and does not require publication.
It retains the current numeric release version (or 1 if no release exists);
that value is metadata, not a compatibility lock in this mode. Invalid data still
blocks admission. Production bootstrap/release behavior is unchanged.

Gameplay RPCs use the same per-request development settings snapshot; stale
start_stage config_version is allowed only in development live mode. The raw
runtime game tables remain the gameplay catalog source. C259 authoring mutations use a separate server-owned gate:
`APP_ENVIRONMENT=develop` and `CONFIG_DRAFT_LIVE_ENABLED=true`. After full
schema/reference validation, save/delete/normalize/import atomically update the
runtime projections with the draft. No enemy or config release is created.
Runtime identity is `draft:<revision>`; in-flight snapshots/resumes retain their
identity guards. Explicit publication still creates an immutable release.
Missing flags and production always retain draft isolation. Published enemy version/resume
identity and cross-read consistency guards remain intact.

Client honors the relaxed policy only when both its endpoint environment is
develop and authenticated bootstrap explicitly reports checks disabled. It
skips compatibility-version pinning/automatic version-triggered refresh, while
retaining online/session/scope and complete data validation. Before starting a
stage it reloads bootstrap and runtime catalog, so direct DB edits are visible
without publish/restart; failure blocks the request before stamina spending.
An in-progress match keeps its already compiled snapshot.

## Validation

Cover develop false/true, missing flags, production false, forged payload flags,
old/missing app/config versions, live settings without a release and per-request
caching. Verify runtime generation/scoping and schema validation remain required.
No production deployment or player/finance migration is part of this change.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-04 | Environment-scoped local live settings and relaxed compatibility version checks. |

| 1.1.0 | 2026-11-04 | Validated atomic C259 live draft projection, local only; explicit release checkpoints. |

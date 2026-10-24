# C198 Current hero skill documentation

Version: 1.0.1
Status: ACTIVE

## Scope and interfaces
Documentation-only consolidation for all five heroes. Canonical entry point is
docs/HERO_SKILLS_CURRENT.md with docs/heroes/HERO_1.md through HERO_5.md,
mirrored in client/server repositories. Tables derive from current server
skills.json, while behavior is checked against client implementation.
Existing JSON schemas, seed/auth/config RPC request/response payloads, methods
and gameplay values are unchanged. C121 online-only/no-fallback rules remain.
Assets are only documented through existing AtlasRegistry IDs/manifest paths;
no textures, UiSkin styling or signal wiring change.

## Precedence and incomplete configuration
Older design contracts and dated snapshots point to the current pages and
explicitly retain their historical role. Update hero contract patch versions,
Changelog, contract registry and docs index. Reconcile stale fixed-domain,
HP-poison, hero skill slot and golden-body immunity claims.
Hero4 skill4 combat gate remains10 in the docs because config is unchanged.
Hero5 skill2 rune_hp_percent is now confirmed at0.002/0.003/0.006/0.008/0.01
under C197 v1.1.1. No missing values remain. Server publication is separate.

## Acceptance
Check per-skill stat table fingerprints against all20 authoritative rows,
verify links/assets/metadata and mirrored current pages. Run both repository
static suites. Source hashes before/after must prove no gameplay edits.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-24 | Synchronize the five confirmed rune HP levels, removing pending notices. |
| 1.0.0 | 2026-10-24 | Consolidate current hero stats/behavior and distinguish historical docs and pending HP curve. |

Validation: PASS both complete repository static suites; checked40 skill sections (20 mirrored), every configured stat row and source fingerprint,54 relative page/source links, referenced PNG existence, revised contract/registry versions and unchanged gameplay source hashes. At documentation1.0.0, C197 awaited the HP curve; resolved by1.0.1. Gate score9/10. Documentation-only task complete; no seed/publication/deployment.


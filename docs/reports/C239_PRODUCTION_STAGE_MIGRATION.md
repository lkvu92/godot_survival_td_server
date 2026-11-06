# C239 1.7.1 — production campaign migration

Date: 2026-11-06. Authorized production rollout of the 70 canonical campaign stages.

## Applied content

Production initially had 72 legacy stages, 50 framework species, no imported C259 authoring rows and state revision 0. The rollout imported the target's current species, skills, enemy presentations and baselines; it did not copy the local database. The client-supported presentation source manifest was used for C259 asset registration.

The seven canonical `data/c239_arc*_migration.json` files supply 70 stages, 1,385 waves and 9,766 groups. Every group was checked against the production input for identical count, EXP, interval and start delay. Production stage header levels, required account levels, unlocks, loot and recommendations were preserved. Legacy boss selectors were cleared for these stages, and v2 rules/loadouts installed. `stage_0_1` and `stage_0_admin_test` remain unchanged legacy consumers. Runtime stays on the existing C239 v2 path; C269 scheduling requires a later explicit designer save/publication.

An atomic transaction imported the catalog, updated the stage rules and published the matching framework/waves through `enemy_catalog_publish`. CAS compared complete stage, wave, progression, enemy, catalog-state and latest config-release inputs. Publication completed as enemy release **2**, global config **21**, draft revision **2**. Release sequence 1 was consumed by the rolled-back production rehearsal, with no committed release 1.

## Verification

- `npm --prefix server/nakama run build`: PASS, including runtime packaging. No runtime restart or code deployment was required for this data rollout.
- `server/tests/run_static_tests.ps1`: PASS.
- `server/tests/test_enemy_framework.cjs`: PASS.
- Production-derived disposable DB test: **29,451 checks PASS**, including all 70 stage documents, 29,298 effective difficulty entries, apply/rehearsal rollback, stale-plan rejection and full content rollback restoration.
- Production transaction rehearsal: PASS, rolled back before the real apply.
- Committed DB readback: exact stage header preservation, canonical wave entries, unchanged compatibility waves and expected framework projection; 70 stages / 1,385 waves / 9,766 groups.
- Authenticated HTTPS Stage Designer overview: 70 stages. Stage-get opened a representative stage in each of all seven campaign arcs.

- Godot `TestEnemyCatalog.tscn`: **218 checks PASS**, including all 70 stages × three difficulties. The explicit compiler fixture combines the exact production post-readback stage/enemy/arc/progression content with an existing local full-config test envelope for unrelated tables. This is production-content compiler verification, not a successful authenticated production bootstrap.
- The authenticated public overview and seven stage-get checks succeeded during the first read-only maintenance pass. Full bootstrap was rejected by the per-login generation guard on that pass; a later read-only pass using the current generation could not finish because of VPS/network timeouts. No login/session state was modified.

During final verification, the VPS reported 7,875/7,953 MiB RAM used, only 77 MiB available, no swap, and load average 160.83. Nakama RSS was about 2 GiB. Subsequent SSH connections timed out before banner exchange. A Nakama-only recovery restart was attempted but had not executed as of the last confirmed SSH result. Treat service stability and the full authenticated bootstrap as pending until connectivity recovers. Do not attribute this host-wide incident to the migration without further evidence.

This report certifies content migration and compiler validation, not hero clear rates, mobile performance or stable production service under the observed host memory pressure.

## Backup and rollback

VPS package: `/opt/backups/c239-production-70-stages-20261106T065032Z/` (directory 0700, files 0600).

- `production-before.dump`: complete pre-rollout PostgreSQL custom-format backup, 780,044 bytes. SHA-256 `29fe2ed0dfbace719285d119e5eb1bea7eed8b80ef520c67f7ef9fca2d645856`.
- `before.json`, `apply.sql`, `rollback.sql`, `test-result.json`, `report.json`: target-derived recovery inputs, validated SQL and test evidence.
- `rollback.sql` is transactionally tested and guarded by draft revision 2, imported metadata identity and 70 v2 stage count. It restores legacy wave entries/rules/boss selectors, publishes the pre-migration content as a new release and restores the pre-import empty draft. Release/audit history remains intact. It does not restore the entire DB over player activity. If later admin changes occur, the guard stops rollback; reconcile them before constructing a new rollback plan.

Local evidence: workspace `tmp/production-stage-plan/`; initial and final content snapshots are `tmp/production-stage-before.json` and `tmp/production-stage-after.json`. Planner: `tools/plan_campaign_v2_rollout.cjs` (offline, no production connection).

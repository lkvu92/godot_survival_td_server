# C2391.6.1 — seed/loading repair

Confirmed03/11/2026. Local repair and reseed regression PASS; no production publication.

Godot log rejected the authenticated catalog with `Legacy stat/skill override in v2 entry`. Full generic seed had overwritten wave entries with legacy reference data while preserving v2 stage_rules on40 stages and clearing flags on other migrated arcs. Nakama remained healthy; client correctly refused the mixed catalog. This was a seed compatibility defect, independent of archive policy.

Restored all7 canonical migration catalogs using scoped local installers with backup/CAS/readback. Backups remain under workspace tmp/c239-arc1-local through tmp/c239-arc7-local, timestamp1793636162872 onward. No player/financial reset. Authenticated readback validates70 stages/1385 waves against canonical sources, and the real Godot DataRegistry accepts every stage/difficulty.

Generic legacy stage seed now preserves the whole deployed v2 stage, waves and extension fields. Response reports preserved_levelled; explicit v2 authoring is still allowed and rejects legacy modifiers in entry or difficulty overrides. An in-transaction row lock/recheck prevents a migration racing planner preflight from being downgraded. A preserved-only batch uses a valid SQL no-op checkpoint.

Actual `./server/deploylocal.ps1 seed --publish` rerun succeeded with config71, all70 migrated stages preserved. Authenticated readback and Godot validator PASS again after that exact command; invalid mixed v2 stages count0. account_deletion revision remains local-archive-v3-1. Draft settings were checked equal to active settings before the regression publish.

Tests: tests/test_levelled_seed_preservation.cjs on a disposable PostgreSQL schema covers repeated atomic bundle, extension preservation, explicit v2 update, invalid branch rejection and concurrent downgrade guard. Build + server/client static suites PASS. Client scene tests/TestRemoteCatalogLoading.tscn validates the authenticated RPC fixture; no gameplay fallback or relaxed validator.

Maintenance: legacy stages.json is reference input, not the editable source for deployed v2 campaign waves. Edit c239_arc*_migration.json through its canonical generator/installer, or send an explicit valid v2 seed row. A generic seed log saying Preserved is intentional, not a failed stage update.

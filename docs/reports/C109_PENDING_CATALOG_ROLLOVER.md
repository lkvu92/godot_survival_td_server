# C109 pending catalog rollover - 2026-11-04

VPS logs showed repeated create_purchase_order failures for gold_vault at
2026-11-03T18:23:42Z, including after a new session connected. The scoped
pending unique index rejected insertion because an older pending snapshot was
incompatible with the catalog pricing version. This confirms the checkout
failure; the exact origin of the reported client authentication wording was
not reproduced.

Local changes add catalog_retired to pending checkout eligibility and index
uniqueness. Outdated snapshots remain pending for original receipt recovery.
The API validates current reward/VIP configuration before retiring observed
old IDs, and catches concurrent unique conflicts as 409. Client monetization
calls now retain transport error code/message.

Validation passed: npm run build/runtime packaging, test_purchase_catalog_rollover,
test_store_platforms (including trusted receipt binding and restore),
test_daily_pack_rewards, test_run_lifecycle, client run_static_tests.ps1,
Godot 4.6.3 headless editor parse, and git diff --check.
PostgreSQL temp-table transaction verified retirement, unchanged old reward
snapshot, new checkout insertion and rejection of a second active checkout;
the transaction was rolled back. No production order or balance was changed.

Broader tests have unrelated failures: test_daily_pack_entitlements.cjs:60
returns error during daily reward claim; test_vip_benefits.cjs:72 lacks
talismanItemQuantity in its VM fixture. Neither failing path was modified.
Full Google Play payment acceptance has not been performed. Scoped gate score:
8/10; do not interpret this as a clean full regression suite.

Deployment is left to the user as requested. Build/deploy the local server
runtime and restart Nakama so its startup schema migration adds catalog_retired
and replaces the scoped pending index. No catalog reseed or player-data cleanup
is needed. The next checkout retires incompatible old snapshots automatically.
The client error-preservation change requires a new client build; the server
checkout fix works independently of that client release. Preserve unrelated
local item-admin changes when selecting deployment scope.

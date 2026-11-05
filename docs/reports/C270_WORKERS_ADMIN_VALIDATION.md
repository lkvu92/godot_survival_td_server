# C270 scoped verification

See ../../../../web_client/docs/WORKERS_ADMIN_DATA.md in the workspace for cause mapping, exact validation and rollout limits.

Backend compile/packaging PASS; tests/test_portal_admin.cjs PASS; tests/run_static_tests.ps1 PASS. Read models executed against deployed PostgreSQL through READ ONLY transactions and parsed by web Zod schemas. Admin guards reject before querying; bad pagination/sort/UUID reject; filters are parameters; currency decimal strings remain exact; reconciliation SQL equals tools/payment_reconciliation.cjs. Empty later users pages preserve total count.

Observed production state before changes: game_items had no active column, 72 stage headers / zero framework-v2 stages, zero support tickets, five heroes. Existing admin_order_* and related read RPCs were absent. No live schema/runtime deployment, reseeding, financial/account mutations or production login tests occurred. C270 remains IN_PROGRESS until deployment verification. New item column is additive default TRUE and will be installed by createGameConfigTables at runtime initialization.

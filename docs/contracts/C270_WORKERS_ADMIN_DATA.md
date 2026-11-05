# C270 Workers admin data compatibility
Version: 1.0.0
Status: IN_PROGRESS
Updated: 2026-11-06

## Scope and authority
Cloudflare Workers executes the web BFF without a filesystem or a localhost PostgreSQL service. Admin read models are fetched from Nakama with the signed administrator session. CONFIG_ADMIN_USER_ID is checked inside every RPC before any SQL. The BFF keeps CSRF, session expiry, Zod input/output validation, cancellation and the existing /ttl base path. No public arbitrary-SQL endpoint, service-key auth fallback or client gameplay JSON fallback.

## RPCs
- admin_portal_catalog_get {} -> {success,data:{heroes:array,enemies:array,skills:array}}. Database-authoritative catalog via processHero/processEnemy/processSkill; no seed-file reads or writes.
- admin_portal_users_list {search,server_id,email,phone,guardian_phone,name,id,status,profile_status,verify_status,page:1..100000,limit:5..100,sort_by,sort_order} -> {success,data:{users,pagination:{page,limit,total_count,total_pages},servers}}. Existing admin user list projections and filters, bounded text, parameterized SQL and allowlisted ordering. PII is admin-only, never exported to diagnostic logs.
- admin_portal_user_get {id:UUID} -> {success,data:{user,profile,inventory,characters}}. Existing admin-only account detail projection.
- admin_order_list {search,status,platform,date_from,date_to,cursor,limit:1..100} -> {success,data:{orders,stats,next_cursor,total_count}}. Ledger-backed read model with exact decimal currency strings. Cursor resolves (created_at,id); filters apply to all counts and aggregates. Unknown statuses remain visible as their raw status; UI must not relabel as successful.
- admin_order_get {order_id} -> {success,data:order with reward_snapshot,financial,timeline}. Only verified financial records are monetary amounts; no price guessed from rewards.
- admin_ad_reward_list {cursor?,limit?} -> {success,data:{sessions,total_count,next_cursor}}. No receipt/custom_data or token content.
- admin_reconciliation_report {} -> existing C244 report using published validated policy and the existing report SQL. No external financial/provider requests.

Errors: {success:false,code:400|403|404|422|503,message}. Missing policy/runtime produces an explicit error; UI must never substitute mock transactions or report mutation success. Financial compensation/void operations are NOT implemented by this read-only contract; existing settlement/fulfillment state machines remain unchanged. Legacy filesystem-based hero writes are rejected until a separately audited authoritative mutation exists.

## Schema migration
Add game_items.active BOOLEAN NOT NULL DEFAULT TRUE idempotently, matching existing admin item RPCs. Existing rows remain enabled. No seed, release, asset quantity, player profile or financial mutation.

## Presentation
Build-time image/atlas manifests are presentation-only. Assets are deployed as static Workers assets; runtime route reads ASSETS, never fs. No gameplay values are embedded as offline data. Campaign reports actual server state: 72 stages, zero v2 on the inspected deployment, so the Designer list is empty until its documented migration is performed. Support has zero tickets; display the explicit empty state, without manufacturing records or auto-migrating campaign content.

## Validation
Compile/package runtime; read-only SQL against deployed PostgreSQL; rejected non-admin and malformed requests; mocked upstream/BFF and browser UI checks under /ttl; no real grants/refunds or fabricated data. Production migrations/runtime updates must have backup and readback. Source implementation does not imply production publication.

Changelog 1.0.0: database-backed admin reads, missing item column migration, Workers presentation assets and explicit unsupported mutations.

Scoped verification: backend compile/packaging, static suite, C270 tests, production read-only SQL and response schema validation, six-page mocked browser tests on Next and Workers, image route and dry-run all passed. See docs/reports/C270_WORKERS_ADMIN_VALIDATION.md. Production rollout remains pending.

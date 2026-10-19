# C143 — Multi-server progression and lifecycle

Version: 1.5.2
Status: IN_PROGRESS  
Updated: 2026-10-19

## Scope

Implement [multi-server plan](../MULTI_SERVER_IMPLEMENTATION_PLAN.md), including generation-scoped progression, server validation before config, login-style selection UI, administration and test tooling. No production deployment or destructive production migration is implied by local implementation.

## Data and access

Nakama userId remains account identity. Character identity is (account_id, server_id); generation identifies reset incarnation. Registry stores state, revision, generation, admission settings and active operation. All progression access must have validated context; no implicit fallback. Shared account compliance and no-ads remain account-scoped; progression, VIP, daily packs and first topup are character-scoped. Defaults are provisional until product-policy review. Server-owned keys use server:generation namespace. Backend checks state and generation on each gameplay RPC. Existing active runs remain associated with their original server.

## RPC interfaces

Public authenticated: list_servers({}), list_my_characters({}), create_character({server_id,generation}), enter_server({server_id,generation}). Character/config requests carry server_id and generation; identity comes from authenticated context. Responses include success, code/reason on failure, server_id/generation where applicable. Missing/disabled/reset generation blocks bootstrap and gameplay.

Admin APIs and payloads, plan/execute protocol, lifecycle worker, exact ownership manifest, audit and retention follow section 15 of the plan. Admin auth is server-side. Dry-run cannot mutate gameplay. Destruction requires disabled/drained server, fresh plan and ownership verification. Financial dedupe and shared account data survive reset/delete. Callbacks retain original target generation.

## Client interfaces

Server cards show a large bold dark-gold start-aligned server number/name and a smaller end-aligned character name (first 10 Unicode characters plus "..." only when truncated) followed by " - lv. N", only for ready current-generation characters. list_servers returns created_at_ms, character_name and character_level from the authenticated account's current scoped profile, ordered by created_at DESC/server_id DESC. Missing character metadata is not replaced with account username. Selection styling and labels are centralized in UiSkin.

ServerService exposes list/select/validate/clear; NK transports context and rejects stale-context responses. Login -> ServerSelect -> Loading. Loading validates admission before ConfigService.bootstrap and load_all_config. Missing/invalid context returns to selection or retry. UI uses existing login assets via AtlasRegistry and centralized UiSkin.

## Store extension boundary (v1.1.0)

BillingService is a platform-neutral facade over a BillingProvider. Android verification remains supported; iOS uses an explicit unavailable provider until StoreKit/server verification and credentials are implemented. No Android mock path or Google Billing initialization on iOS release. Canonical catalog product IDs are independent of platform store SKU mappings. New generic iap_claim dispatch validates order platform before verification; legacy iap_google_claim remains Android-only. Order platform, store_product_id and target server/generation are immutable snapshots. Shared fulfillment logic cannot trust a client-provided verification result. Apple transaction dedupe and server notifications must reuse the original order target when implemented. iOS payment remains fail-closed; this change does not claim StoreKit support.

Config bootstrap accepts android/ios and selects platform-specific update URLs without sending an Android Play URL to iOS by fallback. Client sends its runtime platform.

## Migration and recovery

### Lifecycle API v1.2

`admin_server_plan` accepts server_id, action (reset/delete/cleanup), expected_revision, expected_generation and reason. Only disabled, drained servers may be planned. Cleanup explicitly names a retired generation. Response contains a persisted plan_id, manifest_hash, expiry, exact ownership inventory and financial blockers. `admin_server_execute` requires the same scope, plan_id/hash and request_id; replay cannot change payload. `admin_server_job` inspects; `admin_server_job_step` processes at most 100 exact versioned Storage objects. Reset retires the current character generation atomically and retains its snapshot; delete keeps the registry tombstone. Cleanup requires seven-day retention. No lifecycle action erases account identity, entitlement, financial ledger, token dedupe or config releases. Unknown scoped collections and unresolved financial delivery block execution. Enable is a separate action and cannot overlap a job.

Purchase limits, pending order uniqueness and first purchase are target scoped. Claim must match immutable order target; restores return that original target. Before a character grant, a durable unique token reservation binds receipt to exactly one order and generation. Google Play API must verify obfuscatedExternalProfileId against that order for multi-server production receipts; client receipt fields are not proof. A retired/disabled target cannot receive rewards and must be reconciled, never redirected. iOS remains unavailable until a real verifier is integrated.

`player_purchase_grants` is generation-scoped Storage, committed atomically with all character reward writes. `server_financial_inbox` retains original scope for delayed SSV and refund review. `admin_server_financial_list({after?})` returns up to 100 pending events; `admin_server_financial_retry({event_id})` retries only eligible original-target SSV. `admin_server_expire_pending({server_id,expected_revision,reason})` closes only expired unverified/unreserved orders and expired prepared ads on a drained disabled server. Store void tombstones survive absent/retired characters. Refund status, no-ads adjustment and review event commit atomically; consumable compensation is never guessed.

Job leases are not stolen on timeout. Offline recovery requires every runtime node stopped, followed by explicit lease clearance using the local operator tool; active writer counters must also be verified offline. This conservative recovery prevents an old worker deleting a board after another worker has enabled it.

Google consolidation preserves characters on non-overlapping servers. For overlapping servers, the selected account's character wins; inventories/resources are never added together. Both originals are archived before mutation. Consolidation of a conflicting character with paid purchase history is blocked pending an explicit compensation policy; non-overlap paid characters transfer with their original ledger targets. Review snapshots include characters and server revisions; confirm locks accounts and servers in sorted order, rejects active writers/lifecycle operations and revalidates all snapshots. Credentials and financial ownership move atomically; replay is idempotent. Reauthentication is mandatory.

Legacy data migrates only to S1 generation 1, with checkpoint/dry-run and before/after reconciliation. No automatic destructive startup migration. Old client mutation must fail closed at activation. Reset/delete jobs resume after failure and never erase financial history. No offline gameplay fallback.

The reusable migration CLI defaults to plan. Explicit environment, database identity, stopped-writer acknowledgement, verified custom-format backup and source plan hash are mandatory for apply, including localhost production tunnels. Production requires an additional acknowledgement; creating a script is not authorization to execute it. Backup and report artifacts contain private data and must stay outside version control. Plan binds database identity; apply validates known ownership and empty S1 destination, preserves legacy/account data, and records an atomic checkpoint. Accounts without an existing profile receive an S1 preference but no fabricated ready character; normal first entry initializes their character. Verify must fail its exit code if reconciliation fails. S1 remains disabled; feature activation is a separate operation.

## Acceptance

Seed supports `{table:"bundle",requests:[existing seed payloads...]}`: all requests validate/compile before one transaction executes under a shared advisory lock. A failed request or readback rolls back the complete bundle. Seed remains shared catalog/config only, never creates/resets registry, characters, storage, ledger or migration checkpoints. CLI loads every input before submitting a single bundle; no fallback to partial legacy seeding on unsupported runtime. Published releases/order snapshots remain unchanged unless explicitly published separately. Existing player data blocks destructive hero pruning; obsolete items remain for historical references. Deploy retains its explicit existing seed workflow. Tests must reseed twice after S1 migration and compare player/financial/registry/checkpoint data, plus inject a final-request error to prove no partial catalog writes.

Build runtime, Godot parse, repository static suites, cross-server isolation, callback routing, lifecycle concurrency/retry, migration reconciliation, UI selection/error recovery and load evidence must pass before ACTIVE. Incomplete capabilities remain documented and cannot be reported as completed.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.5.2 | 2026-10-19 | Include player_item_requests character-scoped idempotency records in repository, S1 migration and Google transfer; preserve original markers. |
| 1.5.1 | 2026-10-19 | Server list has_character is non-null boolean; client accepts only literal true and safely handles legacy null flags. |
| 1.5.0 | 2026-10-19 | Atomic full-run seed bundle, input preflight, reference-preserving prune guard and post-S1 reseed isolation tests. |
| 1.4.0 | 2026-10-19 | Two-column server cards, scoped character summary and newest-first server ordering. |
| 1.3.1 | 2026-10-19 | Dockerized migration operator with Bash entrypoint; VPS requires Docker/Bash only, Node and PostgreSQL clients remain inside tooling image. |
| 1.3.0 | 2026-10-19 | Reusable environment-gated S1 operator CLI, mandatory backup/target acknowledgement and reconciliation exit status; no production execution. |
| 1.2.0 | 2026-10-19 | Implement scoped IAP/VIP/ads, trusted restore, refund tombstones/inbox, multi-character Google consolidation, persisted lifecycle APIs and offline S1 migration tooling; keep production release gated. |
| 1.1.0 | 2026-10-19 | Platform-neutral billing/claim boundary, immutable order platform/target snapshots and iOS extension policy. |
| 1.0.0 | 2026-10-19 | Initial implementation contract and cross-repository integration boundary. |


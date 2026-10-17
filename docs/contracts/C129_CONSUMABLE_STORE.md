# C129 — Consumable shop and item-paid rename

- Version: `1.1.1`
- Status: `IN_PROGRESS`
- Date: `2026-10-17`

Canonical cross-repository specification: ../client/docs/contracts/C129_CONSUMABLE_STORE.md. Server owns catalog prices in progression.talisman_system.store.materials, accepts buy_material currency gold/gems, and atomically grants/debits with request IDs bound to item/currency. Slots 0–22 are registered; loot_magnet_talisman is excluded; wind/thunder/space fruit are disabled.

Rename is free once per account, then consumes exactly one rename_talisman atomically with profile and identity writes. Monotonic name_changes_used reconciles profile/identity maxima and is never clamped to one. Retry of the current name consumes nothing. UI inventory and profile refresh from authoritative responses; missing item/offline/validation/conflict cannot consume anything.

spirit_root_reset fully rerolls talent tier/score/main element/affinities server-side, retaining other progression; reject during active stage/tribulation and record request/result atomically. Other new item effects await gameplay activation, including EXP/Gold values not yet specified. No inferred reward values or offline grants.

Build and targeted catalog/config publication required; no live deployment or player reset is authorized by this implementation.

store_purchase protocol v2 requires {item_id,currency:gold|gems,request_id,purchase_protocol:2}; omission/unknown currency fails without mutation. Response echoes purchase_protocol, item_id and currency, including failures. Account/config gates apply; delegate to currency-aware talismanAction action=buy_material. New clients never use the legacy endpoint for material purchases; an old server cannot silently debit Gold for Gem. Packaging gate verifies Docker uses tracked data/local.yml and canonical data/build/index.js, not ignored legacy root local.yml. Init log announces store_purchase v2. Seed does not compile TypeScript; deploy/start/restart build and verify the runtime first under C131. No live mutation is authorized here.

| Version | Date | Change |
|---|---|---|
| 1.1.1 | 2026-10-17 | Align deployment instructions with C131 Docker runtime build. |
| 1.1.0 | 2026-10-17 | Strict currency protocol and canonical runtime packaging. |

Local verification: npm build/postbuild packaging gate and compiled store tests pass (explicit currencies, Gem-only fruit, dual-currency charms, replay/mismatch protection). Client real-service/transport-fake regressions pass. Update both client build and nakama/data/build/index.js; startup must log "Store purchase protocol v2 loaded". No live server inspection, deployment, seed or restart was performed.

Local backend build, name/consumable/password regressions and 14 Python tests pass. Targeted SQL generator: nakama/build_consumable_patch.cjs. Durable player_item_requests records commit atomically with purchase/reroll writes; invalid balances, mismatched request reuse, unsupported currencies/elements and CAS conflicts fail closed. Full server static runner still depends on the pre-existing missing tests/test_new_profile_inventory.cjs file. No live migration has run.

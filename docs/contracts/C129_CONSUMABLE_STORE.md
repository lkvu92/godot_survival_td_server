# C129 — Consumable shop and item-paid rename

- Version: `1.0.0`
- Status: `IN_PROGRESS`
- Date: `2026-10-17`

Canonical cross-repository specification: ../client/docs/contracts/C129_CONSUMABLE_STORE.md. Server owns catalog prices in progression.talisman_system.store.materials, accepts buy_material currency gold/gems, and atomically grants/debits with request IDs bound to item/currency. Slots 0–22 are registered; loot_magnet_talisman is excluded; wind/thunder/space fruit are disabled.

Rename is free once per account, then consumes exactly one rename_talisman atomically with profile and identity writes. Monotonic name_changes_used reconciles profile/identity maxima and is never clamped to one. Retry of the current name consumes nothing. UI inventory and profile refresh from authoritative responses; missing item/offline/validation/conflict cannot consume anything.

spirit_root_reset fully rerolls talent tier/score/main element/affinities server-side, retaining other progression; reject during active stage/tribulation and record request/result atomically. Other new item effects await gameplay activation, including EXP/Gold values not yet specified. No inferred reward values or offline grants.

Build and targeted catalog/config publication required; no live deployment or player reset is authorized by this implementation.

Local backend build, name/consumable/password regressions and 14 Python tests pass. Targeted SQL generator: nakama/build_consumable_patch.cjs. Durable player_item_requests records commit atomically with purchase/reroll writes; invalid balances, mismatched request reuse, unsupported currencies/elements and CAS conflicts fail closed. Full server static runner still depends on the pre-existing missing tests/test_new_profile_inventory.cjs file. No live migration has run.

# C159 — Consolidate fungible inventory stacks

- Version: `1.0.0`
- Status: `ACTIVE`
- Updated: `2026-10-21`

All catalog items except talisman/equipment instances are stackable up to 999999. Rune descriptions must no longer claim that they cannot stack. Existing instance-based talismans retain levels, rolled attributes, durability, instance identity and equipped state.

The one-time SQL migration locks catalog and Storage writes in one transaction, updates only stack-related catalog fields, and merges ordinary inventory entries in character-scoped keys. Legacy unscoped migration source remains untouched. Entries with extra metadata (expiry, instance identity or other state) remain unchanged. Compatible entries share item_id and have only item_id, quantity and optional acquired_at; merged stacks retain the earliest acquired_at. Split above the cap. Unknown IDs are not merged.

Validate per-owner/key/item quantity totals before and after, preserve all other entry data and inventory fields, update Nakama Storage versions, and record changed Storage snapshots in a restricted audit table. Dry-run rolls back all mutations. Repeated apply must be a no-op. Use storage write locks and version changes so concurrent runtime requests cannot overwrite consolidated state.

RPC interfaces and online-only behavior are unchanged. No currency, reward or progression mutation. No client-local gameplay catalog.

## Changelog

- `1.0.0` (2026-10-21): Increase fungible item caps, stack high runes, consolidate existing character inventory with conservation checks and an audit trail.

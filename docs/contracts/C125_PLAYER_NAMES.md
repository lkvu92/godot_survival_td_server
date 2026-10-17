# C125 — Player names and one-time rename

- Version: `1.1.0`
- Status: `IN_PROGRESS`
- Date: `2026-10-17`

1.1.0 supersedes the one-time-only policy below: one free rename per account since creation; later renames consume rename_talisman (Thẻ đổi tên) x1. Counter is the monotonic total, reconciled with MAX(profile, durable identity) and never clamped to one. Inventory/card debit, profile and identity commit atomically. Same-name retries never spend another card. UI refreshes authoritative eligibility on open, distinguishes free vs item-paid, displays owned cards and disables unavailable actions. C129 defines catalog/prices. Offline/validation/CAS/account switch cannot spend an item.

Google's Nakama username is an internal random identifier, separate from the game display name. On server profile bootstrap/repair, Google accounts with blank names or names equal to that generated username receive a persistent random game name `Tu Giả XXXXXX`. Email accounts use their registered username. Existing custom names remain unchanged. No local or hardcoded personal-name fallback.

`rename_player {display_name}` authenticated, account-guarded RPC accepts trimmed 3–24 Unicode characters, no control characters, zero-width formatting characters or markup delimiters. Returns `{success,display_name,name_changes_used:1}`. A profile may rename once, enforced by an atomic versioned storage batch updating the profile and a server-owned `player_identity/name {display_name,name_changes_used}` record. The identity record is authoritative even if delayed gameplay writes contain stale profile fields. Same-name retry after success is idempotent; invalid, unchanged-before-use, failed or concurrent rejected requests do not spend the chance. General profile saves cannot change display_name or name_changes_used. Merge conservatively preserves the maximum spent count in both identity and chosen profile. Names are display labels, not unique login identifiers; email/Google/user IDs remain unchanged.

Profile includes Đổi tên, remaining chance, input in shared Login skin and an explicit confirmation before mutation. Busy state prevents repeat/cancel. UI uses UiDialog/UiSkin/AtlasRegistry; text supports Vietnamese accents. Successful server response updates UserContext and Home/Profile via name_changed. Offline operations fail without modifying local identity. Unknown network result is resolved by reloading profile on retry; CAS/idempotency prevents double changes.

Validation: compiled backend tests for generation/preservation, validation, one-time/replay/CAS; Godot rename UI and profile display tests; build and static checks. ACTIVE only after required verification.

2026-10-16 verification: backend build and compiled-name tests pass; 42 globally registered RPC entrypoints and existing account-link regressions pass. Isolated PostgreSQL tests preserve spent rename quota for both merge winner choices. Rendered Godot rename flow passes explicit confirmation, pending prevention, display update and spent-chance state; UI visually inspected. Client static checks and 14 server Python tests pass. Full server runner still references the pre-existing missing test_new_profile_inventory.cjs. Backend deployed to VPS, DB/files backed up at /opt/thong-thien-lo/backups/player-names-20261016T143934Z; Nakama health 200 and rename_player registered. Existing profiles repair on next authenticated load. No real player rename chance was spent for validation; retain IN_PROGRESS pending live player acceptance. Provisional gate score 9/10.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-17 | One free rename, then consume one rename card; monotonic legacy quota reconciliation and item-aware UI. |
| 1.0.0 | 2026-10-16 | Persistent generated Google player names, account-owned display and one-time rename. |

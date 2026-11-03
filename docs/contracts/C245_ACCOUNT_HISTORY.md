# C245 Account history (B2)
Version 1.3.1; Status IN_PROGRESS.

C246 extension: verified records return paid_amount/currency/price_source/refunded_amount/financial_synced_at as decimal strings. Unknown metadata stays null. No token/buyer data returned. Changelog 1.1.0: verified financial fields.

Authenticated, current-login guarded account_history RPC, selected character admission required where multiserver is enabled. Client sends {limit?,cursor?,status?}; account identity always ctx.userId, never request user_id. Result {success,config_version,server_time,policy,summary:{resources,inventory_entry_count,activity_seconds,combat_seconds},transactions[],next_cursor}. Balances read through scoped player_profiles/player_inventory. Purchases are account-wide and show target server/generation so users do not confuse them with the selected character balance.

system.account_history policy schema1/revision/page_size/max_page_size/allowed_statuses/display_utc_offset_seconds; missing or invalid policy returns HISTORY_UNAVAILABLE without blocking gameplay. Status parameterized; limit bounded; cursor validated timestamp/reference keyset, latest created_at then reference DESC. Return only internal reference/product/platform/status/time/destination, paid_amount:null,currency:null,price_recorded:false when price is not stored. Do not infer paid amount from catalog/fallback price. Legacy purchases missing order remain visible as legacy references. No tokens/hashes/receipts/raw failure_reason or third-party account data.

Read-only: no profile repair, grants, purchases, accounting writes or time-budget renewal. No claim that this supplies full item/currency spending ledger (D2 prerequisite). Existing rows may change status during pagination; this is current status history, not immutable event export. All times UTC ISO; client uses configured offset for display. Profile and SQL reads are not one atomic cross-store financial snapshot; show refresh semantics.

Tests/evidence separate from live purchases and screenshot fixtures. No real-money transactions authorized by tests. Changelog 1.0.0: initial customer lookup API/UI, policies and evidence.


Changelog 1.2.0 (2026-11-03): client presentation uses inventory UiTiledBorderCard/UiPagination with cursor-backed page cache; server API unchanged, no total count promised. See client C245 contract and B2 card-pagination evidence.

Changelog 1.3.0: client implements parchment/jade mockup via existing UI utilities/assets, one requested transaction per portrait page; server API unchanged.

Changelog 1.3.1: client uses registered server header half-overlapping top border, TabUI balance title, larger icons and separate ScrollBarUI transaction viewport. Server protocol unchanged.

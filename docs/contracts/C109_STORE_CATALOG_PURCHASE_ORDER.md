# C109 Store catalog and purchase orders

Version: 1.1.1 | Status: ACTIVE | Updated: 2026-10-18

## Daily-tab reward correction and audit

1.1.1: `gem_sack` grants 1000 base Gems plus 1000 first-purchase bonus (2000 total on the first purchase). `gem_chest` grants 5000 Gems. `gold_vault` grants 1000000 Gold. Store descriptions match these grants. Cash prices, VIP EXP and existing immutable order snapshots are unchanged.

`flash_sale` replaces `reset_talisman` ×5 with `talisman_enhance_charm` ×1 and `element_enlightenment_charm` ×1. Gems ×300 and stamina ×50 stay as configured. Display descriptions and authoritative reward lines must agree. `daily_deal` remains gems ×100, gold ×10000 and stamina ×20.

Both products now activate a 30-day entitlement after verified purchase, with each reward line carrying `metadata.daily_pack_days=30`. The immutable order snapshot supplies the daily bundle. Old orders without this marker retain one-time fulfillment. Profile `daily_packs[product_id]` stores grant_id, started_at_ms, expires_at_ms, last_claim_day (-1 initially), rewards. Day index is floor((server_now-start)/86400000), valid 0..29. Day 0 is immediately claimable; missed days are not carried forward. A product cannot be bought while its entitlement is active. Different products coexist; expired products can be purchased again. This is a consumable purchase with a time-limited entitlement, not a recurring Google subscription.

`get_daily_pack_status {}` returns `{status:success,data:{user_id,server_time,packs:{product_id:{active,claimable,day,days_remaining,next_claim_at,expires_at}}}}`. `claim_daily_pack {product_id}` returns current status plus canonical profile/inventory after atomically storing profile resources/stamina, inventory rewards and last_claim_day using both storage versions. Repeated same-day claims return success/idempotent with no second grant; expired/not-owned/malformed/active-combat claims fail. No client rewards or clock are accepted. Profile refresh and all capped stamina sources preserve paid overflow; daily-pack stamina adds its full amount and regeneration stops above 30.

Authentication, account guards and config version gates apply to the new RPCs. A targeted catalog SQL generator updates only the two products and reward rows; existing PO snapshots and player balances are untouched. Production rollout requires the runtime, catalog patch and immutable config publication; no live changes are performed here.

## Local validation and rollout

Build runtime with `npm run build` in nakama. Run `node tests/test_daily_pack_entitlements.cjs`, `node tests/test_daily_pack_rewards.cjs` and `node tests/test_run_lifecycle.cjs`; client UI states are covered by TestDailyPackStates using server/data/packs.json as a test-only fixture. The full server static runner remains blocked by its existing missing test_new_profile_inventory.cjs dependency. No live Google Play transaction has been exercised in this change.

Generate the targeted SQL with `node nakama/build_daily_pack_patch.cjs` (reviewable local output: temp/daily-pack-30days.sql). Deploy the runtime, apply that catalog-only transaction, then publish a new immutable config release and ship the updated client. Do not use a full gameplay/player reseed. Existing verified one-time purchases are not automatically converted retroactively; old pending snapshots remain claimable, but are never reused for a newly advertised 30-day purchase.

| Version | Date | Change |
|---|---|---|
| 1.1.1 | 2026-10-18 | Increase Gem Sack base/first bonus to 1000 each, Gem Chest to 5000 and Gold Vault to 1000000; synchronize descriptions. |
| 1.1.0 | 2026-10-18 | Thirty purchase-relative daily claim windows, atomic rewards, repeat protection, shop claim states and paid stamina overflow preservation. |
| 1.0.1 | 2026-10-18 | Correct breakthrough pack charms and document one-time purchase versus missing recurring rewards. |

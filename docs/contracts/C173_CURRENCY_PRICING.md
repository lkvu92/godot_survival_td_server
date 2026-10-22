# C173 — Currency pricing at 250 Gold per Gem

- Version: `1.0.0`
- Status: `ACTIVE`
- Updated: `2026-10-22`

## Schema and prices
Existing server progression store materials and heroes.price remain authority.
No new exchange RPC: 1 Gem = 250 Gold is a valuation rule, not a reversible
currency exchange. Energy elixir (15 stamina): 40 Gem / 10000 Gold.
Hero 3: 400 Gem / 100000 Gold; hero 4: 2000 Gem / 500000 Gold.
Retain hero 2 level 15 / 250000 Gold. No new premium-only Gold offers.
Other existing dual-currency items already match 250:1 and remain unchanged.
Rename/reset/aptitude prices remain unchanged because no exact replacement
price was approved. No new IAP SKUs or disabled packs are activated.

## Pack rewards
gem_sack: 2000 Gem, +2000 first purchase. gem_chest: 10000 Gem total,
displayed as 8000 base +2000 bonus. gold_vault remains 1000000 Gold.
Money prices and platform SKU mappings remain unchanged.
daily_deal ($0.99): one-time 5 campaign tickets; 30 daily claims of
10 Gem +2500 Gold +5 stamina. Total valuation 1000 Gem.
flash_sale ($2.99): one-time 1 enhance charm +1 enlightenment charm;
30 daily claims of 30 Gem +5000 Gold +10 stamina +1 campaign ticket.
Total valuation 2860 Gem. Values use stamina=2 Gem/unit, ticket=20 Gem,
each charm=80 Gem. New rewards carry metadata.pricing_version=250001;
recurring lines additionally have daily_pack_days=30; immediate lines do not.

## Interfaces, delivery and compatibility
Existing create_purchase_order, receipt fulfillment, get_daily_pack_status,
claim_daily_pack RPCs remain; status adds a rewards array from the purchased
snapshot so active pack UI displays the old benefits until expiry. Recurring lines snapshot into profile
daily_packs on purchase; immediate item rewards use existing purchase mail.
Activation, mail and durable grant marker commit atomically. Retries cannot
duplicate bonuses or extend expiry. Claim paths read stored rewards, never
replace an existing entitlement with current catalog. Old paid order snapshots
remain valid. A new purchase must not reuse a pending order from another
pricing_version; old pending orders remain available for receipt recovery.
Legacy orders with no recurring metadata retain one-time fulfillment.
No player profiles, inventories, receipts or old orders are migrated.
Server catalog and client shop descriptions are derived from server data;
C121 requires authenticated configuration, no offline gameplay fallback.

## Changelog
- 1.0.0 (2026-10-22): Align selected prices, resource packs and monthly packs;
  support immediate purchase bonuses alongside immutable daily rewards.

## Acceptance
Nakama build and client/server static suites pass. Tests cover 250:1 prices,
pack totals, 30 daily claims, legacy one-time and monthly order snapshots,
pending catalog-version isolation, bonus-mail rollback and durable replay.
Godot TestDailyPackStates passes desktop/mobile state and legacy description
checks. No running server database or platform-console prices are modified.

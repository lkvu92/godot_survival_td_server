# C173 — Currency pricing at 250 Gold per Gem

- Version: `1.2.0`
- Status: `ACTIVE`
- Updated: `2026-10-30`

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

## 1.1.0 - Gold vault reward (2026-10-30)

gold_vault now grants 2,500,000 Gold per new verified purchase. Keep SKU/cash price and existing immutable paid-order/entitlement snapshots unchanged. Seed packs.json remains the authority; client reward list and slots render catalog rows. Publish catalog/config through the existing deployment process to activate. No local balance mutation or fallback per C121.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-30 | Set Gold Vault to 2.5M Gold. |

Validation v1.1.0: test_currency_pricing PASS with Gold Vault quantity 2,500,000; descriptions match. No catalog publication/deployment. The two daily-pack replacements await clarification of recurring vs instant delivery; existing daily data is unchanged so far.

## 1.2.0 - Exact user-approved daily bundles (2026-10-30)

Supersedes the earlier mixed instant/daily bundle definitions and C182 event-pack premium-card list for new purchases. Both 30-day products grant their entire configured list on each daily claim (including day 0), not additional instant purchase mail. daily_deal: 5 campaign_sweep_ticket, 50 gems, 25000 gold, 15 stamina. flash_sale: 1 talisman_enhance_charm, 1 element_enlightenment_charm, 1 exp_boost_card_10 (existing 24h EXP +10% item), 100 gems, 50000 gold, 30 stamina, 10 campaign_sweep_ticket. Remove the old six premium EXP/Gold boost cards from this pack. gold_vault remains 2500000 gold per purchase.

All three products and reward lines use pricing_version 250002, preventing reuse of an older pending snapshot for a new purchase. Existing paid orders and active purchased entitlement snapshots remain intact; no balance clawback or migration. Existing daily claim CAS, replay, 30-day duration, expiry, no catch-up and stamina storage cap stay unchanged. Catalog patch targets only these three products, then immutable config publication makes the UI and settlement consistent. No client grants or offline fallback (C121).

| Version | Date | Change |
|---|---|---|
| 1.2.0 | 2026-10-30 | Apply the exact 4-item/7-item daily bundles and 2.5M gold vault with new snapshot version. |

Validation v1.2.0: exact-list currency/catalog assertions, full 30-day daily entitlements (including all item counts), expiry/replay/CAS and legacy snapshots, consumable catalog, atomic daily-only purchase activation, Godot daily-card states and real scroll input PASS. Local selective sync --check/--apply/--verify PASS; published config 57 for daily_deal/flash_sale/gold_vault only, with unrelated catalog/settings preserved and no player writes. Rollback catalog backup: nakama/backups/C173-packs-1793300517598.json. GPU preview inspected: ../tmp/packages-daily-true.png. Client static PASS; full server static still stops at pre-existing Arc6 mock rejecting the campaign arc listing query (test_arc6_backend.cjs:67). No production publication.

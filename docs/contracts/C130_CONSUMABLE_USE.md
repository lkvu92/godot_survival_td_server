# C130 — Consumable use and permanent cultivation sources

- Version: `1.2.0`
- Status: `IN_PROGRESS`
- Date: `2026-10-17`

## Scope and authority
Complete C129 item activation without changing prices. Rename/reroll retain their dedicated actions.
Server-owned item attributes.effect define kind, value, duration, cooldown, element and radius.
Client never submits effect strength. use_consumable RPC is account-guarded; request:
{item_id, quantity:1..99, request_id, run_id?, paused:false, alive:true}.
Response: {success, duplicate?, inventory, profile, effect?, receipt_id, message?}.
Durable player_item_requests receipts bind action/item/quantity/run and are atomically written with versioned inventory/profile/run. Missing config/offline blocks use; no local consumption or gameplay fallback. Retry returns the same effect, applied once by receipt ID. Only quantity=1 is allowed in combat.

## Permanent sources
element_sources version 1 separates base, growth_per_level, growth_levels, tribulation and fruit.
element_affinities remains the materialized total consumed by combat/ranking. Reroll replaces base and growth only at the existing account level: base + level*growth + tribulation + fruit. Example 5+10*2=25 -> 10+10*3=40.
Root levels/profile.elements, hero upgrades, breakthrough history and permanent fruit/tribulation bonuses are never reset.
Legacy migration subtracts recorded breakthrough.history[].gains, separates the remaining innate budget using talent_score, and preserves any excess as unclassified permanent fruit-source points. Older histories without recorded gains cannot be reconstructed exactly: conservatively preserve their entire unclassified balance as permanent points before reroll. This intentionally favors preservation over removing an unknowable old innate portion. Legacy growth is zero until reroll; do not invent past growth. New history entries record exact gains.
All future level/tribulation/fruit changes update sources and totals together. Reroll uses main growth 3, secondary growth 2 points/account level by initial balance; config lives in progression.consumables. Values may exceed the 400 acquisition cap after reroll to preserve earned bonuses; fruit/tribulation only award positive remaining headroom.

## Initial balance
See ../items/CONSUMABLES.md. All unapproved numeric values are explicit initial balancing defaults, not derived from shop prices.
Unsupported wind/thunder/space fruit remain blocked; slot23 excluded.
Permanent items are blocked during active stage or tribulation. Full stamina, max level, capped affinity and ineffective heals do not consume.
EXP follows existing account progression and breakthrough gate, not in-run hero EXP.

## Battle UI/lifecycle
Left HUD vertical ScrollBarUI hosts inventory-style UiItemSlot rarity frames with bottom-right quantity (including 1), aligned to the opposite skill rail. The viewport fits at most six slots (fewer on short screens), with no horizontal scrolling. Restore the original hero HP bar offsets; item layout must not move the HP bar.
Tap uses one. Paused/dead/finished/offline/empty/unsupported items are disabled.
During a purchase/use network transaction temporarily freeze simulation; restore only the pause owned by that transaction, preventing death or manual pause racing a committed effect.
Combat effects use separate temporary modifiers; refresh duration without stacking; timers use simulation delta and stop on pause. Existing skill/card stats are never rewritten.
Revive is excluded from the living-item bar. On lethal damage in a normal stage, offer a dedicated confirmation before defeat settlement; one per server run, 50% HP and 3 seconds invulnerability. Cancel settles defeat. Tribulation consumables/revive remain disabled until a compatible authoritative run exists.
Run validates identity/status/expiry, cooldown and one-revive limit. As with existing talisman combat, HP/death are client-simulated, not server-authoritative; request state checks are not anti-cheat proof.

## Acceptance
Unit tests: migration, 25->40, repeated reroll preserves all sources/root levels, grants/caps, duplicate/mismatch/CAS, wrong run, cooldown, revive limit, failure no debit.
Godot: inventory dispatch, rarity/quantity bar, pause/death guards, modifier expiry, heal/shield/slow, mobile layout.
Build backend, client/server static checks. Additive config patch generator only; live deployment/config publish needs separate authorization.

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-17 | Left vertical item rail, maximum six visible slots, original HP placement. |
| 1.0.0 | 2026-10-17 | Full consumable activation, source-safe reroll and bottom battle item bar. |

## Verification and rollout (local, 2026-10-17)
- Backend build and compiled C130/C129/name/password regressions pass; 14 Python tests pass.
- Godot C130 tests pass: actual HUD attachment, original HP offset -152, left vertical rail aligned opposite skills with at most six visible slots, mobile fit, rarity/quantity, pause/death guards, damage/defense/crit/attack-cycle buffs, heal/shield/slow, expiry, receipt deduplication and run-state restore.
- Real-catalog shop/reroll-confirmation test and client standalone/C113 static checks pass.
- Full server static runner is blocked by its pre-existing missing tests/test_new_profile_inventory.cjs. C130 remains IN_PROGRESS until full gate/manual Android acceptance.
- Rebuild runtime with npm run build in server/nakama. build_consumable_patch.cjs now emits both item effects and progression.consumables via additive SQL. Generate/review SQL, apply it through the normal operator workflow, then publish an immutable config release. Do not reseed player data.
- No live runtime deployment, SQL application or config publish was performed.


## C144 integration (2026-10-20)

C144 adds campaign_sweep_ticket using consumable atlas index zero. Reserved sweep tickets/stamina cannot be consumed by other actions; profile and inventory writes use observed CAS versions. Ordinary exclusive ticket drops are outside grade/ad multipliers and never occur on sweep; see C144_STAGE_SWEEP.md.

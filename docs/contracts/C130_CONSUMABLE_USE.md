# C130 — Consumable use and permanent cultivation sources

- Version: `1.6.0`
- Status: `ACTIVE`
- Date: `2026-10-27`

## Scope and authority
Revision 1.6.0: healing consumables (combat kind `heal`) use a configured 5-second cooldown; other item cooldowns remain unchanged. Hero item buffs join the existing StatusIconStrip in campaign and tribulation through its external presentation provider, without applying duplicate gameplay statuses. Existing RPC request/response and DB schema are unchanged; server item effect data remains authoritative, missing config/offline blocks use.

Player exposes `get_consumable_status_presentations() -> Array`: distinct item IDs, AtlasRegistry item textures, remaining/duration in simulation seconds, priority 10, one nonstacking entry per active kind. Reuse refreshes duration; item shield presentation ends on depletion or expiry. Slow remains on affected enemies; instant healing does not become a timed gameplay status. Preview-only healing feedback may use the existing healing path. Restore retains lifetime metadata; legacy snapshots recover total duration from configured item data or remaining time. Shared strip binds the provider alongside the status controller and reads its current timer without owning another gameplay clock. Do not merge item DEF/shield into canonical skill statuses or change skill/item stacking.

Changelog 1.6.0 (2026-10-27): configured 5s healing cooldown and shared hero item-buff presentation with authoritative lifetime. Rollout requires updating game_items and publishing the normal immutable config snapshot; no live data changes are implied by source edits.

Client receipt API adds an optional third argument `apply_consumable_receipt(receipt_id, effect, item_id = "")` for presentation identity; two-argument callers and old run snapshots remain supported. `StatusIconStrip.bind_external_provider(Callable)` reads the actor's live presentation list alongside canonical statuses, preserving the four-icon cap. No extra status or timer is inserted into StatusEffectController.

Validation 2026-10-27: Godot TestConsumableUse PASS (buff refresh, no duplicate DEF, independent skill/item shields, depletion/expiry, original-duration rings, pause, restore and both HUD provider bindings); TestStatusIconBindings and TestTacticalSupport PASS; standalone client static PASS. Compiled server consumable tests PASS including exact 4999/5000ms boundaries, independent 15s buff cooldowns, replay and inventory debit in campaign/tribulation. Full server static runner stops at unrelated test_daily_pack_entitlements.cjs stamina expectation (200 actual, 330 expected). Headless checks do not replace device visual acceptance. Targeted patch: server/tools/sql/c130_healing_cooldown_5s.sql; not applied to a live DB and no config release published.

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

## Timed gameplay reward boosts

The consumable catalog includes EXP and Gold reward cards with multipliers
`1.10`, `1.25`, `1.50`, `2.00`, and `5.00`; every card lasts 24 hours. The
server owns their state at `profile.gameplay_boosts.{exp,gold}` as
`{multiplier,expires_at_ms}`. No client clock or multiplier is accepted.

Using the same multiplier extends the existing expiry by 24 hours per card.
An equal-or-lower incoming multiplier than an active card is rejected without
consuming an item. A stronger card requires a second identical request with
`confirm_replace:true`; that replaces the active card and starts its duration
from the authoritative server time. The first response returns
`BOOST_REPLACEMENT_CONFIRMATION_REQUIRED`, active and replacement data, and
does not consume the item.

Active EXP boosts multiply ordinary and first-clear account EXP when a stage
or sweep settles. Active Gold boosts multiply only Gold resource grants in
the same reward snapshot. They therefore also flow through an accepted
advertisement double-claim, because the ad multiplier acts on the already
settled snapshot. Expired/malformed boosts evaluate as `1.0` and never alter
rewards. Other resource rewards and exclusive drops remain unchanged.

## Battle UI/lifecycle
Left HUD vertical ScrollBarUI hosts inventory-style UiItemSlot rarity frames with bottom-right quantity (including 1), aligned to the opposite skill rail. The viewport fits at most six slots (fewer on short screens), with no horizontal scrolling. Restore the original hero HP bar offsets; item layout must not move the HP bar.
Tap uses one. Paused/dead/finished/offline/empty/unsupported items are disabled.
During a purchase/use network transaction temporarily freeze simulation; restore only the pause owned by that transaction, preventing death or manual pause racing a committed effect.
Combat effects use separate temporary modifiers; refresh duration without stacking; timers use simulation delta and stop on pause. Existing skill/card stats are never rewritten.
Revive is excluded from the living-item bar. On lethal damage in a normal stage, offer a dedicated confirmation before defeat settlement; one per server run, 50% HP and 3 seconds invulnerability. Cancel settles defeat. Tribulation consumables and inventory revive use the active authoritative breakthrough encounter; rewarded-ad revive remains normal-stage-only.
Run validates identity/status/expiry, cooldown and one-revive limit. As with existing talisman combat, HP/death are client-simulated, not server-authoritative; request state checks are not anti-cheat proof.

## Acceptance
Unit tests: migration, 25->40, repeated reroll preserves all sources/root levels, grants/caps, duplicate/mismatch/CAS, wrong run, cooldown, revive limit, failure no debit.
Godot: inventory dispatch, rarity/quantity bar, pause/death guards, modifier expiry, heal/shield/slow, mobile layout.
Build backend, client/server static checks. Additive config patch generator only; live deployment/config publish needs separate authorization.

| Version | Date | Change |
|---|---|---|
| 1.3.0 | 2026-10-22 | Added authoritative 24-hour EXP/Gold reward cards, duration stacking and stronger-card replacement confirmation. |
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

## Tribulation consumables v1.4.0

CombatItemBar resolves its combat identity to breakthrough.encounter_id during tribulation, otherwise server_run_id. The existing use_consumable request carries this identity in run_id (no new endpoint). The server requires in_tribulation=true, matching nonempty encounter_id and a finite positive started_at within one hour. It stores item_cooldowns and item_revives on breakthrough, reset when each encounter starts. Normal-stage IDs are rejected while tribulation is active. After settlement/expiry, new requests cannot debit inventory.
Inventory/profile/receipt writes remain atomic with profile CAS; no stage-run write is made for tribulation. Receipt replay stays idempotent. Combat effects and the one inventory-revive limit match normal stages; rewarded ads are unavailable in tribulation. Permanent items remain outside-combat-only. Client retains pause/dead/offline/finished guards and applies receipts once. No offline fallback or local debit.

| Version | Date | Change |
|---|---|---|
| 1.4.0 | 2026-10-25 | Enable encounter-bound combat items and one inventory revive in breakthrough; preserve cooldown, CAS and replay validation. |

Validation (2026-10-25): backend build/runtime packaging PASS; complete client and server static runners PASS (including 47 Python checks). Compiled consumable tests PASS for normal stages and all tribulation effects, wrong/expired/settled encounters, cooldown, replay, CAS rollback, revive limit and per-encounter reset. Godot headless C130 runtime PASS, including inventory-revive availability on desktop/mobile and disabled tribulation ad revive. Real viewport input PASS in campaign and tribulation, including scrolling and pause guard. Gate score: 9/10; live server/Android acceptance remains untested. No production deployment or config/data changes performed. Rebuild/deploy the backend runtime together with the updated client; existing item definitions require no reseeding.

## Quick stamina elixir v1.5.0

StaminaPurchaseDialog shows an inventory-first Thể Lực Đan option when owned, before ads and Gems. Initial quantity is min(2, inventory quantity), clamped to the current usable capacity (ceil((30-stamina)/effect.value)) and RPC limit 99. Minus/plus controls adjust quantity, with owned count and actual capped stamina gain preview. Full stamina/offline/missing or disabled effect blocks use. No second confirmation is needed. The dialog stays open after success and emits stamina_claimed with the authoritative gain so CharacterSelect/Home update immediately; starting a stage remains explicit.
Use calls existing UserContext.use_consumable(energy_elixir, quantity), without run_id. The existing server transaction owns inventory debit, stamina cap, replay and CAS; no local grant or new RPC. While any use/purchase/ad request is pending, all actions, quantity controls and dismissal are disabled; availability signals cannot re-enable them. Failure leaves quantity/retry identity intact. Options scroll within a viewport-fitted modal on short screens. Online-only rules and existing ad/Gem prices remain unchanged.

| Version | Date | Change |
|---|---|---|
| 1.5.0 | 2026-10-25 | Add quick inventory elixir use, quantity/default/gain preview and shared transaction guards to stamina dialog. |

Quick-use validation (2026-10-25): Godot fixture PASS for 0/1/2/8 stock defaults, quantity controls, capped gain at stamina=20, full/offline guards, concurrent-click suppression across availability refresh, failed request without debit and successful authoritative-state/claimed signal refresh. Production RPC call remains use_consumable; UI fixture substitutes its response without network/player mutations. Desktop/mobile and 420x600 geometry PASS; OpenGL rendered preview inspected at temp/quick-stamina-elixir.png. Existing stamina modal layering/close-reopen, System rewarded amount/quota UI, client static checks and compiled server consumable tests PASS. Gate score 9/10; live account/Android transaction not exercised. This addition requires only the updated client; no new backend/config deployment.
